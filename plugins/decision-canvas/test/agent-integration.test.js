import test from 'node:test';
import assert from 'node:assert/strict';
import { symlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DecisionCanvasService } from '../lib/service.js';
import { WorkspaceFiles } from '../lib/workspace-fs.js';
import { startHttpServer } from '../lib/http-server.js';
import { scanWorkspace } from '../lib/graph.js';
import { fixture, localFs, note, proposal } from './helpers.js';

const sourcePath='.agents/notes/implemented/feature/2026-11-26-source.md';
async function setup(t) {
  const f=await fixture(t);
  const service=new DecisionCanvasService(f.ctx);
  t.after(()=>service.dispose());
  await f.put(sourcePath,note('缓存策略'));
  return {...f,service,workspaceId:'test-workspace'};
}

test('自定义 lee-ai-workflow 路径与 report.md 证据入口，提案保存到配置目录',async t=>{
  const {files,put,service,workspaceId}=await setup(t);
  await put('workflow.config.json',JSON.stringify({notes_dir:'decisions',evidence_dir:'evidence',evidence_readmes:['report.md'],releases_dir:'releases'}));
  await put('decisions/implemented/feature/2026-11-26-custom.md',note('自定义目录','[证据](../../../evidence/case/report.md)'));
  await put('evidence/case/report.md','# 验证结果\n\n通过');
  await put('releases/1.0.md','# 发布说明');
  const index=await scanWorkspace(files);
  assert.equal(index.snapshot.stats.decisions,1);
  assert.equal(index.snapshot.stats.documents,3);
  assert.equal(index.snapshot.edges.length,1);
  assert.deepEqual(new Set(index.snapshot.nodes.map(n=>n.kind)),new Set(['decision','evidence','release']));
  const result=await service.dispatch('save_proposal',{workspaceId,content:proposal('可验证的方案'),category:'feature',slug:'custom'});
  assert.match(result.path,/^decisions\/proposed\/feature\//);
});

test('两个独立文件适配器并发保存只允许一个成功',async t=>{
  const {files,root}=await fixture(t);
  const second=new WorkspaceFiles(localFs(),root);
  const created=await files.write('shared.json','original',null);
  const results=await Promise.allSettled([files.write('shared.json','first',created.version),second.write('shared.json','second',created.version)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='conflict').length,1);
});

test('配置拒绝越界目录和外部符号链接',async t=>{
  const {files,put,root}=await fixture(t);
  await put('workflow.config.json',JSON.stringify({notes_dir:'../outside'}));
  await assert.rejects(scanWorkspace(files),{code:'outside-workspace'});
  await put('workflow.config.json',JSON.stringify({notes_dir:'escape'}));
  await symlink('/etc',join(root,'escape'));
  await assert.rejects(scanWorkspace(files),{code:'outside-workspace'});
});

test('冻结来源、版本回填、提案引用转换与并发重复保存',async t=>{
  const {service,workspaceId,files}=await setup(t);
  const run=await service.dispatch('prepare_analysis',{workspaceId,mode:'propose',query:'缓存策略',scope:'workspace'});
  assert.equal(run.status,'awaiting_agent');assert.equal(run.sources.length,1);assert.ok(run.prompt.includes('[S1]'));
  await assert.rejects(service.dispatch('complete_analysis',{workspaceId,id:run.id,output:proposal(),expectedVersion:'wrong'}),{code:'conflict'});
  const complete=await service.dispatch('complete_analysis',{workspaceId,id:run.id,output:proposal(),expectedVersion:run.version});
  assert.equal(complete.status,'completed');
  const saves=await Promise.allSettled(['a','b'].map(slug=>service.dispatch('save_proposal',{workspaceId,runId:run.id,content:complete.output,category:'feature',slug})));
  assert.equal(saves.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(saves.filter(r=>r.status==='rejected'&&r.reason.code==='already-saved').length,1);
  const saved=saves.find(r=>r.status==='fulfilled').value;
  const content=(await files.read(saved.path)).content;
  assert.ok(content.includes('../../implemented/feature/2026-11-26-source.md'));
  assert.ok(!content.includes('[S1]'));assert.match(content,/Status: proposed/);
});

test('来源变化、未知引用和取消后的回填都被拒绝',async t=>{
  const {service,workspaceId,put}=await setup(t);
  const prepare=()=>service.dispatch('prepare_analysis',{workspaceId,mode:'ask',query:'缓存',scope:'workspace'});
  const first=await prepare();
  await assert.rejects(service.dispatch('complete_analysis',{workspaceId,id:first.id,output:'结论 [S99]',expectedVersion:first.version}),{code:'unknown-citation'});
  await put(sourcePath,note('更新后的缓存策略'));
  await assert.rejects(service.dispatch('complete_analysis',{workspaceId,id:first.id,output:'结论 [S1]',expectedVersion:first.version}),{code:'stale-context'});
  const second=await prepare();
  const cancelled=await service.dispatch('cancel_ai',{workspaceId,id:second.id,expectedVersion:second.version});
  await assert.rejects(service.dispatch('complete_analysis',{workspaceId,id:second.id,output:'结论 [S1]',expectedVersion:cancelled.version}),{code:'run-finished'});
});

test('分析在另一个服务进程重开后仍可完成，重复 ID 不混用问题',async t=>{
  const {service,ctx,workspaceId}=await setup(t);
  const run=await service.dispatch('prepare_analysis',{workspaceId,mode:'ask',query:'缓存',id:randomUUID()});
  const second=new DecisionCanvasService(ctx);t.after(()=>second.dispose());
  const reopened=await second.dispatch('ai_run',{workspaceId,id:run.id,includePrompt:true});
  assert.equal(reopened.prompt,run.prompt);
  await assert.rejects(second.dispatch('prepare_analysis',{workspaceId,mode:'ask',query:'不同问题',id:run.id}),{code:'run-exists'});
  assert.equal((await second.dispatch('complete_analysis',{workspaceId,id:run.id,output:'按章节缓存 [S1]',expectedVersion:reopened.version})).status,'completed');
});

test('通用 Agent 版本继续读取和完成早期 Codex 分析记录',async t=>{
  const {service,workspaceId,files,put}=await setup(t);
  const run=await service.dispatch('prepare_analysis',{workspaceId,mode:'ask',query:'缓存'});
  const path=`.agents/canvas/runs/${run.id}.json`;
  const record=(await files.readJson(path)).value;
  await put(path,JSON.stringify({...record,engine:'codex-conversation',status:'awaiting_codex'}));
  const reopened=await service.dispatch('ai_run',{workspaceId,id:run.id});
  assert.equal(reopened.status,'awaiting_agent');
  const result=await service.dispatch('complete_analysis',{workspaceId,id:run.id,output:'保留缓存约束 [S1]',expectedVersion:reopened.version});
  assert.equal(result.status,'completed');
});

test('HTTP 页面可加载，接口要求令牌并拒绝跨站和任意路径',async t=>{
  const {service,workspaceId}=await setup(t);
  const web=await startHttpServer(service);t.after(()=>web.close());
  const page=await fetch(web.origin);assert.equal(page.status,200);assert.match(await page.text(),/决策画布/);
  const invoke=(headers={})=>fetch(`${web.origin}/api/decision-canvas.invoke`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action:'graph',input:{workspaceId}})});
  assert.equal((await invoke()).status,403);
  assert.equal((await invoke({'x-canvas-token':web.token,origin:'https://example.org'})).status,403);
  const graph=await (await invoke({'x-canvas-token':web.token})).json();assert.equal(graph.result.graph.stats.decisions,1);
  assert.equal((await fetch(`${web.origin}/package.json`)).status,404);
});

test('打包 MCP 实际握手、工具发现、工作区检索和右侧页面 URL',async t=>{
  const {root,put}=await fixture(t);await put(sourcePath,note('MCP 决策'));
  const client=new Client({name:'canvas-test',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[new URL('../dist/mcp.mjs',import.meta.url).pathname],stderr:'pipe'});
  t.after(()=>client.close());
  await client.connect(transport);
  const catalog=await client.listTools();assert.equal(catalog.tools[0].name,'decision_canvas');
  async function call(action,workspaceId,input={}){
    const result=await client.callTool({name:'decision_canvas',arguments:{action,...workspaceId?{workspaceId}:{},input}});
    assert.notEqual(result.isError,true,JSON.stringify(result));return JSON.parse(result.content[0].text);
  }
  const {workspace}=await call('add_workspace',undefined,{path:root});
  const graph=await call('graph',workspace.id);assert.equal(graph.graph.stats.decisions,1);
  const {url}=await call('open_ui',workspace.id);assert.ok(url.includes('#token='));assert.equal((await fetch(url)).status,200);
  const bad=await client.callTool({name:'decision_canvas',arguments:{action:'document',workspaceId:workspace.id,input:{path:'../outside'}}});assert.equal(bad.isError,true);
});
