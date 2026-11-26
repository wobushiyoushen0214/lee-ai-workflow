import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, basename } from 'node:path';
import { check, text, hash } from './shared.js';

export class WorkspaceRegistry {
  constructor() { this.entries = new Map(); }
  list() { return [...this.entries.values()]; }
  get(id) { return this.entries.get(id); }
  async create(path, title) {
    path = text(path, '工作区路径', 2048);
    check(isAbsolute(path), 'invalid-workspace', '工作区需要本机绝对路径');
    let root;
    try { root = await realpath(path); check((await stat(root)).isDirectory(), 'invalid-workspace', '工作区必须是目录'); }
    catch (error) { if (error.code === 'ENOENT') throw Object.assign(new Error('工作区目录不存在'), { code: 'invalid-workspace' }); throw error; }
    const workspace = { id: `workspace-${hash(root).slice(0, 24)}`, path: root, title: title ? text(title, '工作区名称', 200) : basename(root) };
    this.entries.set(workspace.id, workspace);
    return workspace;
  }
}
