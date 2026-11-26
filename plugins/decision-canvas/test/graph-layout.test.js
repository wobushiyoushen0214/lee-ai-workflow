import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD_WIDTH, CARD_HEIGHT, CARD_GAP, calculateLayout, cardsOverlap, resolvePositions, displayEdges, edgePorts} from '../src/client/graph-layout.js';
import {filterGraph, getGraphEmphasis} from '../src/client/view-model.js';

const nodes = ids => ids.map(id => ({id, kind: 'decision', category: 'feature', title: id, date: '', lifecycle: 'implemented'}));
function separated(positions, except = new Set()) {
  const entries = Object.entries(positions);
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [[a, from], [b, to]] = [entries[i], entries[j]];
    if (except.has(a) && except.has(b)) continue;
    assert.equal(cardsOverlap(from, to, CARD_GAP), false, `${a} overlaps ${b}`);
  }
}

test('有环、孤立节点和同层节点的完整布局稳定且无重叠，输入顺序不影响布局', () => {
  const records = nodes(['a', 'b', 'c', 'd', 'isolated']);
  const edges = [{source: 'a', target: 'b'}, {source: 'b', target: 'a'}, {source: 'a', target: 'c'}, {source: 'c', target: 'd'}, {source: 'd', target: 'a'}];
  const positions = calculateLayout(records, edges);
  separated(positions);
  assert.deepEqual(calculateLayout([...records].reverse(), [...edges].reverse()), positions);
  assert.deepEqual(calculateLayout([], []), {});
});

test('旧尺寸布局相交与新增卡片混用自动坐标时，仅移动冲突卡片', () => {
  const records = nodes(['saved-a', 'saved-b', 'kept', 'previous', 'new']);
  const saved = {'saved-a': {x: 0, y: 0}, 'saved-b': {x: 0, y: 175}, kept: {x: 1500, y: 0}};
  const previous = {previous: {x: 0, y: 400}};
  const automatic = {new: {x: 0, y: 0}};
  const before = structuredClone({saved, previous, automatic});
  const result = resolvePositions(records, automatic, {saved, previous});
  separated(result.positions);
  assert.deepEqual(result.positions['saved-a'], saved['saved-a']);
  assert.deepEqual(result.positions.kept, saved.kept);
  assert.deepEqual({saved, previous, automatic}, before);
  assert.deepEqual(resolvePositions(records, automatic, {saved, previous: result.positions}).positions, result.positions);
});

test('固定节点作为障碍保持精确坐标，自动整理与新增卡片绕开固定位置', () => {
  const records = nodes(['pin', 'a', 'b']);
  const automatic = Object.fromEntries(records.map(n => [n.id, {x: -100, y: -100}]));
  const saved = {pin: {x: -100, y: -100}};
  const result = resolvePositions(records, automatic, {saved, pinnedNodeIds: ['pin']});
  assert.deepEqual(result.positions.pin, saved.pin); separated(result.positions);
});

test('已有固定位置互相覆盖时报告冲突，其他卡片仍然避让，解除固定可修复', () => {
  const records = nodes(['pin-a', 'pin-b', 'free']);
  const saved = Object.fromEntries(records.map(n => [n.id, {x: 0, y: 0}]));
  const result = resolvePositions(records, {}, {saved, pinnedNodeIds: ['pin-a', 'pin-b']});
  assert.deepEqual(result.pinnedOverlaps, [['pin-a', 'pin-b']]);
  assert.deepEqual(result.positions['pin-a'], saved['pin-a']);
  assert.deepEqual(result.positions['pin-b'], saved['pin-b']);
  separated(result.positions, new Set(['pin-a', 'pin-b']));
  separated(resolvePositions(records, {}, {saved, pinnedNodeIds: ['pin-a']}).positions);
});

test('拖动结束优先保留拖动卡片，其他未固定卡片避让；拖向固定节点时避开固定节点', () => {
  const records = nodes(['a', 'dragged', 'pin']);
  const saved = {a: {x: 0, y: 0}, dragged: {x: 0, y: 0}, pin: {x: 1000, y: 0}};
  const options = {saved, pinnedNodeIds: ['pin'], priorityNodeIds: ['dragged']};
  const result = resolvePositions(records, {}, options);
  assert.deepEqual(result.positions.dragged, saved.dragged);
  assert.notDeepEqual(result.positions.a, saved.a); separated(result.positions);
  const ontoPin = resolvePositions(records, {}, {...options, saved: {...saved, dragged: saved.pin}});
  assert.deepEqual(ontoPin.positions.pin, saved.pin); separated(ontoPin.positions);
});

