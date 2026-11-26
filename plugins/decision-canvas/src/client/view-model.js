// A slow read must finish before a foreground poll can supersede it.
export function createLoadGate() {
  const pending = new Map();
  const load = (key, read, fresh = false) => {
    if (pending.has(key)) {
      const current = pending.get(key);
      return fresh ? current.catch(() => {}).then(() => load(key, read)) : current;
    }
    const request = Promise.resolve().then(read).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
  };
  return load;
}

export function filterGraph(graph, edges, filters) {
  const {materials, status, category, fromDate, toDate, query, focus, selectedIds} = filters;
  const connected = new Set(selectedIds);
  if (focus) for (const edge of edges) {
    if (selectedIds.includes(edge.source)) connected.add(edge.target);
    if (selectedIds.includes(edge.target)) connected.add(edge.source);
  }
  const nodes = graph.nodes.filter(node =>
    (materials || ['decision', 'missing'].includes(node.kind)) &&
    (!status || node.lifecycle === status) && (!category || node.category === category) &&
    (!fromDate || node.date >= fromDate) && (!toDate || node.date <= toDate) &&
    (!query || `${node.title} ${node.searchText || ''}`.toLowerCase().includes(query.toLowerCase())) &&
    (!focus || connected.has(node.id)));
  const ids = new Set(nodes.map(node => node.id));
  return {nodes, edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))};
}

export function groupByDate(nodes) {
  const groups = new Map();
  for (const node of [...nodes].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))) {
    const date = node.date || '';
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(node);
  }
  return [...groups].map(([date, records]) => ({date, records}));
}

// Hover is a temporary focus; the saved selection remains available on leave.
export function getGraphEmphasis(graph, selectedIds, hoveredId) {
  const visible = new Set(graph.nodes.map(node => node.id));
  const hovered = visible.has(hoveredId) ? hoveredId : null;
  const roots = new Set(hovered ? [hovered] : selectedIds.filter(id => visible.has(id)));
  const nodeIds = new Set(roots), edgeIds = new Set();
  for (const edge of graph.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    if (roots.has(edge.source) || roots.has(edge.target)) {
      nodeIds.add(edge.source); nodeIds.add(edge.target); edgeIds.add(edge.id);
    }
  }
  return {active: roots.size > 0, hoveredId: hovered, nodeIds, edgeIds};
}
