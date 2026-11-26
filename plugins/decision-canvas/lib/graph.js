import { posix } from 'node:path';
import { readWorkflowConfig } from './workflow-config.js';
import { parseDocument } from './markdown.js';
import { hash, mapLimit, errorData } from './shared.js';

export async function scanWorkspace(files) {
  const started = performance.now();
  const workflow = await readWorkflowConfig(files);
  const roots = await Promise.all([
    files.walk(workflow.notesDir, p => p.endsWith('.md'), { maxDepth:3 }),
    files.walk(workflow.evidenceDir, p => workflow.evidenceReadmes.includes(posix.basename(p))),
    files.walk(workflow.releasesDir, p => p.endsWith('.md'), { maxDepth:0 }),
  ]);
  const paths = [...new Set(roots.flatMap(r=>r.files))].sort();
  const diagnostics = [];
  const documents = (await mapLimit(paths,8,async path=>{
    try { return parseDocument(await files.read(path), workflow); }
    catch(error) { diagnostics.push({ path, ...errorData(error) }); return null; }
  })).filter(Boolean);
  const counts = new Map();
  for (const doc of documents) counts.set(doc.id,(counts.get(doc.id)||0)+1);
  for (const doc of documents) {
    if (counts.get(doc.id)>1) {
      doc.id += `@${hash(doc.path).slice(0,10)}`;
      doc.diagnostics.push({ code:'duplicate-identity', message:'同一分类和文件名有多个副本，已分开显示' });
    }
    diagnostics.push(...doc.diagnostics.map(d=>({ path:doc.path,...d })));
  }
  const byPath = new Map(documents.map(doc=>[doc.path,doc]));
  const targets = [...new Set(documents.flatMap(doc=>doc.links.filter(l=>l.targetPath).map(l=>l.targetPath)))];
  const existence = new Map(await mapLimit(targets,16,async path=>{
    try { return [path,Boolean(await files.stat(path))]; } catch { return [path,false]; }
  }));
  const edgeMap = new Map(); const missing = new Map();
  for (const doc of documents) for (const link of doc.links) {
    if (link.invalid) { diagnostics.push({ path:doc.path,line:link.line,code:'invalid-link',message:`无法解析的本地链接：${link.url}` }); continue; }
    if (!link.targetPath) continue;
    link.exists = existence.get(link.targetPath) === true;
    if (!link.exists) {
      diagnostics.push({ path:doc.path,line:link.line,code:'broken-link',message:`引用目标不存在：${link.targetPath}` });
      if (link.targetPath.startsWith(workflow.notesDir + '/') && !missing.has(link.targetPath)) missing.set(link.targetPath, {
        id:`missing:${link.targetPath}`,path:link.targetPath,title:posix.basename(link.targetPath),kind:'missing',lifecycle:'missing',category:'missing',date:'',summary:'文件不存在，原始引用仍保留',searchText:link.targetPath,sha:'',diagnostics:[],links:[],headings:[],sections:{},content:''
      });
    }
    const target = byPath.get(link.targetPath) || missing.get(link.targetPath);
    if (!target || doc.id === target.id) continue;
    const key = `${doc.id}\0${target.id}`;
    const provenance = { path:doc.path,line:link.line,section:link.section,label:link.label,anchor:link.anchor };
    if (edgeMap.has(key)) edgeMap.get(key).provenance.push(provenance);
    else edgeMap.set(key,{ id:`ref:${hash(key).slice(0,20)}`,source:doc.id,target:target.id,relation:'references',origin:'markdown',provenance:[provenance] });
  }
  const all = [...documents,...missing.values()];
  const nodes = all.map(({ content, sections, ...node })=>node);
  const edges = [...edgeMap.values()];
  const revision = hash(JSON.stringify([nodes.map(n=>[n.id,n.path,n.sha]),edges,diagnostics]));
  return {
    workflow,
    documents:new Map(all.map(doc=>[doc.id,doc])),
    snapshot:{ revision,nodes,edges,diagnostics,stats:{ documents:documents.length,decisions:documents.filter(d=>d.kind==='decision').length,edges:edges.length,scanMs:Math.round(performance.now()-started) } },
    watchPaths:[...new Set([...roots.flatMap(r=>r.directories),...paths,'workflow.config.json','.'])],
  };
}

/** 引用邻居双向展开；保留有环的原图。 */
export function neighbors(graph, selected, depth=1) {
  const result = new Set(selected); let frontier = new Set(selected);
  for (let level=0;level<depth;level++) {
    const next = new Set();
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !result.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !result.has(edge.source)) next.add(edge.source);
    }
    for(const id of next) result.add(id); frontier=next;
  }
  return result;
}
