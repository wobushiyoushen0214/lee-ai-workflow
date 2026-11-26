import React,{useCallback,useDeferredValue,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Network,Search,RefreshCw,Save,Download,GitBranch,Sun,Moon,Monitor,FileText,SlidersHorizontal,List,Plus,Pin,PinOff,AlertCircle,Link2,X,FolderPlus,PanelLeft,PanelRight,ChevronDown,ChevronRight,Layers,Bug,Workflow,FlaskConical,Boxes,Check,CalendarDays,RotateCcw} from 'lucide-react';
import {GraphCanvas} from './canvas.jsx';
import {Document,Empty,IconButton,Loading,Modal,Status} from './components.jsx';
import {blankProposal,CATEGORIES,ProposalForm} from './proposal-form.jsx';
import {ReferenceBar} from './reference-bar.jsx';
import {readTheme,applyTheme} from './theme.js';
import {download,preference,savePreference} from './api.js';
import {createLoadGate,filterGraph,groupByDate} from './view-model.js';

const CATEGORY_ICONS={feature:Layers,'bug-fix':Bug,simplification:SlidersHorizontal,architecture:Boxes,process:Workflow,testing:FlaskConical};
const LIFECYCLES=['proposed','implemented','rejected','archived'];
const RELATIONS=['references','depends-on','extends','supersedes','conflicts-with'];
function setEqual(a,b) {return a.length===b.length&&a.every((value,i)=>value===b[i]);}

function RecordDetails({node,api,workspaceId,t,onOpen,onPin,pinned}) {
  const [tab,setTab]=useState('original'),[commits,setCommits]=useState([]),[version,setVersion]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setVersion(null);setError('');setCommits([]);setTab('original');},[node?.id]);
  useEffect(()=>{
    if(tab!=='history'||!node)return;const controller=new AbortController();setError('');
    api('history',{workspaceId,path:node.path},controller.signal).then(value=>setCommits(value.history)).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
  },[api,workspaceId,node?.path,tab]);
  if(!node)return <Empty title={t('selectRecord')}/>;
  return <div className="dsc-record-details"><header><div className="dsc-record-meta"><Status node={node} t={t}/><span>{t(`category.${node.category}`)}</span><span>{node.date}</span><IconButton icon={pinned?PinOff:Pin} label={t(pinned?'unpin':'pin')} onClick={onPin} active={pinned}/></div><h2>{node.title}</h2><p className="dsc-path" title={node.path}>{node.path}</p></header><div className="dsc-tabs">{['original','links','history'].map(item=><button key={item} className={tab===item?'is-active':''} onClick={()=>setTab(item)}>{t(item)}</button>)}</div>{error?<p className="dsc-error">{error}</p>:null}
    {tab==='original'?<Document api={api} workspaceId={workspaceId} path={node.path} t={t} onOpen={onOpen}/>:null}
    {tab==='links'?<div className="dsc-link-list">{node.links.map((link,i)=><div key={i}>{link.external?<a href={/^https?:/i.test(link.url)?link.url:undefined} target="_blank" rel="noreferrer noopener">{link.label}</a>:<button onClick={()=>onOpen(link.targetPath)} disabled={!link.targetPath}>{link.label}</button>}<small>{link.section} · {t('line')} {link.line}{link.exists===false?' · ⚠':''}</small></div>)}<details><summary>{t('noteIdentity')}</summary><code>{node.id}</code></details></div>:null}
    {tab==='history'?version?<><button className="dsc-link-button" onClick={()=>setVersion(null)}><ArrowLeft size={14}/>{t('current')}</button><p className="dsc-muted">{version.commit.slice(0,8)} · {version.date}</p><Document api={api} workspaceId={workspaceId} path={version.path} content={version.content} t={t} onOpen={onOpen}/></>:<div className="dsc-history-list">{commits.length?commits.map(item=><button key={item.commit} onClick={()=>api('historical',{workspaceId,path:node.path,commit:item.commit}).then(setVersion).catch(e=>setError(e.message))}><strong>{item.subject}</strong><small>{item.commit.slice(0,8)} · {item.date.slice(0,10)}</small></button>):<p className="dsc-muted">{t('noHistory')}</p>}</div>:null}
  </div>;
}