test('筛选只投影完整布局，隐藏的节点保留位置，新增记录不挤占旧位置', () => {
  const original = {nodes: nodes(['a', 'b', 'c']), edges: [{source: 'a', target: 'b'}]};
  const automatic = calculateLayout(original.nodes, original.edges);
  const resolved = resolvePositions(original.nodes, automatic).positions;
  const filtered = filterGraph(original, original.edges, {query: 'b', selectedIds: []});
  assert.deepEqual(filtered.nodes.map(node => resolved[node.id]), [resolved.b]);
  const expanded = [...original.nodes, ...nodes(['added'])];
  const next = resolvePositions(expanded, {...automatic, added: resolved.a}, {previous: resolved}).positions;
  for (const node of original.nodes) assert.deepEqual(next[node.id], resolved[node.id]);
  separated(next);
});

test('500 张遗留卡片共用坐标时仍全部避让且结果确定，无迭代次数上限导致的残留重叠', () => {
  const records = nodes(Array.from({length: 500}, (_, i) => `record-${i}`));
  const saved = Object.fromEntries(records.map(n => [n.id, {x: 0, y: 0}]));
  const result = resolvePositions(records, {}, {saved});
  separated(result.positions);
  assert.equal(Object.keys(result.positions).length, 500);
  assert.equal(result.movedIds.length, 499);
  for (const point of Object.values(result.positions)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

const reference = (id, source, target) => ({id, source, target, origin: 'markdown', relation: 'references', provenance: [{path: `${source}.md`, line: 10}]});
test('双向原文引用只展示一条双向边，保留两端来源、独立人工关系与 hover 强调', () => {
  const edges = [reference('ab', 'a', 'b'), reference('ba', 'b', 'a'), reference('bc', 'b', 'c'), {id: 'manual:ab', source: 'a', target: 'b', origin: 'manual', relation: 'depends-on', label: '人工依赖'}];
  const original = structuredClone(edges), shown = displayEdges(edges);
  assert.equal(shown.length, 3); assert.equal(shown[0].bidirectional, true);
  assert.deepEqual(shown[0].relatedEdges, edges.slice(0, 2));
  assert.equal(shown.at(-1).relation, 'depends-on'); assert.equal(shown.at(-1).bidirectional, false);
  const emphasis = getGraphEmphasis({nodes: nodes(['a', 'b', 'c']), edges}, [], 'b');
  assert.ok(shown[0].relatedEdges.every(item => emphasis.edgeIds.has(item.id)));
  // Hiding a displayed pair hides both fact edges; hiding just one direction
  // leaves the reverse edge visible with its own provenance.
  const hidden = new Set(shown[0].relatedEdges.map(item => item.id));
  assert.equal(displayEdges(edges.filter(edge => !hidden.has(edge.id))).length, 2);
  assert.equal(displayEdges(edges.filter(edge => edge.id !== 'ab'))[0].bidirectional, false);
  assert.deepEqual(edges, original);
});

test('逆向、同列及横向连线使用面对面端口，拖动后重新计算方向', () => {
  const edge = {source: 'a', target: 'b'};
  assert.deepEqual(edgePorts(edge, {a: {x: 0, y: 0}, b: {x: CARD_WIDTH + CARD_GAP, y: 0}}), {sourceHandle: 'source-right', targetHandle: 'target-left'});
  assert.deepEqual(edgePorts(edge, {a: {x: 800, y: 0}, b: {x: 0, y: 0}}), {sourceHandle: 'source-left', targetHandle: 'target-right'});
  assert.deepEqual(edgePorts(edge, {a: {x: 0, y: 0}, b: {x: 0, y: CARD_HEIGHT + CARD_GAP}}), {sourceHandle: 'source-bottom', targetHandle: 'target-top'});
  assert.deepEqual(edgePorts(edge, {a: {x: 0, y: 600}, b: {x: 0, y: 0}}), {sourceHandle: 'source-top', targetHandle: 'target-bottom'});
});
