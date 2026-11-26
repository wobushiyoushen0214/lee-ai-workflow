import { posix } from 'node:path';
import { CanvasError, check, hash, MAX_DOCUMENT_BYTES, relativePath } from './shared.js';

/** 所有业务 I/O 使用本地文件适配器，读取和写入保持工作区边界。 */
export class WorkspaceFiles {
  constructor(fs, root) { this.fs = fs; this.root = root; this.rootTarget = fs.resolve(root); }
  async target(path) {
    const safe = relativePath(path);
    const target = await this.fs.resolve(safe, { cwd: this.root });
    check(this.fs.contains(await this.rootTarget, target), 'outside-workspace', '文件或符号链接超出工作区');
    return target;
  }
  async stat(path) { return this.fs.stat(await this.target(path)); }
  async read(path, { maxBytes = MAX_DOCUMENT_BYTES, missing = false } = {}) {
    const target = await this.target(path);
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await this.fs.stat(target);
      if (!before && missing) return null;
      check(before, 'not-found', `文件不存在：${path}`);
      check(before.type === 'file', 'not-a-file', `不是普通文件：${path}`);
      check(before.size <= maxBytes, 'too-large', `文件超过读取上限：${path}`);
      const content = await this.fs.readText(target);
      const after = await this.fs.stat(target);
      if (after && before.version === after.version) return { path, content, version: after.version, sha: hash(content), size: after.size };
    }
    throw new CanvasError('file-changing', `文件正在修改，请稍后重新读取：${path}`);
  }
  async readJson(path, { missing = false, maxBytes = 4 * MAX_DOCUMENT_BYTES } = {}) {
    const file = await this.read(path, { missing, maxBytes });
    if (!file) return null;
    try { return { ...file, value: JSON.parse(file.content) }; }
    catch { throw new CanvasError('invalid-json', `文件不是有效 JSON，原数据已保留：${path}`); }
  }
  async write(path, content, expectedVersion) {
    check(typeof content === 'string' && Buffer.byteLength(content) <= 8 * MAX_DOCUMENT_BYTES, 'too-large', '保存内容超过上限');
    check(expectedVersion === null || typeof expectedVersion === 'string', 'version-required', '保存需要原文件版本');
    try {
      return await this.fs.writeText(await this.target(path), content,
        expectedVersion === null ? { kind: 'createIfAbsent' } : { kind: 'replaceIfVersion', version: expectedVersion });
    } catch (error) {
      if (['FS_STALE_VERSION', 'FS_NOT_OBSERVED'].includes(error?.code)) throw new CanvasError('conflict', '文件已被其他窗口或工具修改，请重新载入后再保存');
      throw error;
    }
  }
  async list(path) {
    const target = await this.target(path); const info = await this.fs.stat(target);
    if (!info) return [];
    check(info.type === 'directory', 'not-a-directory', `不是目录：${path}`);
    const entries = await this.fs.listDir(target);
    return entries.filter((entry) => !entry.target || this.fs.contains(target, entry.target));
  }
  async walk(root, accept, { maxDepth = 6, maxFiles = 3000 } = {}) {
    const files = [], directories = [], seen = new Set();
    const walk = async (path, depth) => {
      if (depth > maxDepth) return;
      const target = await this.target(path); const key = this.fs.processPath(target);
      if (seen.has(key)) return; seen.add(key);
      const info = await this.fs.stat(target); if (!info) return;
      check(info.type === 'directory', 'not-a-directory', `不是目录：${path}`);
      directories.push(path);
      for (const entry of await this.list(path)) {
        if (entry.name.startsWith('.') || ['node_modules','build','dist'].includes(entry.name)) continue;
        const child = posix.join(path, entry.name);
        if (entry.type === 'directory') await walk(child, depth + 1);
        else if (entry.type === 'file' && accept(child)) {
          check(files.length < maxFiles, 'index-limit', `索引超过 ${maxFiles} 个文件，请缩小工作区范围`);
          files.push(child);
        }
      }
    };
    await walk(root, 0); return { files, directories };
  }
  async watch(path, listener, signal) {
    check(typeof this.fs.watch === 'function', 'watch-unavailable', '当前文件系统不支持监听');
    return this.fs.watch(await this.target(path), listener, signal);
  }
  async preview(path) {
    const safe = relativePath(path); const info = await this.stat(safe);
    check(info, 'not-found', `文件不存在：${safe}`);
    const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif' };
    const mime = types[posix.extname(safe).toLowerCase()];
    if (mime) {
      check(info.type === 'file' && info.size <= 8 * MAX_DOCUMENT_BYTES, 'too-large', '图片超过 8 MB 预览上限');
      const bytes = await this.fs.readBytes(await this.target(safe), undefined, 8 * MAX_DOCUMENT_BYTES);
      return { path:safe, kind:'image', dataUrl:`data:${mime};base64,${Buffer.from(bytes).toString('base64')}` };
    }
    const file = await this.read(safe);
    return { ...file, kind: /\.md$/i.test(safe) ? 'markdown' : 'text' };
  }
}
