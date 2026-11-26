import { posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RUN_ROOT, check, proposalPath, text } from './shared.js';
import { analysisPrompt, AI_MODES, retrieve } from './retrieval.js';
import { validateProposal } from './markdown.js';

const runPath = id => {
  check(typeof id === 'string' && /^[a-zA-Z0-9-]{12,80}$/.test(id), 'invalid-run', '分析标识无效');
  return `${RUN_ROOT}/${id}.json`;
};

export class AnalysisRuns {
  constructor(getWorkspace, config) { this.getWorkspace = getWorkspace; this.config = config; }
  async locked(workspaceId, id, callback) {
    const entry = await this.getWorkspace(workspaceId);
    const target = await entry.files.target(`${runPath(id)}.transaction`);
    return entry.files.fs.withLock(target, () => callback(entry));
  }
  async read(entry, id) {
    const record = await entry.files.readJson(runPath(id), { missing: true });
    check(record, 'run-not-found', '分析记录不存在');
    check(record.value?.schemaVersion === 1 && ['agent-conversation', 'codex-conversation'].includes(record.value?.engine), 'unsupported-run', '这条分析不是兼容的 Agent 对话分析');
    return record;
  }
  public(record, includePrompt = false) {
    const { prompt, ...value } = record.value;
    if (value.status === 'awaiting_codex') value.status = 'awaiting_agent';
    return { ...value, version: record.version, ...(includePrompt ? { prompt } : {}) };
  }
  async prepare(workspaceId, input, index) {
    const id = input.id || randomUUID();
    check(AI_MODES.includes(input.mode), 'invalid-mode', '分析模式无效');
    const query = text(input.query, '问题', 12000);
    if (input.limit !== undefined) check(Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 30, 'invalid-input', '来源数量必须在 1–30 之间');
    return this.locked(workspaceId, id, async entry => {
      const existing = await entry.files.readJson(runPath(id), { missing: true });
      if (existing) {
        check(existing.value.query === query && existing.value.mode === input.mode, 'run-exists', '该分析标识已用于另一个问题');
        return this.public(existing, true);
      }
      const context = retrieve(index, { query, nodeIds: input.nodeIds || [], scope: input.scope || 'related', limit: input.limit || this.config.maxSources, budget: this.config.contextChars });
      const run = {
        schemaVersion: 1, engine: 'agent-conversation', id, workspaceId, workspacePath: entry.path,
        mode: input.mode, query, scope: context.scope, sources: context.sources,
        prompt: analysisPrompt(input.mode, query, context), createdAt: new Date().toISOString(),
        status: 'awaiting_agent', output: '', savedPath: null,
      };
      const saved = await entry.files.write(runPath(id), JSON.stringify(run, null, 2) + '\n', null);
      return this.public({ value: run, version: saved.version }, true);
    });
  }
  async get(workspaceId, id, includePrompt = false) {
    return this.public(await this.read(await this.getWorkspace(workspaceId), id), includePrompt);
  }
  checkSources(run, index) {
    for (const source of run.sources) {
      const current = index.documents.get(source.id);
      check(current && current.sha === source.sha, 'stale-context', `来源已改变，请重新准备分析：${source.title}`);
    }
  }
  async complete(workspaceId, input, index) {
    return this.locked(workspaceId, input.id, async entry => {
      const record = await this.read(entry, input.id);
      check(input.expectedVersion === record.version, 'conflict', '分析记录已改变，请重新读取');
      check(['awaiting_agent', 'awaiting_codex'].includes(record.value.status), 'run-finished', '分析已经结束，不能重复回填');
      const output = text(input.output, '分析结果', 150000);
      this.checkSources(record.value, index);
      const refs = new Set(record.value.sources.map(source => source.ref));
      const unknown = [...new Set([...output.matchAll(/\[S(\d+)\]/g)].map(match => `S${match[1]}`))].filter(ref => !refs.has(ref));
      check(!unknown.length, 'unknown-citation', `结果包含未知来源：${unknown.join(', ')}`);
      if (record.value.mode === 'propose') validateProposal(output);
      const value = { ...record.value, output, status: 'completed', finishedAt: new Date().toISOString(),
        ...(input.model ? { model: text(input.model, '模型说明', 200) } : {}),
        ...(input.sessionId ? { sessionId: text(input.sessionId, '会话标识', 200) } : {}),
      };
      const saved = await entry.files.write(runPath(input.id), JSON.stringify(value, null, 2) + '\n', record.version);
      return this.public({ value, version: saved.version });
    });
  }
  async cancel(workspaceId, input) {
    return this.locked(workspaceId, input.id, async entry => {
      const record = await this.read(entry, input.id);
      check(input.expectedVersion === record.version, 'conflict', '分析记录已改变，请重新读取');
      check(['awaiting_agent', 'awaiting_codex'].includes(record.value.status), 'run-finished', '只有等待 Agent 的分析可以取消');
      const value = { ...record.value, status: 'cancelled', finishedAt: new Date().toISOString() };
      const saved = await entry.files.write(runPath(input.id), JSON.stringify(value, null, 2) + '\n', record.version);
      return this.public({ value, version: saved.version });
    });
  }
  async list(workspaceId) {
    const entry = await this.getWorkspace(workspaceId);
    const files = (await entry.files.list(RUN_ROOT)).filter(file => file.type === 'file' && /^[a-zA-Z0-9-]{12,80}\.json$/.test(file.name));
    const records = await Promise.all(files.slice(-300).map(async file => {
      try {
        const run = await this.get(workspaceId, file.name.slice(0, -5));
        return { id: run.id, mode: run.mode, query: run.query, createdAt: run.createdAt, status: run.status, savedPath: run.savedPath };
      } catch { return null; }
    }));
    return records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async saveProposal(workspaceId, input, index) {
    const write = async entry => {
      const path = proposalPath(input.category, input.slug).replace(/^\.agents\/notes\//, `${index.workflow.notesDir}/`);
      let content = validateProposal(input.content), record;
      if (input.runId) {
        record = await this.read(entry, input.runId);
        check(record.value.status === 'completed' && record.value.mode === 'propose', 'incomplete-analysis', '只有已完成的提案分析可以保存');
        check(!record.value.savedPath, 'already-saved', `此分析已保存为 ${record.value.savedPath}`);
        this.checkSources(record.value, index);
        const sources = new Map(record.value.sources.map(source => [source.ref, { ...source, path: index.documents.get(source.id).path }]));
        const link = source => `[${source.title.replace(/[\[\]]/g, '')}](${posix.relative(posix.dirname(path), source.path).split('/').map(encodeURIComponent).join('/')})`;
        content = content.replace(/\[S(\d+)\]/g, (_match, n) => {
          const source = sources.get(`S${n}`);
          check(source, 'unknown-citation', `未知来源：S${n}`);
          return link(source);
        });
        content += `\n## 参考决策\n\n${[...sources.values()].map(source => `- ${link(source)}（${source.lifecycle}；SHA-256 ${source.sha.slice(0, 12)}）`).join('\n') || '本次未检索到历史依据。'}\n\n## 生成与审阅\n\n由 当前 Agent 对话辅助分析，记录 ${record.value.id}。保存为 proposed 不表示批准实施。\n`;
      } else {
        check(!/\[S\d+\]/.test(content), 'unknown-citation', '没有关联分析时，请使用真实 Markdown 链接');
      }
      await entry.files.write(path, validateProposal(content), null);
      if (record) {
        try { await entry.files.write(runPath(input.runId), JSON.stringify({ ...record.value, savedPath: path }, null, 2) + '\n', record.version); }
        catch { return { path, warning: '提案已创建，但分析记录回链失败；请勿重复创建。' }; }
      }
      return { path };
    };
    return input.runId ? this.locked(workspaceId, input.runId, write) : write(await this.getWorkspace(workspaceId));
  }
}
