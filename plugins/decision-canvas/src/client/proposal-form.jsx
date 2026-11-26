import React,{useState} from 'react';
import {Modal} from './components.jsx';

export const CATEGORIES=['feature','bug-fix','simplification','architecture','process','testing'];
export function blankProposal() {return '# Agent Note: 新决策\n\nStatus: proposed\n\n## Problem\n\n\n## Proposal\n\n\n## Alternatives considered\n\n\n## Acceptance criteria\n\n\n## Risks\n\n';}
export function ProposalForm({api,workspaceId,initial,runId,onClose,onCreated,t}) {
  const [content,setContent]=useState(initial),[category,setCategory]=useState('feature'),[slug,setSlug]=useState(initial.split('\n')[0].replace(/^# Agent Note:\s*/,'').trim()),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function save() {
    setBusy(true);setError('');
    try {const result=await api('save_proposal',{workspaceId,runId,content,category,slug});await onCreated(result.path,result.warning);onClose();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <Modal title={t('saveProposal')} onClose={()=>{if(!busy)onClose();}} t={t} wide><div className="dsc-form-row"><label>{t('category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c} value={c}>{t(`category.${c}`)}</option>)}</select></label><label className="dsc-grow">{t('proposalTitle')}<input value={slug} onChange={e=>setSlug(e.target.value)} maxLength={100}/></label></div><textarea className="dsc-proposal-editor" aria-label={t('proposalContent')} value={content} onChange={e=>setContent(e.target.value)} spellCheck={false}/>{error?<p className="dsc-error" role="alert">{error}</p>:null}<footer><button onClick={onClose} disabled={busy}>{t('cancel')}</button><button className="dsc-primary" onClick={save} disabled={busy||!slug.trim()}>{busy?t('saving'):t('saveProposal')}</button></footer></Modal>;
}
