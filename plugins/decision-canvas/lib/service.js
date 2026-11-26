import { WorkspaceFiles } from './workspace-fs.js';
import { localFs } from './local-fs.js';
import { WorkspaceRegistry } from './workspaces.js';
import { scanWorkspace } from './graph.js';
import { exportCanvas, projectedBoard, readBoard, writeBoard } from './board.js';
import { history, historicalDocument } from './history.js';
import { AnalysisRuns } from './analysis-runs.js';
import { retrieve } from './retrieval.js';
import { check, text, relativePath } from './shared.js';
import { randomUUID } from 'node:crypto';

export const ACTIONS = ['workspaces', 'add_workspace', 'open_context', 'set_references', 'references', 'graph', 'document', 'save_board', 'history', 'historical', 'retrieve', 'prepare_analysis', 'complete_analysis', 'ai_run', 'ai_runs', 'cancel_ai', 'save_proposal', 'export'];
export class DecisionCanvasService {
  constructor(ctx = {}, config = {}) {
    this.ctx = { fs: localFs(), workspaceRegistry: new WorkspaceRegistry(), ...ctx };
    this.config = { maxSources: 12, contextChars: 18000, ...config };
    this.entries = new Map(); this.contexts = new Map(); this.disposed = false;
    this.runs = new AnalysisRuns(id => this.workspace(id), this.config);
  }
  async workspace(id) {
    check(!this.disposed, 'disposed', '画布服务已停止');
    const workspace = this.ctx.workspaceRegistry.get(text(id, '工作区标识', 200));
    check(workspace, 'workspace-not-found', '工作区不存在，请先添加项目绝对路径');
    let entry = this.entries.get(id);
    if (!entry || entry.path !== workspace.path) {
      entry = { ...workspace, files: new WorkspaceFiles(this.ctx.fs, workspace.path), index: null, scan: null, lastScan: 0 };
      this.entries.set(id, entry);
    }
    return entry;
  }
  async index(entry, force = false) {
    if (entry.scan) { await entry.scan; return force ? this.index(entry, true) : entry.index; }
    if (force || !entry.index || Date.now() - entry.lastScan > 2500) {
      entry.scan = scanWorkspace(entry.files).then(index => { entry.index = index; entry.lastScan = Date.now(); return index; }).finally(() => { entry.scan = null; });
      return entry.scan;
    }
    return entry.index;
  }
  async dispatch(action, input = {}) {
    check(ACTIONS.includes(action), 'unknown-action', '未知决策画布操作');
    check(input && typeof input === 'object' && !Array.isArray(input), 'invalid-input', '操作参数必须是对象');
    if (action === 'workspaces') return { workspaces: this.ctx.workspaceRegistry.list() };
    if (action === 'add_workspace') return { workspace: await this.ctx.workspaceRegistry.create(input.path, input.title) };
    const referenceContext = ['set_references','references'].includes(action) ? this.contexts.get(input.contextId) : null;
    if (['set_references','references'].includes(action)) check(referenceContext, 'context-not-found', '引用上下文已失效，请从当前会话重新打开画布');
    const entry = await this.workspace(action === 'references' ? referenceContext.workspaceId : input.workspaceId);
    if (action === 'open_context') {
      check(this.contexts.size < 256, 'context-limit', '请重新打开画布服务');
      const contextId = randomUUID();
      this.contexts.set(contextId, { workspaceId: entry.id, nodeIds: [] });
      return { contextId, workspaceId: entry.id };
    }
    if (action === 'set_references' || action === 'references') {
      const context = this.contexts.get(input.contextId);
      check(context, 'context-not-found', '引用上下文已失效，请从当前会话重新打开画布');
      const index = await this.index(entry, true);
      if (action === 'set_references') {
        check(Array.isArray(input.nodeIds) && input.nodeIds.length <= 30 && input.nodeIds.every(id => typeof id === 'string'), 'invalid-input', '一次最多引用 30 篇记录');
        for (const id of input.nodeIds) check(index.documents.has(id), 'unknown-node', '记录已移动或删除，请刷新后重新选择');
        context.workspaceId = entry.id;
        context.nodeIds = [...new Set(input.nodeIds)];
      }
      const nodeIds = context.nodeIds.filter(id => index.documents.has(id));
      const missingNodeIds = context.nodeIds.filter(id => !index.documents.has(id));
      const result = input.includeContent && nodeIds.length ? retrieve(index, {nodeIds, scope:'selected', limit:30, budget:this.config.contextChars}) : {};
      return { contextId: input.contextId, workspaceId: entry.id, workspacePath: entry.path, nodeIds, missingNodeIds,
        records: nodeIds.map(id => {const {title,path,sha} = index.documents.get(id); return {id,title,path,sha};}), ...result };
    }
    if (action === 'document') return entry.files.preview(relativePath(input.path));
    if (action === 'history') return { history: await history(entry.files, relativePath(input.path)) };
    if (action === 'historical') return historicalDocument(entry.files, relativePath(input.path), input.commit);
    if (action === 'ai_run') return this.runs.get(input.workspaceId, input.id, Boolean(input.includePrompt));
    if (action === 'ai_runs') return { runs: await this.runs.list(input.workspaceId) };
    if (action === 'cancel_ai') return this.runs.cancel(input.workspaceId, input);
    const index = await this.index(entry, Boolean(input.force) || ['prepare_analysis', 'complete_analysis', 'save_proposal'].includes(action));
    if (action === 'graph') {
      const saved = await readBoard(entry.files);
      const revision = `${index.snapshot.revision}:${saved.version || 'empty'}`;
      if (revision === input.knownRevision) return { unchanged: true, revision };
      return { workspace: { id: entry.id, title: entry.title, path: entry.path }, revision, graph: index.snapshot, board: projectedBoard(saved.board), version: saved.version, watchSupported: false, workflow: index.workflow };
    }
    if (action === 'save_board') return writeBoard(entry.files, input.board, input.expectedVersion, index.snapshot);
    if (action === 'retrieve') {
      check(input.query === undefined || typeof input.query === 'string' && input.query.length <= 12000, 'invalid-input', '检索问题无效或过长');
      if (input.limit !== undefined) check(Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 30, 'invalid-input', '来源数量必须在 1–30 之间');
      return retrieve(index, { query: input.query || '', nodeIds: input.nodeIds || [], scope: input.scope || 'related', limit: input.limit || this.config.maxSources, budget: this.config.contextChars });
    }
    if (action === 'prepare_analysis') return this.runs.prepare(input.workspaceId, input, index);
    if (action === 'complete_analysis') return this.runs.complete(input.workspaceId, input, index);
    if (action === 'save_proposal') { const saved = await this.runs.saveProposal(input.workspaceId, input, index); entry.lastScan = 0; return saved; }
    if (action === 'export') return { canvas: exportCanvas(index.snapshot, input.board || (await readBoard(entry.files)).board, input.nodeIds) };
  }
  async dispose() { this.disposed = true; await Promise.allSettled([...this.entries.values()].map(entry => entry.scan)); this.entries.clear(); this.contexts.clear(); }
}

export function compactToolResult(value) {
  if (!value.graph) return value;
  return { ...value, graph: { ...value.graph, nodes: value.graph.nodes.map(({ searchText, links, headings, ...node }) => node) } };
}
