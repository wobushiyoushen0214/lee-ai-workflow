import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CanvasError, check, relativePath } from './shared.js';
const exec=promisify(execFile);

async function git(root,args) {
  try { return (await exec('git',['-c','core.quotepath=false','--no-pager',...args],{cwd:root,timeout:15000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat'}})).stdout; }
  catch(error) { throw new CanvasError('git-unavailable',error.killed?'Git 查询超时':'无法读取 Git 历史，请确认工作区是本地 Git 仓库'); }
}
export async function history(files,path) {
  const safe=relativePath(path); await files.target(safe);
  const output=await git(files.root,['log','--follow','-n','40','--format=%x1e%H%x1f%aI%x1f%s','--name-only','--',`:(literal)${safe}`]);
  return output.split('\x1e').filter(Boolean).map(entry=>{
    const [header,...lines]=entry.trim().split('\n'); const [commit,date,subject]=header.split('\x1f');
    return {commit,date,subject,path:lines.find(l=>l.trim())?.trim()||safe};
  }).filter(e=>/^[a-f0-9]{40,64}$/.test(e.commit));
}
export async function historicalDocument(files,path,commit) {
  check(/^[a-f0-9]{40,64}$/.test(commit),'invalid-commit','提交标识无效');
  const entry=(await history(files,path)).find(e=>e.commit===commit);
  check(entry,'unknown-commit','该提交不在此文件的历史记录中');
  const safe=relativePath(entry.path); await files.target(safe);
  return {...entry,content:await git(files.root,['show',`${commit}:${safe}`]),kind:'markdown'};
}
