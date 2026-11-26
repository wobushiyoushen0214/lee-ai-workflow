import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const CATEGORIES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'];
export const LIFECYCLES = ['proposed', 'implemented', 'rejected', 'archived'];
export const RELATIONS = ['references', 'depends-on', 'extends', 'supersedes', 'conflicts-with'];
export const BOARD_PATH = '.agents/canvas/decisions.json';
export const RUN_ROOT = '.agents/canvas/runs';
export const MAX_DOCUMENT_BYTES = 1024 * 1024;

export class CanvasError extends Error {
  constructor(code, message, details) { super(message); this.name = 'CanvasError'; this.code = code; this.details = details; }
}
export function check(condition, code, message, details) {
  if (!condition) throw new CanvasError(code, message, details);
}
export function text(value, label, max = 10000) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'invalid-input', `${label}不能为空，且不能超过 ${max} 字符`);
  return value.trim();
}
export function relativePath(value) {
  const path = text(value, '文件路径', 2048).replaceAll('\\', '/');
  check(!path.includes('\0') && !path.startsWith('/') && !/^[a-zA-Z]:/.test(path), 'outside-workspace', '仅支持工作区相对路径');
  const normalized = posix.normalize(path);
  check(normalized !== '..' && !normalized.startsWith('../'), 'outside-workspace', '文件路径超出工作区');
  return normalized;
}
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const copy = (value) => structuredClone(value);
export function errorData(error) {
  return { code: error?.code || 'internal', message: error instanceof Error ? error.message : String(error), ...(error?.details ? { details: error.details } : {}) };
}
export async function mapLimit(items, concurrency, mapper) {
  const result = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await mapper(items[index], index); }
  }));
  return result;
}
export function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

/** 仅用于文件命名，不把模型生成的路径交给文件系统。 */
export function proposalPath(category, slug, date = new Date()) {
  check(CATEGORIES.includes(category), 'invalid-category', '请选择有效的决策分类');
  const safe = text(slug, '文件主题', 100).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0,70);
  check(safe.length > 0, 'invalid-input', '文件主题需要包含文字或数字');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return `.agents/notes/proposed/${category}/${day}-${safe}.md`;
}
