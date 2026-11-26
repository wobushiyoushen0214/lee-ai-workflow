import test from 'node:test';
import assert from 'node:assert/strict';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyBoard,exportCanvas,projectedBoard,readBoard,validateBoard,writeBoard } from '../lib/board.js';
import { DecisionCanvasService } from '../lib/service.js';
import { decisionCanvasTool } from '../lib/tools.js';
import { fixture,note } from './helpers.js';

test('并发 CAS 只允许一方保存，另一方失败且不覆盖',async t=>{
  const {files}=await fixture(t);const graph={nodes:[{id:'a'}],edges:[]};
  const initial=await writeBoard(files,emptyBoard(),null,graph);
  const updates=await Promise.allSettled([writeBoard(files,{...initial.board,positions:{a:{x:1,y:2}}},initial.version,graph),writeBoard(files,{...initial.board,positions:{a:{x:3,y:4}}},initial.version,graph)]);
  assert.equal(updates.filter(r=>r.status==='fulfilled').length,1);assert.equal(updates.filter(r=>r.status==='rejected'&&r.reason.code==='conflict').length,1);
  assert.equal((await readBoard(files)).board.revision,2);
});
test('拒绝损坏画布、未知版本、无穷坐标与循环映射',()=>{
  assert.throws(()=>validateBoard({...emptyBoard(),schemaVersion:99}),{code:'unsupported-board'});
  assert.throws(()=>validateBoard({...emptyBoard(),positions:{a:{x:Infinity,y:0}}}),{code:'invalid-board'});
  assert.throws(()=>validateBoard({...emptyBoard(),nodeAliases:{a:'b',b:'a'}}),{code:'alias-cycle'});
});
test('确认改名后人工关系和坐标投影到新节点；导出过滤无效端点',()=>{
  const board={...emptyBoard(),positions:{old:{x:80,y:120}},pinnedNodeIds:['old'],nodeAliases:{old:'new'},manualEdges:[{id:'manual:1',source:'old',target:'other',relation:'extends',label:'后续策略',createdAt:'2026-11-06'}]};
  const projected=projectedBoard(board);assert.deepEqual(projected.positions.new,{x:80,y:120});assert.equal(projected.manualEdges[0].source,'new');
  const canvas=exportCanvas({nodes:[{id:'new',path:'new.md',lifecycle:'implemented'},{id:'other',path:'other.md'}],edges:[{id:'dangling',source:'new',target:'missing'}]},board);
  assert.equal(canvas.edges.length,1);assert.equal(canvas.nodes[0].type,'file');assert.equal(canvas.nodes[0].x,80);
});
test('Host 与 Agent 工具操作同一状态，生命周期移动不丢布局',async t=>{
  const {ctx,put,root}=await fixture(t);const service=new DecisionCanvasService(ctx,{maxWatchers:0});t.after(()=>service.dispose());
  const path='.agents/notes/proposed/feature/2026-11-06-a.md';
  await put(path,note('A').replace('Status: implemented','Status: proposed').replace('## Decision','## Proposal'));
  const first=await service.dispatch('graph',{workspaceId:'test-workspace'});const node=first.graph.nodes[0];
  const tool=decisionCanvasTool(service);
  const saved=JSON.parse((await tool.execute({action:'save_board',workspaceId:'test-workspace',input:JSON.stringify({board:{...first.board,positions:{[node.id]:{x:48,y:96}}},expectedVersion:first.version})})).json);
  assert.equal(saved.board.positions[node.id].x,48);
  await put('.agents/notes/implemented/feature/.keep','');
  await rename(join(root,path),join(root,path.replace('/proposed/','/implemented/')));
  const next=await service.dispatch('graph',{workspaceId:'test-workspace',force:true});
  assert.equal(next.graph.nodes[0].id,node.id);assert.equal(next.board.positions[node.id].x,48);
  await assert.rejects(service.dispatch('graph',{workspaceId:'unknown'}),{code:'workspace-not-found'});
});
