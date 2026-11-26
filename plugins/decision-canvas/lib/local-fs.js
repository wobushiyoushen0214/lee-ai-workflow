import { mkdir, open, realpath, stat, readdir, rename, link, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CanvasError, hash, check, MAX_DOCUMENT_BYTES } from './shared.js';

async function canonical(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(path);
    return parent === path ? path : join(await canonical(parent), path.slice(parent.length + 1));
  }
}

async function info(path) {
  try {
    const value = await stat(path, { bigint: true });
    return {
      type: value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other',
      version: hash(`${value.dev}:${value.ino}:${value.mtimeNs}:${value.ctimeNs}:${value.size}`),
      size: Number(value.size),
    };
  } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

async function boundedRead(path, maxBytes = 8 * MAX_DOCUMENT_BYTES) {
  const handle = await open(path, 'r');
  try {
    const metadata = await handle.stat();
    check(metadata.isFile(), 'not-a-file', '只能读取普通文件');
    check(metadata.size <= maxBytes, 'too-large', '文件超过读取上限');
    const parts = []; let total = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(buffer);
      if (!bytesRead) break;
      total += bytesRead;
      check(total <= maxBytes, 'too-large', '文件在读取期间超过上限');
      parts.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(parts, total);
  } finally { await handle.close(); }
}

export function localFs({ lockTimeoutMs = 5000 } = {}) {
  async function withLock(target, operation) {
    const path = target.targetKey;
    await mkdir(dirname(path), { recursive: true });
    const lock = `${path}.lock`; const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      try { await mkdir(lock); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new CanvasError('file-busy', `文件正在由另一个进程保存：${path}`);
        await delay(20);
      }
    }
    try { return await operation(); }
    finally { await rm(lock, { recursive: true }); }
  }

  return {
    async resolve(path, options = {}) {
      const value = await canonical(resolve(options.cwd || process.cwd(), path));
      return { targetKey: value, displayPath: value };
    },
    processPath: target => target.targetKey,
    contains(parent, child) {
      const path = relative(parent.targetKey, child.targetKey);
      return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
    },
    stat: target => info(target.targetKey),
    readText: async target => (await boundedRead(target.targetKey)).toString('utf8'),
    readBytes: (target, _offset, maxBytes) => boundedRead(target.targetKey, maxBytes),
    async listDir(target) {
      const entries = await readdir(target.targetKey, { withFileTypes: true });
      return Promise.all(entries.map(async entry => {
        const path = await canonical(join(target.targetKey, entry.name));
        return { name: entry.name, ...await info(path), target: { targetKey: path, displayPath: path } };
      }));
    },
    withLock,
    async writeText(target, content, expected) {
      return withLock(target, async () => {
        const current = await info(target.targetKey);
        if (expected?.kind === 'replaceIfVersion' && (!current || current.version !== expected.version))
          throw Object.assign(new Error('文件版本已改变'), { code: 'FS_STALE_VERSION' });
        if (expected?.kind === 'createIfAbsent' && current)
          throw Object.assign(new Error('文件已经存在'), { code: 'FS_NOT_OBSERVED' });
        check(['createIfAbsent', 'replaceIfVersion'].includes(expected?.kind), 'version-required', '保存必须指定版本条件');
        const temporary = `${target.targetKey}.${randomUUID()}.tmp`;
        try {
          const handle = await open(temporary, 'wx', 0o600);
          try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
          finally { await handle.close(); }
          if (expected.kind === 'createIfAbsent') {
            try { await link(temporary, target.targetKey); }
            catch (error) {
              if (error.code === 'EEXIST') throw Object.assign(new Error('文件已经存在'), { code: 'FS_NOT_OBSERVED' });
              throw error;
            }
          } else {
            const latest = await info(target.targetKey);
            if (!latest || latest.version !== expected.version)
              throw Object.assign(new Error('文件版本已改变'), { code: 'FS_STALE_VERSION' });
            await rename(temporary, target.targetKey);
          }
          // Removing the temporary hard link changes ctime: obtain the public version afterwards.
          await rm(temporary, { force: true });
          return { version: (await info(target.targetKey)).version, operation: current ? 'update' : 'create' };
        } finally { await rm(temporary, { force: true }); }
      });
    },
    async watch(target, listener, signal) {
      const watcher = watch(target.targetKey, listener);
      watcher.on('error', listener);
      const close = () => watcher.close();
      signal?.addEventListener('abort', close, { once: true });
      return async () => { signal?.removeEventListener('abort', close); watcher.close(); };
    },
  };
}
