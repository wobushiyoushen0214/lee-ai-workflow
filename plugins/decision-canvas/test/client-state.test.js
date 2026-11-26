import assert from 'node:assert/strict';
import test from 'node:test';
import {createLoadGate, filterGraph, groupByDate, getGraphEmphasis} from '../src/client/view-model.js';

test('慢扫描期间轮询复用请求，不会让成功响应持续过期；新世代独立读取', async () => {
  const load = createLoadGate(); let resolve, calls = 0;
  const first = load('workspace:1', () => {calls++; return new Promise(done => {resolve = done;});});
  await Promise.resolve();
  for (let i = 0; i < 5; i++) assert.equal(load('workspace:1', () => {throw new Error('must deduplicate');}), first);
  assert.equal(await load('workspace:2', async () => 'new workspace'), 'new workspace');
  resolve('slow graph');
  assert.equal(await first, 'slow graph'); assert.equal(calls, 1);
  assert.equal(await load('workspace:1', async () => 'updated graph'), 'updated graph');
});

test('失败的扫描释放请求，允许手动重试', async () => {
  const load = createLoadGate();
  await assert.rejects(load('workspace', async () => {throw new Error('offline');}), /offline/);
  assert.equal(await load('workspace', async () => 'recovered'), 'recovered');
});

test('手动刷新等待旧轮询结束后读取新状态，不复用修改之前的图', async () => {
  const load = createLoadGate(); let resolve;
  const poll = load('workspace', () => new Promise(done => {resolve = done;}));
  await Promise.resolve();
  const refreshed = load('workspace', async () => 'after modification', true);
  resolve('before modification');
  assert.equal(await poll, 'before modification');
  assert.equal(await refreshed, 'after modification');
});

const record = (id, date, lifecycle = 'implemented', kind = 'decision') =>
  ({id, date, lifecycle, kind, category: 'feature', title: `中文长标题 ${id}`, searchText: '备选方案与验证'});
const graph = {nodes: [record('a', '2026-11-06'), record('b', '2026-11-08', 'proposed'), record('c', '2026-11-07'), record('evidence', '2026-11-08', 'document', 'evidence')]};
const edges = [{source: 'a', target: 'b'}, {source: 'b', target: 'c'}, {source: 'b', target: 'evidence'}];
const defaults = {materials: false, selectedIds: []};

test('组合筛选只保留可见端点，关联聚焦保留选中记录与一跳邻居', () => {
  const focused = filterGraph(graph, edges, {...defaults, focus: true, selectedIds: ['a']});
  assert.deepEqual(focused.nodes.map(n => n.id), ['a', 'b']); assert.equal(focused.edges.length, 1);
  const filtered = filterGraph(graph, edges, {...defaults, query: '备选', fromDate: '2026-11-07', status: 'implemented'});
  assert.deepEqual(filtered.nodes.map(n => n.id), ['c']); assert.equal(filtered.edges.length, 0);
  assert.equal(filterGraph(graph, edges, {...defaults, materials: true}).nodes.length, 4);
  assert.equal(filterGraph(graph, edges, {...defaults, query: '不存在'}).nodes.length, 0);
});

test('时间列表按提出日期倒序分组，保留同日记录和无日期文档且不改原数组', () => {
  const nodes = [...graph.nodes, record('undated', '')], before = [...nodes];
  const groups = groupByDate(nodes);
  assert.deepEqual(groups.map(g => g.date), ['2026-11-08', '2026-11-07', '2026-11-06', '']);
  assert.equal(groups[0].records.length, 2); assert.deepEqual(nodes, before);
});

const hoverGraph = {
  nodes: ['a', 'b', 'c', 'd', 'isolated'].map(id => ({id})),
  edges: [
    {id: 'incoming', source: 'a', target: 'b', origin: 'reference'},
    {id: 'outgoing', source: 'b', target: 'c', origin: 'manual'},
    {id: 'neighbors', source: 'a', target: 'c', origin: 'manual'},
    {id: 'second-hop', source: 'c', target: 'd', origin: 'reference'},
    {id: 'cycle', source: 'c', target: 'a', origin: 'reference'},
  ],
};

test('悬停同时强调直接入边、出边及相关卡片，不沿环或相邻卡片之间继续扩散', () => {
  const result = getGraphEmphasis(hoverGraph, [], 'b');
  assert.equal(result.active, true); assert.equal(result.hoveredId, 'b');
  assert.deepEqual([...result.nodeIds].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...result.edgeIds].sort(), ['incoming', 'outgoing']);
});

test('悬停临时覆盖多选强调，移开后恢复多选且不改输入或选中项', () => {
  const selected = ['a', 'd'], before = structuredClone(hoverGraph);
  const hovered = getGraphEmphasis(hoverGraph, selected, 'b');
  assert.equal(hovered.nodeIds.has('d'), false);
  const restored = getGraphEmphasis(hoverGraph, selected, null);
  assert.deepEqual([...restored.edgeIds].sort(), ['cycle', 'incoming', 'neighbors', 'second-hop']);
  assert.equal(restored.nodeIds.has('isolated'), false);
  assert.deepEqual(selected, ['a', 'd']); assert.deepEqual(hoverGraph, before);
  const idle = getGraphEmphasis(hoverGraph, [], null);
  assert.equal(idle.active, false); assert.equal(idle.edgeIds.size, 0);
});

test('孤立卡片仍可悬停聚焦；筛选移除的节点与失效边不参与强调', () => {
  const isolated = getGraphEmphasis(hoverGraph, [], 'isolated');
  assert.deepEqual([...isolated.nodeIds], ['isolated']); assert.equal(isolated.edgeIds.size, 0);
  const filtered = {...hoverGraph, nodes: [{id: 'a'}, {id: 'b'}]};
  const result = getGraphEmphasis(filtered, ['a', 'gone'], 'c');
  assert.equal(result.hoveredId, null);
  assert.deepEqual([...result.nodeIds].sort(), ['a', 'b']);
  assert.deepEqual([...result.edgeIds], ['incoming']);
  assert.equal(getGraphEmphasis(filtered, ['gone'], 'c').active, false);
});
