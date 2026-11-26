import test from 'node:test';
import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument,validateProposal } from '../lib/markdown.js';
import { scanWorkspace } from '../lib/graph.js';
import { fixture,note,proposal } from './helpers.js';

test('AST 支持引用式链接、中文路径与锚点，跳过代码中的假链接',()=>{
  const doc=parseDocument({path:'.agents/notes/implemented/feature/2026-11-06-a.md',content:note('缓存', '\n## References\n\n[旧策略][old]\n\n[old]: ../process/2026-11-05-%E6%97%A7%E7%AD%96%E7%95%A5.md#tradeoffs\n\n```md\n[假链接](missing.md)\n```')});
  assert.equal(doc.links.length,1);assert.equal(doc.links[0].targetPath,'.agents/notes/implemented/process/2026-11-05-旧策略.md');assert.equal(doc.links[0].anchor,'tradeoffs');assert.ok(doc.links[0].line>10);assert.equal(doc.sections.Decision,'按章节缓存。');
});
test('归档状态组合合法；缺失状态、未知分类和缺失备选方案有诊断',()=>{
  const archived=parseDocument({path:'.agents/notes/archived/feature/2026-11-06-a.md',content:note().replace('Status: implemented','Status: implemented\n\nArchived: 2026-11-06')});
  assert.equal(archived.lifecycle,'archived');assert.equal(archived.declaredStatus,'implemented');assert.equal(archived.diagnostics.length,0);
  const malformed=parseDocument({path:'.agents/notes/proposed/other/2026-11-06-a.md',content:'# 缺少状态\n\n## Problem\n\n问题'});
  assert.deepEqual(malformed.diagnostics.map(d=>d.code),['unknown-category','status-mismatch','missing-alternatives']);
});
test('图保留环、去重引用来源、缺失节点、独立记录与重复身份',async t=>{
  const {files,put}=await fixture(t);
  await put('.agents/notes/implemented/feature/2026-11-06-a.md',note('A','[B](2026-11-06-b.md) [B 再次](2026-11-06-b.md#why) [缺失](2026-11-06-missing.md)'));
  await put('.agents/notes/implemented/feature/2026-11-06-b.md',note('B','[A](2026-11-06-a.md)'));
  await put('.agents/notes/proposed/feature/2026-11-06-b.md',proposal('副本'));
  await put('.agents/notes/implemented/process/2026-11-06-orphan.md',note('独立'));
  const result=await scanWorkspace(files);
  assert.equal(result.snapshot.stats.decisions,4);assert.equal(result.snapshot.edges.length,3);
  assert.equal(result.snapshot.edges.find(e=>e.provenance.length===2).provenance.length,2);
  assert.equal(result.snapshot.nodes.filter(n=>n.kind==='missing').length,1);
  assert.equal(new Set(result.snapshot.nodes.map(n=>n.id)).size,5);
  assert.ok(result.snapshot.diagnostics.some(d=>d.code==='duplicate-identity'));
});
test('工作区读取拒绝上级路径和逃逸符号链接',async t=>{
  const {files,root}=await fixture(t);
  await assert.rejects(files.read('../outside'),{code:'outside-workspace'});
  await symlink('/etc',join(root,'escape'));
  await assert.rejects(files.read('escape/hosts'),{code:'outside-workspace'});
});
test('提案必须有完整骨架且只能为 proposed',()=>{
  assert.match(validateProposal(proposal()),/^# Agent Note:/);
  assert.throws(()=>validateProposal(proposal().replace('Status: proposed','Status: implemented')),{code:'invalid-proposal'});
  assert.throws(()=>validateProposal(proposal().replace('## Alternatives considered','## Other')),{code:'invalid-proposal'});
});
