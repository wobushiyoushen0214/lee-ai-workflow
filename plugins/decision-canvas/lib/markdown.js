import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { posix } from 'node:path';
import { DEFAULT_WORKFLOW } from './workflow-config.js';
import { CATEGORIES, LIFECYCLES, check, hash } from './shared.js';

const parser = unified().use(remarkParse).use(remarkGfm);
function plain(node) {
  if (node.type === 'code') return '';
  if (typeof node.value === 'string') return node.value;
  if (node.type === 'image') return node.alt || '';
  return (node.children || []).map(plain).join(node.type === 'root' ? '\n' : '');
}
export function linkTarget(sourcePath, url) {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return { external: true, url };
  const [path, ...fragment] = url.split('#');
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return { invalid: true, url }; }
  const targetPath = decoded === '' ? sourcePath : posix.normalize(posix.join(posix.dirname(sourcePath), decoded));
  if (decoded.startsWith('/') || targetPath === '..' || targetPath.startsWith('../') || targetPath.includes('\0') || decoded.includes('\\')) return { invalid:true, url };
  return { targetPath, anchor:fragment.join('#'), url };
}

export function parseDocument(file, workflow = DEFAULT_WORKFLOW) {
  const ast = parser.parse(file.content);
  const definitions = new Map(); const headings = []; const sections = {}; const links = [];
  visit(ast, 'definition', (node) => definitions.set(node.identifier, node.url));
  for (let i=0; i<ast.children.length; i++) {
    const node = ast.children[i];
    if (node.type !== 'heading') continue;
    const title = plain(node); headings.push({ title, depth:node.depth, line:node.position.start.line });
    if (node.depth === 2) {
      let end = file.content.length;
      for (let j=i+1; j<ast.children.length; j++) if (ast.children[j].type === 'heading' && ast.children[j].depth <= 2) { end = ast.children[j].position.start.offset; break; }
      sections[title] = file.content.slice(node.position.end.offset, end).trim();
    }
  }
  visit(ast, (node) => {
    if (!['link','image','linkReference','imageReference'].includes(node.type)) return;
    const url = node.url ?? definitions.get(node.identifier); if (!url) return;
    const line = node.position.start.line;
    const section = headings.findLast((h) => h.line <= line)?.title || '';
    links.push({ ...linkTarget(file.path,url), label:node.alt || plain(node) || url, line, section, image:node.type.startsWith('image') });
  });
  const noteRelative = file.path.startsWith(workflow.notesDir + '/') ? file.path.slice(workflow.notesDir.length + 1) : '';
  const match = noteRelative.match(/^([^/]+)\/([^/]+)\/(.+)\.md$/);
  const kind = match ? 'decision' : file.path.startsWith(workflow.evidenceDir + '/') ? 'evidence' : file.path.startsWith(workflow.releasesDir + '/') ? 'release' : 'document';
  const declaredStatus = file.content.match(/^Status:\s*(.+)$/m)?.[1]?.trim() || '';
  const lifecycle = match?.[1] || 'document'; const category = match?.[2] || kind;
  const title = (headings.find((h)=>h.depth===1)?.title || posix.basename(file.path)).replace(/^Agent Note:\s*/i,'');
  const date = posix.basename(file.path).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || file.path.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  const diagnostics = [];
  if (match) {
    if (!LIFECYCLES.includes(lifecycle)) diagnostics.push({ code:'unknown-lifecycle', message:'未知生命周期目录' });
    if (!CATEGORIES.includes(category)) diagnostics.push({ code:'unknown-category', message:'未知决策分类' });
    const expected = lifecycle === 'archived' ? 'implemented' : lifecycle;
    if (!(expected === 'rejected' ? /^rejected\s*[—-]\s*\S/.test(declaredStatus) : declaredStatus === expected)) diagnostics.push({ code:'status-mismatch', message:`目录与状态行不一致：${declaredStatus || '缺少 Status'}` });
    if (lifecycle === 'archived' && !/^Archived:\s*\d{4}-\d{2}-\d{2}/m.test(file.content)) diagnostics.push({ code:'missing-archive-date', message:'归档记录缺少 Archived 日期' });
    if (!Object.hasOwn(sections,'Alternatives considered')) diagnostics.push({ code:'missing-alternatives', message:'缺少 Alternatives considered' });
  }
  const summary = (sections.Decision || sections.Proposal || sections.Problem || plain(ast)).replace(/\[[^\]]*\]\([^)]*\)/g,'').replace(/[#*`>]/g,'').replace(/\s+/g,' ').slice(0,220);
  const id = match ? `note:${category}/${match[3]}.md` : `file:${file.path}`;
  return { id, path:file.path, kind, title, lifecycle, declaredStatus, category, date, summary, sections, headings, links, diagnostics, content:file.content, sha:file.sha || hash(file.content), version:file.version, searchText:plain(ast).slice(0,20000).toLowerCase() };
}

export function validateProposal(content) {
  check(typeof content === 'string' && content.length <= 100000, 'invalid-proposal', '提案内容无效或过长');
  const lines = content.replaceAll('\r\n','\n').trim().split('\n');
  check(/^# Agent Note: \S/.test(lines[0]) && lines[1] === '' && lines[2] === 'Status: proposed', 'invalid-proposal', '提案必须以 Agent Note 标题、空行、Status: proposed 开头');
  const doc = parseDocument({ path:'.agents/notes/proposed/feature/2000-01-01-draft.md', content });
  check(doc.headings.filter(h=>h.depth===2)[0]?.title === 'Problem', 'invalid-proposal', '首节必须是 Problem');
  for (const heading of ['Problem','Proposal','Alternatives considered','Acceptance criteria','Risks']) check(doc.sections[heading]?.trim(), 'invalid-proposal', `提案缺少非空章节：${heading}`);
  check(lines.filter(line=>line.startsWith('Status:')).length === 1, 'invalid-proposal', '提案只能包含一个 Status 状态行');
  return `${lines.join('\n')}\n`;
}
