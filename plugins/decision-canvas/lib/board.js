import { BOARD_PATH, RELATIONS, check, copy } from './shared.js';

export function emptyBoard() { return { schemaVersion:1,revision:0,positions:{},pinnedNodeIds:[],manualEdges:[],nodeAliases:{},hiddenEdgeIds:[] }; }
const record = value => value !== null && typeof value==='object' && !Array.isArray(value);
const id = value => typeof value==='string' && value.length>0 && value.length<=2200;
export function resolveAlias(value, aliases) {
  const seen = new Set(); let current=value;
  while(Object.hasOwn(aliases,current)) {
    check(!seen.has(current),'alias-cycle','改名映射不能形成循环'); seen.add(current); current=aliases[current];
  }
  return current;
}
export function validateBoard(input) {
  check(record(input) && input.schemaVersion===1,'unsupported-board','画布格式版本不受支持，原文件已保留');
  check(Number.isSafeInteger(input.revision) && input.revision>=0,'invalid-board','画布版本无效');
  check(record(input.positions) && Object.keys(input.positions).length<=10000,'invalid-board','节点位置无效或过多');
  const positions = {};
  for (const [key,p] of Object.entries(input.positions)) {
    check(id(key)&&record(p)&&['x','y'].every(a=>typeof p[a]==='number'&&Number.isFinite(p[a])&&Math.abs(p[a])<1e7),'invalid-board','节点坐标无效');
    positions[key]={x:p.x,y:p.y};
  }
  const pinnedNodeIds = input.pinnedNodeIds || [];
  check(Array.isArray(pinnedNodeIds)&&pinnedNodeIds.length<=10000&&pinnedNodeIds.every(id),'invalid-board','固定节点列表无效');
  check(Array.isArray(input.manualEdges)&&input.manualEdges.length<=20000,'invalid-board','人工关系列表无效');
  const edgeIds=new Set();
  const manualEdges=input.manualEdges.map(e=>{
    check(record(e)&&id(e.id)&&e.id.startsWith('manual:')&&!edgeIds.has(e.id)&&id(e.source)&&id(e.target)&&e.source!==e.target&&RELATIONS.includes(e.relation),'invalid-board','人工关系无效或重复');
    check(typeof e.label==='string'&&e.label.length<=500,'invalid-board','关系说明不能超过 500 字符');
    edgeIds.add(e.id);
    return {id:e.id,source:e.source,target:e.target,relation:e.relation,label:e.label,origin:'manual',createdAt:typeof e.createdAt==='string'?e.createdAt:new Date().toISOString()};
  });
  check(record(input.nodeAliases)&&Object.keys(input.nodeAliases).length<=10000,'invalid-board','改名映射无效');
  const nodeAliases={};
  for(const [from,to] of Object.entries(input.nodeAliases)) { check(id(from)&&id(to)&&from!==to,'invalid-board','改名映射无效'); nodeAliases[from]=to; }
  for(const from of Object.keys(nodeAliases)) resolveAlias(from,nodeAliases);
  const hiddenEdgeIds=input.hiddenEdgeIds||[];
  check(Array.isArray(hiddenEdgeIds)&&hiddenEdgeIds.length<=20000&&hiddenEdgeIds.every(id),'invalid-board','隐藏关系列表无效');
  return {schemaVersion:1,revision:input.revision,positions,pinnedNodeIds:[...new Set(pinnedNodeIds)],manualEdges,nodeAliases,hiddenEdgeIds:[...new Set(hiddenEdgeIds)]};
}
export async function readBoard(files) {
  const file=await files.readJson(BOARD_PATH,{missing:true});
  return file?{board:validateBoard(file.value),version:file.version}:{board:emptyBoard(),version:null};
}
export async function writeBoard(files,input,expectedVersion,graph) {
  const board=validateBoard(input); const current=await readBoard(files);
  check(expectedVersion===current.version,'conflict','画布已被其他窗口修改，请重新载入后再保存');
  const ids=new Set(graph.nodes.map(n=>n.id));
  for(const [from,to] of Object.entries(board.nodeAliases)) {
    check(!ids.has(from),'alias-source-exists','原节点仍存在，不能用改名绑定合并两篇决策');
    check(ids.has(resolveAlias(to,board.nodeAliases)),'alias-target-missing','改名目标不在当前索引中');
  }
  const next={...board,revision:current.board.revision+1};
  const result=await files.write(BOARD_PATH,JSON.stringify(next,null,2)+'\n',current.version);
  return {board:projectedBoard(next),version:result.version};
}
export function projectedBoard(board) {
  const result=copy(board); const positions={};
  for(const [id,position] of Object.entries(board.positions)) positions[resolveAlias(id,board.nodeAliases)]=position;
  for(const [id,position] of Object.entries(board.positions)) if(!Object.hasOwn(board.nodeAliases,id)) positions[id]=position;
  result.positions=positions;
  result.pinnedNodeIds=board.pinnedNodeIds.map(id=>resolveAlias(id,board.nodeAliases));
  result.manualEdges=board.manualEdges.map(e=>({...e,source:resolveAlias(e.source,board.nodeAliases),target:resolveAlias(e.target,board.nodeAliases)}));
  return result;
}
export function exportCanvas(graph,board,selectedIds) {
  board=validateBoard(board);
  if(selectedIds!==undefined)check(Array.isArray(selectedIds)&&selectedIds.length<=10000&&selectedIds.every(id),'invalid-input','导出节点列表无效');
  const projected=projectedBoard(board); const requested=selectedIds?new Set(selectedIds):null;
  const nodes=graph.nodes.filter(n=>n.kind!=='missing'&&(!requested||requested.has(n.id)));
  const selected=new Set(nodes.map(n=>n.id));
  const colors={proposed:'4',implemented:'5',rejected:'1',archived:'6'};
  return {
    nodes:nodes.map((node,i)=>({id:node.id,type:'file',file:node.path,x:Math.round(projected.positions[node.id]?.x??(i%5)*360),y:Math.round(projected.positions[node.id]?.y??Math.floor(i/5)*220),width:320,height:160,...colors[node.lifecycle]?{color:colors[node.lifecycle]}:{}})),
    edges:[...graph.edges,...projected.manualEdges].filter(e=>selected.has(e.source)&&selected.has(e.target)&&!board.hiddenEdgeIds.includes(e.id)).map(e=>({id:e.id,fromNode:e.source,toNode:e.target,fromSide:'right',toSide:'left',toEnd:'arrow',label:e.label||e.relation,...e.origin==='manual'?{color:'6'}:{}})),
  };
}
