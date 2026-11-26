import React,{useEffect,useRef,useState} from 'react';
import {Copy,X} from 'lucide-react';
import {IconButton} from './components.jsx';
import {referenceText} from './reference-text.js';

export function ReferenceBar({api,workspaceId,workspacePath,nodes,contextId,t,onNotice,onError,onClear}) {
  const [busy,setBusy]=useState(false),[references,setReferences]=useState([]);
  const generation=useRef(0);
  useEffect(()=>{
    generation.current++;setReferences([]);setBusy(false);if(!contextId)return;
    const controller=new AbortController();
    api('references',{contextId},controller.signal).then(result=>{if(!controller.signal.aborted)setReferences(result.workspaceId===workspaceId?result.records:[]);}).catch(error=>{if(!controller.signal.aborted)onError(error.message);});
    return()=>{generation.current++;controller.abort();};
  },[api,workspaceId,contextId]);
  async function copy() {
    const epoch=generation.current;
    setBusy(true);
    try {
      const records=nodes.length?nodes:references;
      // Start clipboard access during the click, before any network await.
      await navigator.clipboard.writeText(referenceText(workspacePath,records));
      if(epoch!==generation.current)return;
      onNotice(t('referenceCopied'));
      if(contextId) {
        const result=await api('set_references',{workspaceId,contextId,nodeIds:records.map(node=>node.id)});
        if(epoch===generation.current)setReferences(result.records);
      }
    } catch(error){if(epoch===generation.current)onError(error.message||t('copyFailed'));}
    finally{if(epoch===generation.current)setBusy(false);}
  }
  async function clear() {
    const epoch=generation.current;setBusy(true);
    try {if(contextId&&references.length)await api('set_references',{workspaceId,contextId,nodeIds:[]});if(epoch===generation.current){setReferences([]);onClear();}}
    catch(error){if(epoch===generation.current)onError(error.message);}finally{if(epoch===generation.current)setBusy(false);}
  }
  if(!nodes.length&&!references.length)return null;
  return <div className="dsc-reference-bar" role="region" aria-label={t('sessionReferences')}>
    <span title={references.map(node=>node.title).join('、')}>{nodes.length?`${t('selected')} ${nodes.length}`:`${t('sessionReferences')} ${references.length}`}</span>
    <button onClick={copy} disabled={busy||!workspacePath}><Copy size={14}/>{t('copyToChat')}</button>
    <IconButton icon={X} label={t('clearSelection')} onClick={clear} disabled={busy}/>
  </div>;
}
