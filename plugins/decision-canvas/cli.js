#!/usr/bin/env node
import { resolve } from 'node:path';
import { DecisionCanvasService } from './lib/service.js';
import { startHttpServer } from './lib/http-server.js';

const [command = 'serve', ...args] = process.argv.slice(2);
const service = new DecisionCanvasService();
const assetRoot = new URL('./', import.meta.url); // Built CLI lives beside browser assets.
try {
  if (command === 'serve') {
    let port = 0; const paths = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--port') port = Number(args[++i]);
      else paths.push(resolve(args[i]));
    }
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口无效');
    for (const path of paths) await service.dispatch('add_workspace', { path });
    const web = await startHttpServer(service, { port, assetRoot: new URL(import.meta.url).pathname.endsWith('/dist/cli.mjs') ? assetRoot : new URL('./dist/',import.meta.url) });
    const workspaceId = service.ctx.workspaceRegistry.list()[0]?.id;
    const context = workspaceId ? await service.dispatch('open_context',{workspaceId}) : {};
    console.log(JSON.stringify({ ...context, url: web.url(workspaceId,context.contextId), workspaces: service.ctx.workspaceRegistry.list() }));
    const close = async () => { await web.close(); await service.dispose(); process.exit(0); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
  } else if (command === 'request') {
    const [address,action] = args;
    const url = new URL(address);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('只允许画布返回的本地 URL');
    let body = ''; for await (const chunk of process.stdin) { body += chunk; if (Buffer.byteLength(body)>2*1024*1024) throw new Error('输入超过 2 MB'); }
    const input = {workspaceId:url.searchParams.get('workspace'),contextId:url.searchParams.get('context'),...(body.trim()?JSON.parse(body):{})};
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    const response = await fetch(new URL('/api/decision-canvas.invoke',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','x-canvas-token':token},body:JSON.stringify({action,input})});
    const envelope = await response.json(); if(!response.ok||!envelope.ok) throw new Error(envelope.error?.message||'请求失败');
    console.log(JSON.stringify(envelope.result)); await service.dispose();
  } else if (command === 'invoke') {
    const [path, action] = args;
    if (!path || !action) throw new Error('用法：node cli.js invoke /absolute/project action < input.json');
    let input = ''; for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 2 * 1024 * 1024) throw new Error('输入超过 2 MB'); }
    const { workspace } = await service.dispatch('add_workspace', { path: resolve(path) });
    console.log(JSON.stringify(await service.dispatch(action, { ...(input.trim() ? JSON.parse(input) : {}), workspaceId: workspace.id })));
    await service.dispose();
  } else throw new Error('支持 serve、invoke 和 request 命令');
} catch (error) { console.error(error.message); await service.dispose(); process.exitCode = 1; }
