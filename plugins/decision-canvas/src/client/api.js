export function createApi() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get('token') || sessionStorage.getItem('decision-canvas-token') || sessionStorage.getItem('codex-canvas-token') || '';
  if (fragment.has('token')) {
    sessionStorage.setItem('decision-canvas-token', token);
    history.replaceState(null, '', location.pathname + location.search);
  }
  return async function api(action,input={},signal) {
    const url=new URL('api/decision-canvas.invoke',document.baseURI);
    const response=await globalThis.fetch(url.href,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-canvas-token':token},body:JSON.stringify({action,input}),...(signal?{signal}:{})});
    let envelope;try{envelope=await response.json();}catch{throw new Error(`HTTP ${response.status}: invalid response`);}
    if(!response.ok||!envelope.ok) {const error=new Error(envelope.error?.message||`HTTP ${response.status}`);error.code=envelope.error?.code;throw error;}
    return envelope.result;
  };
}
export function workspacePreference(key,workspaceId,fallback) {return preference(`${workspaceId}.${key}`,fallback);}
export function download(name,content,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function preference(key,fallback) {
  try {const value=JSON.parse(localStorage.getItem(`decision-canvas.v1.${key}`)||'null');return value??fallback;}catch{return fallback;}
}
export function savePreference(key,value) {try{localStorage.setItem(`decision-canvas.v1.${key}`,JSON.stringify(value));}catch{}}
