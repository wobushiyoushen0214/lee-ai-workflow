import dagre from '@dagrejs/dagre';

export const CARD_WIDTH = 304;
export const CARD_HEIGHT = 180;
export const CARD_GAP = 28;
const valid = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function calculateLayout(nodes, edges) {
  if (!nodes.length) return {};
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({rankdir: 'LR', nodesep: CARD_GAP, ranksep: 86, marginx: 40, marginy: 40});
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of [...nodes].sort(byId)) graph.setNode(node.id, {width: CARD_WIDTH, height: CARD_HEIGHT});
  for (const edge of [...edges].sort((a, b) => byId({id: `${a.source}\0${a.target}`}, {id: `${b.source}\0${b.target}`}))) {
    if (edge.source !== edge.target && graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);
  return Object.fromEntries(nodes.map(node => {
    const point = graph.node(node.id);
    return [node.id, {x: point.x - CARD_WIDTH / 2, y: point.y - CARD_HEIGHT / 2}];
  }));
}

export function cardsOverlap(a, b, gap = 0) {
  return a.x < b.x + CARD_WIDTH + gap && a.x + CARD_WIDTH + gap > b.x &&
    a.y < b.y + CARD_HEIGHT + gap && a.y + CARD_HEIGHT + gap > b.y;
}

// The nearest free point on each axis can be found from merged forbidden intervals.
// This avoids iterative nudging limits when many legacy cards share one position.
function freeCoordinate(point, occupied, axis) {
  const cross = axis === 'x' ? 'y' : 'x';
  const size = axis === 'x' ? CARD_WIDTH : CARD_HEIGHT;
  const crossSize = axis === 'x' ? CARD_HEIGHT : CARD_WIDTH;
  const intervals = occupied.filter(other =>
    point[cross] < other[cross] + crossSize + CARD_GAP && point[cross] + crossSize + CARD_GAP > other[cross])
    .map(other => [other[axis] - size - CARD_GAP, other[axis] + size + CARD_GAP])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const blocked = merged.find(([start, end]) => point[axis] > start && point[axis] < end);
  if (!blocked) return point[axis];
  return point[axis] - blocked[0] < blocked[1] - point[axis] ? blocked[0] : blocked[1];
}

export function resolvePositions(nodes, automatic, {saved = {}, previous = {}, pinnedNodeIds = [], priorityNodeIds = []} = {}) {
  const pinned = new Set(pinnedNodeIds), priority = new Set(priorityNodeIds);
  const ordered = [...nodes].sort((a, b) => {
    const tier = node => pinned.has(node.id) ? 0 : priority.has(node.id) ? 1 : valid(saved[node.id]) ? 2 : valid(previous[node.id]) ? 3 : 4;
    return tier(a) - tier(b) || byId(a, b);
  });
  const positions = {}, occupied = [], movedIds = [], pinnedOverlaps = [];
  for (const node of ordered) {
    const original = [saved[node.id], previous[node.id], automatic[node.id]].find(valid) || {x: 40, y: 40};
    let point = {x: original.x, y: original.y};
    if (pinned.has(node.id)) {
      for (const other of occupied) if (cardsOverlap(point, other)) pinnedOverlaps.push([other.id, node.id]);
    } else if (occupied.some(other => cardsOverlap(point, other, CARD_GAP))) {
      const x = freeCoordinate(point, occupied, 'x'), y = freeCoordinate(point, occupied, 'y');
      point = Math.abs(x - point.x) < Math.abs(y - point.y) ? {x, y: point.y} : {x: point.x, y};
      movedIds.push(node.id);
    }
    positions[node.id] = point;
    occupied.push({id: node.id, ...point});
  }
  return {positions, movedIds, pinnedOverlaps};
}

// Only the presentation is merged. Original directed edges remain intact for
// selection, provenance, hiding, export and persistence.
export function displayEdges(edges) {
  const references = new Map();
  for (const edge of edges) if (edge.origin === 'markdown') references.set(`${edge.source}\0${edge.target}`, edge);
  const consumed = new Set(), result = [];
  for (const edge of edges) {
    if (consumed.has(edge.id)) continue;
    const reverse = edge.origin === 'markdown' && edge.source !== edge.target ? references.get(`${edge.target}\0${edge.source}`) : null;
    const relatedEdges = reverse ? [edge, reverse] : [edge];
    for (const item of relatedEdges) consumed.add(item.id);
    result.push({...edge, bidirectional: Boolean(reverse), relatedEdges});
  }
  return result;
}

export function edgePorts(edge, positions) {
  const source = positions[edge.source], target = positions[edge.target];
  if (!source || !target) return {sourceHandle: 'source-right', targetHandle: 'target-left'};
  const dx = target.x - source.x, dy = target.y - source.y;
  const horizontal = Math.abs(dx) / CARD_WIDTH >= Math.abs(dy) / CARD_HEIGHT;
  const from = horizontal ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'bottom' : 'top';
  const to = {left: 'right', right: 'left', top: 'bottom', bottom: 'top'}[from];
  return {sourceHandle: `source-${from}`, targetHandle: `target-${to}`};
}
