import React,{useEffect,useRef,useState} from 'react';
import ReactMarkdown,{defaultUrlTransform} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {X,FileText,LoaderCircle,Image as ImageIcon} from 'lucide-react';

export const COLORS={proposed:'var(--dsc-proposed)',implemented:'var(--dsc-implemented)',rejected:'var(--dsc-rejected)',archived:'var(--dsc-archived)',document:'var(--dsc-document)',missing:'var(--dsc-rejected)'};
export function IconButton({icon:Icon,label,onClick,active,disabled,...props}) {
  return <button type="button" className={`dsc-icon-button ${active?'is-active':''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled} {...props}><Icon size={16} aria-hidden="true"/></button>;
}
export function Status({node,t}) {return <span className="dsc-status" style={{'--dsc-mark':COLORS[node.lifecycle]||COLORS.document}}><i/>{t(`status.${node.lifecycle}`)}</span>;}
export function Empty({title,hint,children}) {return <div className="dsc-empty"><FileText size={30} strokeWidth={1.3}/><h3>{title}</h3>{hint?<p>{hint}</p>:null}{children}</div>;}
export function Loading({t}) {return <div className="dsc-loading" role="status"><LoaderCircle size={18} className="dsc-spin"/>{t('loading')}</div>;}
export function Modal({title,onClose,children,t,wide=false}) {
  const ref=useRef(null);
  useEffect(()=>{
    const before=document.activeElement;ref.current?.focus();
    return()=>{if(before?.isConnected)before.focus();};
  },[]);
  function key(event) {
    if(event.key==='Escape'){event.stopPropagation();onClose();}
    if(event.key==='Tab'&&document.activeElement===ref.current&&!event.shiftKey){event.preventDefault();ref.current.querySelector('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')?.focus();return;}
    if(event.key==='Tab') {
      const targets=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')];
      const first=targets[0],last=targets.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }
  return <div className="dsc-modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className={`dsc-modal ${wide?'dsc-modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={key}><header><h3>{title}</h3><IconButton icon={X} label={t('close')} onClick={onClose}/></header>{children}</section></div>;
}
export function Markdown({content,path='',sources=[],onOpen,t}) {
  function open(href) {
    if(href?.startsWith('dsc-source:')) {const source=sources.find(s=>s.ref===href.slice(11));if(source)onOpen(source.path);return;}
    try {const url=new URL(href,`https://decision-canvas.invalid/${path}`);if(url.origin==='https://decision-canvas.invalid')onOpen(decodeURIComponent(url.pathname.slice(1)));}catch{}
  }
  const rendered=sources.length?content.replace(/\[S(\d+)\]/g,(match,n)=>sources.some(s=>s.ref===`S${n}`)?`[S${n}](dsc-source:S${n})`:match):content;
  return <div className="dsc-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={url=>url.startsWith('dsc-source:')?url:defaultUrlTransform(url)} components={{
    a:({href,children})=>/^(https?:|mailto:)/i.test(href||'')?<a href={href} target="_blank" rel="noreferrer noopener">{children}</a>:<button className="dsc-inline-link" onClick={()=>open(href)}>{children}</button>,
    img:({src,alt})=><button className="dsc-file-link" onClick={()=>open(src)}><ImageIcon size={14}/>{alt||t('viewImage')}</button>,
  }}>{rendered}</ReactMarkdown></div>;
}
export function Document({api,workspaceId,path,t,onOpen,content:provided}) {
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    if(provided!==undefined){setData({kind:'markdown',content:provided,path});setError('');return;}
    const controller=new AbortController();setData(null);setError('');
    api('document',{workspaceId,path},controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[api,workspaceId,path,provided]);
  if(error)return <p className="dsc-error" role="alert">{error}</p>;
  if(!data)return <Loading t={t}/>;
  if(data.kind==='image')return <img className="dsc-image-preview" src={data.dataUrl} alt={path}/>;
  return data.kind==='markdown'?<Markdown content={data.content} path={path} t={t} onOpen={onOpen}/>:<pre className="dsc-text-preview">{data.content}</pre>;
}
