import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {DecisionCanvasService} from '../lib/service.js';
import {fixture,note} from './helpers.js';

const source='.agents/notes/implemented/feature/2026-11-26-reference.md';
async function setup(t){
  const f=await fixture(t);await f.put(source,note('初始标题'));
  const service=new DecisionCanvasService(f.ctx);t.after(()=>service.dispose());
  const workspaceId='test-workspace';
  const context=await service.dispatch('open_context',{workspaceId});
  const graph=await service.dispatch('graph',{workspaceId});
  return {...f,service,workspaceId,...context,nodeId:graph.graph.nodes[0].id};
}
test('同项目的两个聊天和独立服务不共享引用，清空仅影响当前上下文',async t=>{
  const {service,workspaceId,contextId,nodeId,ctx}=await setup(t);
  const second=await service.dispatch('open_context',{workspaceId});
  await service.dispatch('set_references',{workspaceId,contextId,nodeIds:[nodeId,nodeId]});
  assert.deepEqual((await service.dispatch('references',{contextId})).nodeIds,[nodeId]);
  assert.deepEqual((await service.dispatch('references',{contextId:second.contextId})).nodeIds,[]);
  const otherService=new DecisionCanvasService(ctx);t.after(()=>otherService.dispose());
  await assert.rejects(otherService.dispatch('references',{contextId}),{code:'context-not-found'});
  await service.dispatch('set_references',{workspaceId,contextId:second.contextId,nodeIds:[nodeId]});
  await service.dispatch('set_references',{workspaceId,contextId,nodeIds:[]});
  assert.equal((await service.dispatch('references',{contextId,includeContent:true})).records.length,0);
  assert.equal((await service.dispatch('references',{contextId:second.contextId})).records.length,1);
});
test('引用读取最新来源，删除后显式返回缺失，不扩大检索范围',async t=>{
  const {service,workspaceId,contextId,nodeId,put,root}=await setup(t);
  await service.dispatch('set_references',{workspaceId,contextId,nodeIds:[nodeId]});
  const first=await service.dispatch('references',{contextId,includeContent:true});
  await put(source,note('更新后的标题','最新约束'));
  const latest=await service.dispatch('references',{contextId,includeContent:true});
  assert.equal(latest.records[0].title,'更新后的标题');assert.notEqual(first.records[0].sha,latest.records[0].sha);
  assert.equal(latest.sources[0].title,'更新后的标题');
  await rm(join(root,source));
  const missing=await service.dispatch('references',{contextId,includeContent:true});
  assert.deepEqual(missing.nodeIds,[]);assert.deepEqual(missing.missingNodeIds,[nodeId]);assert.equal(missing.sources,undefined);
  await assert.rejects(service.dispatch('set_references',{workspaceId,contextId,nodeIds:['unknown']}),{code:'unknown-node'});
});
test('页面切换项目后引用返回真实项目，其他上下文保持原项目',async t=>{
  const f=await setup(t),g=await fixture(t);await g.put(source,note('第二个项目'));
  const workspaces=[{id:'one',path:f.root},{id:'two',path:g.root}];
  const service=new DecisionCanvasService({workspaceRegistry:{get:id=>workspaces.find(w=>w.id===id)}});t.after(()=>service.dispose());
  const a=await service.dispatch('open_context',{workspaceId:'one'}),b=await service.dispatch('open_context',{workspaceId:'one'});
  const graph=await service.dispatch('graph',{workspaceId:'two'});
  await service.dispatch('set_references',{workspaceId:'two',contextId:a.contextId,nodeIds:[graph.graph.nodes[0].id]});
  const refs=await service.dispatch('references',{workspaceId:'one',contextId:a.contextId,includeContent:true});
  assert.equal(refs.workspaceId,'two');assert.equal(refs.workspacePath,g.root);assert.equal(refs.sources[0].title,'第二个项目');
  assert.equal((await service.dispatch('references',{contextId:b.contextId})).workspaceId,'one');
});
test('打包 CLI 在无依赖目录启动页面，request 与浏览器共享引用', {timeout:15000}, async t=>{
  const f=await fixture(t);await f.put(source,note('CLI 引用'));
  const entry=new URL('../dist/cli.mjs',import.meta.url).pathname;
  const child=spawn(process.execPath,[entry,'serve',f.root],{cwd:f.root,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}});
  const launch=await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n'))resolve(JSON.parse(output.split('\n')[0]));});child.on('error',reject);child.on('exit',()=>reject(new Error('server exited before URL')));});
  const url=new URL(launch.url);assert.equal((await fetch(url)).status,200);assert.equal((await fetch(new URL('/app.js',url))).status,200);
  const headers={'content-type':'application/json','x-canvas-token':new URLSearchParams(url.hash.slice(1)).get('token')};
  const call=async(action,input)=>{const response=await fetch(new URL('/api/decision-canvas.invoke',url),{method:'POST',headers,body:JSON.stringify({action,input})});return (await response.json()).result;};
  const graph=await call('graph',{workspaceId:launch.workspaceId});
  await call('set_references',{workspaceId:launch.workspaceId,contextId:launch.contextId,nodeIds:[graph.graph.nodes[0].id]});
  const request=promisify(execFile)(process.execPath,[entry,'request',launch.url,'references'],{timeout:5000});
  request.child.stdin.end('{"includeContent":true}');
  const {stdout}=await request;
  assert.equal(JSON.parse(stdout).records[0].title,'CLI 引用');
  assert.equal(JSON.parse(stdout).sources[0].title,'CLI 引用');
  await assert.rejects(stat(join(f.root,'.agents/canvas')),{code:'ENOENT'});
});

test('复制文本包含完整项目路径，多项目同名记录不会混淆',async()=>{
  const {referenceText}=await import('../src/client/reference-text.js');
  const records=[{title:'缓存\n约束',path:'.agents/notes/cache.md'}];
  assert.equal(referenceText('/项目 A/',records),'请参考以下决策记录：\n- 缓存 约束\n  /项目 A/.agents/notes/cache.md');
  assert.notEqual(referenceText('/项目 A',records),referenceText('/项目 B',records));
});