function EdgeDetails({edge,nodes,t,onOpen,onRemove}) {
  const byId=new Map(nodes.map(node=>[node.id,node]));
  return <div className="dsc-edge-details"><span className="dsc-muted">{t(edge.bidirectional?'mutualReferences':edge.origin==='manual'?'manual':'references')}</span><h3>{edge.bidirectional?t('mutualReferences'):edge.label||t(`relation.${edge.relation}`)}</h3>
    {(edge.relatedEdges||[edge]).map(item=><section className="dsc-edge-source" key={item.id}><p>{byId.get(item.source)?.title} → {byId.get(item.target)?.title}</p>{item.provenance?.map((source,i)=><button key={i} className="dsc-file-link" onClick={()=>onOpen(source.path)}>{source.section||source.path} · {t('line')} {source.line}</button>)}</section>)}
    <button onClick={onRemove}>{t(edge.origin==='manual'?'removeRelation':edge.bidirectional?'hideMutualReferences':'hideRelation')}</button>
  </div>;
}

export function App({api,t,goBack}) {
  const [theme,setTheme]=useState(readTheme);
  const [contextId,setContextId]=useState(()=>new URLSearchParams(location.search).get('context')||'');
  useEffect(()=>applyTheme(theme),[theme]);
  const [workspaces,setWorkspaces]=useState([]),[workspaceId,setWorkspaceId]=useState(()=>new URLSearchParams(location.search).get('workspace')||preference('workspace',''));
  const [data,setData]=useState(null),[board,setBoard]=useState(null),[version,setVersion]=useState(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false);
  const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[category,setCategory]=useState(''),[fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState(''),[materials,setMaterials]=useState(false),[view,setView]=useState('canvas'),[focus,setFocus]=useState(false);
  const [layoutAdjusted,setLayoutAdjusted]=useState(false);
  const [selectedIds,setSelectedIds]=useState([]),[aside,setAside]=useState('details'),[inspectorOpen,setInspectorOpen]=useState(false),[filtersOpen,setFiltersOpen]=useState(()=>window.innerWidth>=1000),[edge,setEdge]=useState(null),[connection,setConnection]=useState(null),[relation,setRelation]=useState('references'),[relationNote,setRelationNote]=useState('');
  const [previewPath,setPreviewPath]=useState(null),[newProposal,setNewProposal]=useState(false),[addingWorkspace,setAddingWorkspace]=useState(false),[newPath,setNewPath]=useState(''),[rename,setRename]=useState(false),[oldId,setOldId]=useState(''),[newId,setNewId]=useState('');
  const loadGate=useRef(createLoadGate());
  const flow=useRef(null),root=useRef(null),epoch=useRef(0),revision=useRef(null),dirtyRef=useRef(false),versionRef=useRef(null),loadSequence=useRef(0),editSequence=useRef(0),savingRef=useRef(false);
  dirtyRef.current=dirty;versionRef.current=version;
  const deferredQuery=useDeferredValue(query.toLowerCase());
  useEffect(()=>{const c=new AbortController();api('workspaces',{},c.signal).then(value=>{setWorkspaces(value.workspaces);if(!workspaceId||!value.workspaces.some(w=>w.id===workspaceId))setWorkspaceId(value.workspaces[0]?.id||'');}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[api]);
  const load=useCallback(async(force=false,replace=false)=>{
    if(!workspaceId||savingRef.current)return;
    const requestEpoch=epoch.current;
    return loadGate.current(`${workspaceId}:${requestEpoch}`,async()=>{
    if(requestEpoch!==epoch.current||savingRef.current)return;
    const sequence=++loadSequence.current;
    try {
      const result=await api('graph',{workspaceId,force,knownRevision:force?undefined:revision.current});
      if(requestEpoch!==epoch.current||sequence!==loadSequence.current)return;
      if(result.unchanged)return result;
      revision.current=result.revision;setData(result);
      if(!dirtyRef.current||replace){setBoard(result.board);setVersion(result.version);setDirty(false);setConflict(false);}
      else if(result.version!==versionRef.current)setConflict(true);
      setError('');return result;
    }catch(e){if(requestEpoch===epoch.current&&sequence===loadSequence.current)setError(e.message);}
    },force);
  },[api,workspaceId]);
  useEffect(()=>{
    epoch.current++;loadSequence.current++;editSequence.current=0;savingRef.current=false;setSaving(false);revision.current=null;setData(null);setBoard(null);setVersion(null);setDirty(false);setLayoutAdjusted(false);dirtyRef.current=false;setError('');setConflict(false);setSelectedIds([]);setEdge(null);setFocus(false);setPreviewPath(null);setConnection(null);setRename(false);setNewProposal(false);setInspectorOpen(false);
    if(!workspaceId)return;savePreference('workspace',workspaceId);setBusy(true);let active=true;
    load(true,true).finally(()=>{if(active)setBusy(false);});
    const interval=setInterval(()=>{if(document.visibilityState==='visible')load();},3500);
    return()=>{active=false;epoch.current++;clearInterval(interval);};
  },[workspaceId,load]);
  useEffect(()=>{if(!workspaceId||contextId)return;let active=true;api('open_context',{workspaceId}).then(result=>{if(!active)return;setContextId(result.contextId);const url=new URL(location.href);url.searchParams.set('context',result.contextId);history.replaceState(null,'',url.pathname+url.search);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,workspaceId,contextId]);
  const updateBoard=useCallback(fn=>{editSequence.current++;dirtyRef.current=true;setBoard(previous=>fn(previous));setDirty(true);setNotice('');},[]);
  const positions=useCallback(next=>updateBoard(previous=>({...previous,positions:{...previous.positions,...next}})),[updateBoard]);
  const select=useCallback(ids=>{setSelectedIds(previous=>setEqual(previous,ids)?previous:ids);},[]);
  const openAside=value=>{setAside(value);setInspectorOpen(true);};
  const selectedNode=data?.graph.nodes.find(node=>node.id===selectedIds[0]);
  const allEdges=useMemo(()=>data&&board?[...data.graph.edges,...board.manualEdges].filter(e=>!board.hiddenEdgeIds.includes(e.id)):[],[data,board?.manualEdges,board?.hiddenEdgeIds]);
  const layoutGraph=useMemo(()=>({nodes:data?.graph.nodes||[],edges:allEdges}),[data?.graph.nodes,allEdges]);
  const filtered=useMemo(()=>{
    if(!data)return {nodes:[],edges:[]};
    return filterGraph(data.graph,allEdges,{materials,status,category,fromDate,toDate,query:deferredQuery,focus,selectedIds});
  },[data,materials,status,category,fromDate,toDate,deferredQuery,focus,selectedIds,allEdges]);
  async function save() {
    if(!board||savingRef.current)return;const requestEpoch=epoch.current,edit=editSequence.current;savingRef.current=true;loadSequence.current++;setSaving(true);setError('');
    try {
      const next={...board,positions:{...board.positions,...flow.current?.positions()}};
      const result=await api('save_board',{workspaceId,board:next,expectedVersion:version});
      if(requestEpoch!==epoch.current)return;
      setVersion(result.version);versionRef.current=result.version;setConflict(false);revision.current=null;
      if(edit===editSequence.current){setBoard(result.board);setDirty(false);dirtyRef.current=false;setNotice(t('saved'));}
    }catch(e){if(requestEpoch===epoch.current){setError(e.message);if(e.code==='conflict')setConflict(true);}}finally{if(requestEpoch===epoch.current){savingRef.current=false;setSaving(false);}}
  }
  const saveRef=useRef(save);saveRef.current=save;
  useEffect(()=>{
    const listener=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'&&root.current?.contains(document.activeElement)){e.preventDefault();saveRef.current();}};
    window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);
  },[]);
  useEffect(()=>{if(!dirty)return;const listener=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[dirty]);
  function switchWorkspace(next) {
    if(next===workspaceId)return;if(dirty&&!window.confirm(t('discard')))return;
    epoch.current++;savePreference('workspace',next);setWorkspaceId(next);
    const url=new URL(location.href);if(next)url.searchParams.set('workspace',next);else url.searchParams.delete('workspace');
    history.replaceState(null,'',url.pathname+url.search);
  }
  async function exportFile() {
    try {const result=await api('export',{workspaceId,board:{...board,positions:{...board.positions,...flow.current?.positions()}},nodeIds:filtered.nodes.map(n=>n.id)});download('decisions.canvas',JSON.stringify(result.canvas,null,2),'application/json');}catch(e){setError(e.message);}
  }
  async function created(path,warning) {
    if(warning)setNotice(warning);else setNotice(t('proposalSaved'));
    const next=await load(true);const node=next?.graph.nodes.find(n=>n.path===path);if(node){setSelectedIds([node.id]);openAside('details');}else setPreviewPath(path);
  }
  function connect(value) {if(value.source===value.target)return;setConnection(value);setRelation('references');setRelationNote('');}
  function saveRelation() {updateBoard(previous=>({...previous,manualEdges:[...previous.manualEdges,{id:`manual:${crypto.randomUUID()}`,source:connection.source,target:connection.target,relation,label:relationNote,origin:'manual',createdAt:new Date().toISOString()}]}));setConnection(null);}
  function pin() {if(selectedNode){const current=flow.current?.positions()?.[selectedNode.id];updateBoard(previous=>({...previous,positions:current?{...previous.positions,[selectedNode.id]:current}:previous.positions,pinnedNodeIds:previous.pinnedNodeIds.includes(selectedNode.id)?previous.pinnedNodeIds.filter(id=>id!==selectedNode.id):[...previous.pinnedNodeIds,selectedNode.id]}));}}
  const clearFilters=()=>{setQuery('');setStatus('');setCategory('');setFromDate('');setToDate('');setFocus(false);setMaterials(false);};
  const orphanIds=useMemo(()=>{
    if(!board||!data)return [];const ids=new Set(data.graph.nodes.map(n=>n.id));return [...new Set([...Object.keys(board.positions),...board.manualEdges.flatMap(e=>[e.source,e.target])])].filter(id=>!ids.has(id)&&!Object.hasOwn(board.nodeAliases,id));
  },[board,data]);
  const dateGroups=useMemo(()=>groupByDate(filtered.nodes),[filtered.nodes]);
  const counts=useMemo(()=>{const result={};for(const node of data?.graph.nodes||[])if(node.kind==='decision'){result[node.lifecycle]=(result[node.lifecycle]||0)+1;result[node.category]=(result[node.category]||0)+1;}return result;},[data]);
  const hasFilters=Boolean(query||status||category||fromDate||toDate||focus||materials);
  return <div className="dsc-app" ref={root}>
    <header className="dsc-header">
      {goBack?<IconButton icon={ArrowLeft} label={t('back')} onClick={()=>{if(!dirty||window.confirm(t('discardExit')))goBack();}}/>:null}
      <div className="dsc-brand"><span className="dsc-brand-icon"><Network size={18}/></span><h1>{t('title')}</h1></div>
      <span className="dsc-header-divider"/>
      <select className="dsc-workspace-select" aria-label={t('workspace')} value={workspaceId} onChange={e=>switchWorkspace(e.target.value)}><option value="">{t('chooseWorkspace')}</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.title||w.path.split('/').at(-1)}</option>)}</select>
      <IconButton icon={FolderPlus} label={t('addWorkspace')} onClick={()=>setAddingWorkspace(true)}/>
      <div className="dsc-header-spacer"/>
      <label className="dsc-theme-control" title={t('appearance')}>{theme==='dark'?<Moon size={14}/>:theme==='light'?<Sun size={14}/>:<Monitor size={14}/>}<select aria-label={t('appearance')} value={theme} onChange={e=>setTheme(e.target.value)}><option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option></select></label>
      {workspaceId?<button className="dsc-new-entry" aria-label={t('newProposal')} title={t('newProposal')} onClick={()=>setNewProposal(true)}><Plus size={15}/>{t('newProposal')}</button>:null}
    </header>
    {workspaceId?<>
      <div className="dsc-toolbar">
        <IconButton icon={PanelLeft} label={t(filtersOpen?'hideFilters':'showFilters')} active={filtersOpen} aria-expanded={filtersOpen} aria-controls="dsc-filters" onClick={()=>setFiltersOpen(!filtersOpen)}/>
        <div className="dsc-search"><Search size={16}/><input type="search" name="decision-search" autoComplete="off" placeholder={t('search')} aria-label={t('search')} value={query} onChange={e=>setQuery(e.target.value)}/>{query?<IconButton icon={X} label={t('clearSearch')} onClick={()=>setQuery('')}/>:null}</div>
        <div className="dsc-view-toggle" role="group" aria-label={t('view')}><button aria-pressed={view==='canvas'} className={view==='canvas'?'is-active':''} onClick={()=>setView('canvas')}><Network size={14}/>{t('canvasShort')}</button><button aria-pressed={view==='timeline'} className={view==='timeline'?'is-active':''} onClick={()=>setView('timeline')}><List size={14}/>{t('timelineShort')}</button></div>
        <span className="dsc-toolbar-divider"/>
        <button className={`dsc-focus-button ${focus?'is-active':''}`} aria-pressed={focus} title={t('focusHint')} aria-label={t(focus?'allGraph':'focus')} onClick={()=>setFocus(!focus)} disabled={!selectedIds.length}><GitBranch size={14}/>{t(focus?'allGraph':'focus')}</button>
        <IconButton icon={SlidersHorizontal} label={t('layout')} onClick={()=>flow.current?.layout()} disabled={view!=='canvas'||!data}/>
        <IconButton icon={RefreshCw} label={t('refresh')} onClick={()=>load(true)} disabled={busy}/>
        <div className="dsc-header-spacer"/>
        {dirty||layoutAdjusted?<span className={`dsc-save-state ${dirty||layoutAdjusted?'is-dirty':''}`} role="status">{dirty||layoutAdjusted?<i/>:<Check size={12}/>}<span>{t(dirty?'unsaved':layoutAdjusted?'layoutAdjusted':'syncedLayout')}</span></span>:null}
        <button className={dirty||layoutAdjusted?'dsc-save-button is-active':'dsc-save-button'} title={t('shortcuts')} aria-label={t('save')} onClick={save} disabled={!board||saving||(!dirty&&!layoutAdjusted)}><Save size={14}/>{t(saving?'saving':'save')}</button>
        <IconButton icon={Download} label={t('export')} onClick={exportFile} disabled={!board}/>
        <IconButton icon={PanelRight} label={t(inspectorOpen?'hideDetails':'showDetails')} active={inspectorOpen} aria-expanded={inspectorOpen} aria-controls="dsc-inspector" onClick={()=>setInspectorOpen(!inspectorOpen)}/>
      </div>
      {error?<div className="dsc-banner dsc-error" role="alert"><AlertCircle size={15}/><span>{error}</span><button onClick={()=>load(true)}>{t('retry')}</button><IconButton icon={X} label={t('close')} onClick={()=>setError('')}/></div>:notice?<div className="dsc-banner" role="status"><Check size={15}/><span>{notice}</span><IconButton icon={X} label={t('close')} onClick={()=>setNotice('')}/></div>:null}
      {conflict?<div className="dsc-banner dsc-warning" role="alert"><span>{t('changeConflict')}</span><button onClick={()=>download('decisions-layout-backup.json',JSON.stringify(board,null,2),'application/json')}>{t('exportLayout')}</button><button onClick={()=>{if(window.confirm(t('discardReload')))load(true,true);}}>{t('reload')}</button></div>:null}
      <div className="dsc-workspace">
        <nav id="dsc-filters" aria-label={t('filters')} className="dsc-filters" hidden={!filtersOpen}>

          <button className={`dsc-category ${!category?'is-active':''}`} aria-pressed={!category} onClick={()=>setCategory('')}><FileText size={15}/>{t('allCategories')}<span>{data?.graph.stats.decisions||0}</span></button>
          {CATEGORIES.map(item=>{const Icon=CATEGORY_ICONS[item];return <button key={item} className={`dsc-category ${category===item?'is-active':''}`} aria-pressed={category===item} onClick={()=>setCategory(category===item?'':item)}><Icon size={15}/>{t(`category.${item}`)}<span>{counts[item]||0}</span></button>;})}
          <div className="dsc-sidebar-separator"/>
          <details className="dsc-date-section" open={fromDate||toDate?true:undefined}><summary><CalendarDays size={14}/>{t('dateRange')}<ChevronDown size={13}/></summary><div className="dsc-date-filters"><label>{t('fromDate')}<input name="from-date" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label>{t('toDate')}<input name="to-date" type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label></div></details>
          <label className="dsc-checkbox"><input type="checkbox" checked={materials} onChange={e=>setMaterials(e.target.checked)}/><span>{t('materials')}</span></label>
          {hasFilters?<button className="dsc-link-button dsc-reset" onClick={clearFilters}><RotateCcw size={12}/>{t('clearFilters')}</button>:null}
          <div className="dsc-filter-bottom">

            <details className="dsc-management"><summary>{t('manageCanvas')}<ChevronDown size={13}/></summary><button onClick={()=>{setRename(true);setOldId(orphanIds[0]||'');setNewId(selectedNode?.id||'');}}><Link2 size={14}/>{t('bindRename')}{orphanIds.length?` (${orphanIds.length})`:''}</button>{board?.hiddenEdgeIds.length?<button onClick={()=>updateBoard(previous=>({...previous,hiddenEdgeIds:[]}))}>{t('showHidden')}</button>:null}</details>
            <button className={`dsc-issues-button ${inspectorOpen&&aside==='issues'?'is-active':''}`} onClick={()=>openAside('issues')}><AlertCircle size={14}/>{t('issues')}<span>{data?.graph.diagnostics.length||0}</span></button>
          </div>
        </nav>
        <main className="dsc-stage" aria-label={t('decisionLibrary')} aria-busy={busy}>
          <div className="dsc-stage-heading"><div><h2>{category?t(`category.${category}`):t('allDecisions')}</h2><span>{filtered.nodes.length} {t('records')}</span></div><div className="dsc-status-filters" role="group" aria-label={t('allStatus')}><button className={!status?'is-active':''} aria-pressed={!status} onClick={()=>setStatus('')}>{t('all')}</button>{LIFECYCLES.map(item=><button key={item} className={status===item?'is-active':''} aria-pressed={status===item} onClick={()=>setStatus(status===item?'':item)}><i className={`dsc-lifecycle-${item}`}/>{t(`status.${item}`)}<span>{counts[item]||0}</span></button>)}</div></div>
          {hasFilters?<div className="dsc-active-filters" role="status">{category?<button onClick={()=>setCategory('')}>{t(`category.${category}`)}<X size={11}/></button>:null}{query?<button onClick={()=>setQuery('')}>{query}<X size={11}/></button>:null}{fromDate||toDate?<button onClick={()=>{setFromDate('');setToDate('');}}>{fromDate||'…'} → {toDate||'…'}<X size={11}/></button>:null}{focus?<button onClick={()=>setFocus(false)}>{t('focus')}<X size={11}/></button>:null}{materials?<button onClick={()=>setMaterials(false)}>{t('materials')}<X size={11}/></button>:null}<button className="dsc-link-button" onClick={clearFilters}>{t('clearFilters')}</button></div>:null}
          {data?.graph.nodes.length?<div className="dsc-canvas-layer" hidden={view!=='canvas'||!filtered.nodes.length}><GraphCanvas ref={flow} graph={filtered} layoutGraph={layoutGraph} board={board} selectedIds={selectedIds} onSelect={select} onOpen={()=>{setInspectorOpen(true);setEdge(null);}} onPositions={positions} onLayoutAdjusted={setLayoutAdjusted} onConnect={connect} onEdge={value=>{setEdge(value);openAside('details');}} t={t}/></div>:null}
          {busy&&!data?<Loading t={t}/>:!data?<Empty title={error||t('empty')}><button onClick={()=>load(true)}>{t('retry')}</button></Empty>:!data.graph.nodes.length?<Empty title={t('empty')}><button className="dsc-primary" onClick={()=>setNewProposal(true)}><Plus size={14}/>{t('newProposal')}</button></Empty>:!filtered.nodes.length?<Empty title={t('noMatches')}><button onClick={clearFilters}>{t('clearFilters')}</button></Empty>:view==='canvas'?null:<div className="dsc-timeline">{dateGroups.map(group=><section className="dsc-date-group" key={group.date}><header><span className="dsc-date-dot"/><h3>{group.date||t('undated')}</h3><span>{group.records.length} {t('records')}</span></header><div className="dsc-date-records">{group.records.map(node=><button className={`dsc-timeline-card ${selectedIds.includes(node.id)?'is-selected':''}`} aria-pressed={selectedIds.includes(node.id)} key={node.id} onClick={e=>{select(e.metaKey||e.ctrlKey?(selectedIds.includes(node.id)?selectedIds.filter(id=>id!==node.id):[...selectedIds,node.id]):[node.id]);setEdge(null);openAside('details');}}><div className="dsc-list-card-meta"><span>{t(`category.${node.category}`)}</span><Status node={node} t={t}/></div><h3>{node.title}<ChevronRight size={15}/></h3><p>{node.summary}</p><span className="dsc-list-card-footer"><Link2 size={12}/>{node.links.length} {t('referencesShort')}<span>{node.path.split('/').at(-1)}</span></span></button>)}</div></section>)}</div>}
          <ReferenceBar api={api} workspaceId={workspaceId} workspacePath={data?.workspace.path} nodes={(data?.graph.nodes||[]).filter(node=>selectedIds.includes(node.id))} contextId={contextId} t={t} onNotice={setNotice} onError={setError} onClear={()=>setSelectedIds([])}/>
        </main>
        <aside id="dsc-inspector" className="dsc-inspector" hidden={!inspectorOpen} aria-label={t('details')}>
          <div className="dsc-inspector-tabs"><button className={aside==='details'?'is-active':''} aria-pressed={aside==='details'} onClick={()=>{setAside('details');setEdge(null);}}><FileText size={14}/>{t('details')}</button>{aside==='issues'?<span className="dsc-inspector-issues-label">{t('issues')}</span>:null}<IconButton icon={X} label={t('hideDetails')} onClick={()=>setInspectorOpen(false)}/></div>
          <div hidden={aside!=='details'} className="dsc-inspector-scroll">{edge?<EdgeDetails edge={edge} nodes={data?.graph.nodes||[]} t={t} onOpen={setPreviewPath} onRemove={()=>{if(edge.origin==='manual'&&!window.confirm(t('confirmRemoveRelation')))return;const ids=(edge.relatedEdges||[edge]).map(item=>item.id);updateBoard(previous=>edge.origin==='manual'?{...previous,manualEdges:previous.manualEdges.filter(e=>!ids.includes(e.id))}:{...previous,hiddenEdgeIds:[...new Set([...previous.hiddenEdgeIds,...ids])]});setEdge(null);}}/>:<RecordDetails key={`${workspaceId}:${selectedNode?.id||"empty"}`} node={selectedNode} api={api} workspaceId={workspaceId} t={t} onOpen={setPreviewPath} onPin={pin} pinned={board?.pinnedNodeIds.includes(selectedNode?.id)}/>}</div>

          <div hidden={aside!=='issues'} className="dsc-inspector-scroll dsc-diagnostics">{data?.graph.diagnostics.length?<>{data.graph.diagnostics.map((issue,i)=><button key={i} onClick={()=>setPreviewPath(issue.path)}><strong>{issue.message}</strong><small>{issue.path}{issue.line?`:${issue.line}`:''}</small><ChevronRight size={13}/></button>)}</>:<Empty title={t('noIssues')}/>}</div>
        </aside>
      </div>
    </>:<Empty title={t('noWorkspace')}><div className="dsc-workspace-cards">{workspaces.map(workspace=><button key={workspace.id} onClick={()=>switchWorkspace(workspace.id)}><Network size={18}/><strong>{workspace.title||workspace.path.split('/').at(-1)}</strong><span>{workspace.path}</span><ChevronRight size={15}/></button>)}</div><button className="dsc-primary" onClick={()=>setAddingWorkspace(true)}><FolderPlus size={15}/>{t('addWorkspace')}</button></Empty>}
    {previewPath?<Modal title={previewPath.split('/').at(-1)} onClose={()=>setPreviewPath(null)} t={t} wide><div className="dsc-modal-document"><Document api={api} workspaceId={workspaceId} path={previewPath} t={t} onOpen={setPreviewPath}/></div></Modal>:null}
    {connection?<Modal title={t('connectTitle')} onClose={()=>setConnection(null)} t={t}><p className="dsc-muted">{data.graph.nodes.find(n=>n.id===connection.source)?.title} → {data.graph.nodes.find(n=>n.id===connection.target)?.title}</p><label className="dsc-field"><span>{t('relationType')}</span><select value={relation} onChange={e=>setRelation(e.target.value)}>{RELATIONS.map(r=><option key={r} value={r}>{t(`relation.${r}`)}</option>)}</select></label><label className="dsc-field"><span>{t('relationNote')}</span><textarea value={relationNote} onChange={e=>setRelationNote(e.target.value)} maxLength={500}/></label><footer><button onClick={()=>setConnection(null)}>{t('cancel')}</button><button className="dsc-primary" onClick={saveRelation}>{t('connect')}</button></footer></Modal>:null}
    {newProposal?<ProposalForm api={api} workspaceId={workspaceId} initial={blankProposal()} t={t} onClose={()=>setNewProposal(false)} onCreated={created}/>:null}
    {addingWorkspace?<Modal title={t('addWorkspace')} onClose={()=>setAddingWorkspace(false)} t={t}><label className="dsc-field"><span>{t('workspacePath')}</span><input value={newPath} onChange={e=>setNewPath(e.target.value)}/></label><footer><button onClick={()=>setAddingWorkspace(false)}>{t('cancel')}</button><button className="dsc-primary" onClick={async()=>{try{const result=await api('add_workspace',{path:newPath});setWorkspaces((await api('workspaces')).workspaces);switchWorkspace(result.workspace.id);setAddingWorkspace(false);}catch(e){setError(e.message);}}} disabled={!newPath.trim()}>{t('add')}</button></footer></Modal>:null}
    {rename?<Modal title={t('bindRename')} onClose={()=>setRename(false)} t={t}><p className="dsc-muted">{t('renameHint')}</p><label className="dsc-field"><span>{t('oldNode')}</span><input list="dsc-orphan-nodes" value={oldId} onChange={e=>setOldId(e.target.value)}/><datalist id="dsc-orphan-nodes">{orphanIds.map(id=><option key={id} value={id}/>)}</datalist></label><label className="dsc-field"><span>{t('newNode')}</span><select value={newId} onChange={e=>setNewId(e.target.value)}><option value="">{t('selectRecord')}</option>{data?.graph.nodes.map(node=><option key={node.id} value={node.id}>{node.title}</option>)}</select></label><footer><button onClick={()=>setRename(false)}>{t('cancel')}</button><button className="dsc-primary" disabled={!oldId||!newId} onClick={()=>{updateBoard(previous=>({...previous,nodeAliases:{...previous.nodeAliases,[oldId]:newId}}));setRename(false);}}>{t('confirm')}</button></footer></Modal>:null}
  </div>;
}
