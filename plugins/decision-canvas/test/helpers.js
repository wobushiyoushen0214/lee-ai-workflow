import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { WorkspaceFiles } from '../lib/workspace-fs.js';
import { localFs } from '../lib/local-fs.js';
export { localFs } from '../lib/local-fs.js';

export async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'codex-decision-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const fs=localFs();const files=new WorkspaceFiles(fs,root);
  const put=async(path,content)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),content);};
  const workspace={id:'test-workspace',title:'测试工作区',path:root};
  const ctx={fs,workspaceRegistry:{list:()=>[workspace],get:id=>id===workspace.id?workspace:undefined},get(name){return this[name];}};
  return {root,fs,files,put,ctx,workspace};
}
export function note(title='测试',body='') {return `# Agent Note: ${title}\n\nStatus: implemented\n\n## Problem\n\n阅读速度慢。\n\n## Decision\n\n按章节缓存。\n\n## Alternatives considered\n\n全本缓存会占用更多空间。\n\n## Consequences\n\n减少等待，增加缓存管理成本。\n${body}\n`;}
export function proposal(body='参考 [S1]。') {return `# Agent Note: 新的缓存策略\n\nStatus: proposed\n\n## Problem\n\n${body}\n\n## Proposal\n\n按章节预取并限制内存。\n\n## Alternatives considered\n\n整本预取消耗更多资源。\n\n## Acceptance criteria\n\n验证缓存容量上限与回退。\n\n## Risks\n\n尚未完成实网验证。\n`;}
