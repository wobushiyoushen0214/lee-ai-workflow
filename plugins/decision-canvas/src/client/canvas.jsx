import React,{forwardRef,memo,useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,MiniMap,Handle,Position,applyNodeChanges,useReactFlow,useViewport} from '@xyflow/react';
import {Pin,ZoomIn,ZoomOut,Maximize,FileText} from 'lucide-react';
import {COLORS,IconButton,Status} from './components.jsx';
import {getGraphEmphasis} from './view-model.js';
import {CARD_WIDTH as WIDTH,CARD_HEIGHT as HEIGHT,calculateLayout,resolvePositions,cardsOverlap,displayEdges,edgePorts} from './graph-layout.js';

const SIDES=[['left',Position.Left],['right',Position.Right],['top',Position.Top],['bottom',Position.Bottom]];
function duration(){return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:200;}
function ZoomValue(){const {zoom}=useViewport();return <span>{Math.round(zoom*100)}%</span>;}
const NodeCard=memo(function NodeCard({data,selected}) {
  const {node,t,pinned}=data;
  return <article className={`dsc-node ${selected?'is-selected':''}`} style={{'--dsc-mark':COLORS[node.lifecycle]||COLORS.document}}>
    {SIDES.flatMap(([side,position])=>['source','target'].map(type=>{
      const connectable=type==='source'?side==='right':side==='left';
      return <Handle key={`${type}-${side}`} id={`${type}-${side}`} type={type} position={position} isConnectable={connectable} className={connectable?'':'dsc-routing-handle'}/>;
    }))}
    <div className="dsc-node-top"><span>{t(`category.${node.category}`)}</span>{pinned?<Pin size={12}/>:<span>{node.date}</span>}</div>
    <h3 title={node.title}>{node.title}</h3><p>{node.summary}</p>
    <div className="dsc-node-bottom"><Status node={node} t={t}/><span title={node.path}><FileText size={11}/>{node.links.length}</span></div>
  </article>;
});
const nodeTypes={decision:NodeCard};
const CanvasBody=forwardRef(function CanvasBody({graph,layoutGraph,board,selectedIds,onSelect,onOpen,onPositions,onLayoutAdjusted,onConnect,onEdge,t},ref) {
  const [hoveredId,setHoveredId]=useState(null);
  const topology=JSON.stringify([layoutGraph.nodes.map(n=>n.id),layoutGraph.edges.map(e=>[e.source,e.target])]);
  const automatic=useMemo(()=>{
    const [ids,links]=JSON.parse(topology);
    return calculateLayout(ids.map(id=>({id})),links.map(([source,target])=>({source,target})));
  },[topology]);
  const emphasized=useMemo(()=>getGraphEmphasis(graph,selectedIds,hoveredId),[graph,selectedIds,hoveredId]);
  useEffect(()=>{if(hoveredId&&!graph.nodes.some(node=>node.id===hoveredId))setHoveredId(null);},[graph.nodes,hoveredId]);
  const chosen=useRef(new Set(selectedIds));chosen.current=new Set(selectedIds);
  const buildNodes=useCallback((previous=[])=>{
    const before=Object.fromEntries(previous.map(n=>[n.id,n.position])),pinned=new Set(board.pinnedNodeIds);
    const {positions}=resolvePositions(layoutGraph.nodes,automatic,{saved:board.positions,previous:before,pinnedNodeIds:board.pinnedNodeIds});
    return layoutGraph.nodes.map(node=>({id:node.id,type:'decision',position:positions[node.id],selected:chosen.current.has(node.id),draggable:!pinned.has(node.id),width:WIDTH,height:HEIGHT,measured:{width:WIDTH,height:HEIGHT},ariaLabel:node.title,data:{node,t,pinned:pinned.has(node.id)}}));
  },[layoutGraph,board.positions,board.pinnedNodeIds,automatic,t]);
  const [nodes,setNodes]=useState(()=>buildNodes());
  const onNodesChange=useCallback(changes=>setNodes(previous=>applyNodeChanges(changes,previous)),[]);
  const flow=useReactFlow();
  useEffect(()=>setNodes(previous=>buildNodes(previous)),[buildNodes,setNodes]);
  useEffect(()=>setNodes(previous=>previous.map(node=>node.selected===chosen.current.has(node.id)?node:{...node,selected:chosen.current.has(node.id)})),[selectedIds,setNodes]);
  // Keep hover out of spatial state: it must never reset a drag or dirty the layout.
  const visible=useMemo(()=>new Set(graph.nodes.map(node=>node.id)),[graph.nodes]);
  const displayedNodes=useMemo(()=>nodes.filter(node=>visible.has(node.id)).map(node=>({...node,
    className:emphasized.active?(emphasized.nodeIds.has(node.id)?`dsc-node-highlighted ${node.id===emphasized.hoveredId?'dsc-node-hovered':''}`:'dsc-node-dimmed'):'',
    zIndex:node.id===emphasized.hoveredId?3:emphasized.active&&emphasized.nodeIds.has(node.id)?2:0,
  })),[nodes,emphasized,visible]);
  const spatialPositions=useMemo(()=>Object.fromEntries(nodes.map(node=>[node.id,node.position])),[nodes]);
  useEffect(()=>onLayoutAdjusted(nodes.some(node=>{
    const saved=board.positions[node.id];return saved&&(saved.x!==node.position.x||saved.y!==node.position.y);
  })),[nodes,board.positions,onLayoutAdjusted]);
  const pinnedOverlapCount=useMemo(()=>{
    const pinned=nodes.filter(node=>board.pinnedNodeIds.includes(node.id));let count=0;
    for(let i=0;i<pinned.length;i++)for(let j=i+1;j<pinned.length;j++)if(cardsOverlap(pinned[i].position,pinned[j].position))count++;
    return count;
  },[nodes,board.pinnedNodeIds]);
  const positions=()=>({...spatialPositions,...Object.fromEntries(flow.getNodes().map(node=>[node.id,node.position]))});
  useImperativeHandle(ref,()=>({
    positions,
    fit:()=>flow.fitView({padding:.15,duration:duration()}),
    layout:()=>{
      const current=positions(),saved=Object.fromEntries(board.pinnedNodeIds.filter(id=>current[id]).map(id=>[id,current[id]]));
      const next=resolvePositions(layoutGraph.nodes,automatic,{saved,pinnedNodeIds:board.pinnedNodeIds}).positions;
      onPositions(next);setTimeout(()=>flow.fitView({padding:.15,duration:duration()}),50);
    },
  }));
  const presentedEdges=useMemo(()=>displayEdges(graph.edges),[graph.edges]);
  const edges=useMemo(()=>presentedEdges.map(edge=>{
    const highlighted=edge.relatedEdges.some(item=>emphasized.edgeIds.has(item.id)),manual=edge.origin==='manual';
    const color=highlighted||manual?'var(--dsc-accent)':'var(--dsc-sub)';
    const marker={type:'arrowclosed',width:14,height:14,color};
    return {...edge,...edgePorts(edge,spatialPositions),type:'smoothstep',pathOptions:{borderRadius:12,offset:12},label:manual?(edge.label||t(`relation.${edge.relation}`)):undefined,
      className:emphasized.active?(highlighted?'dsc-edge-highlighted':'dsc-edge-dimmed'):'',zIndex:highlighted?1:0,
      style:{stroke:color,strokeWidth:highlighted?2.4:manual?1.7:1.2,opacity:highlighted?1:manual?.8:.4,...manual?{strokeDasharray:'5 4'}:{}},
      labelStyle:{fontSize:11,fill:highlighted?'var(--dsc-accent)':'var(--dsc-sub)'},labelBgStyle:{fill:'var(--dsc-panel)'},data:edge,
      markerEnd:marker,markerStart:edge.bidirectional?marker:undefined,
    };
  }),[presentedEdges,spatialPositions,t,emphasized]);
  const stopDrag=useCallback((_,node,dragged)=>{
    const current={...spatialPositions,...Object.fromEntries(flow.getNodes().map(item=>[item.id,item.position]))};
    const next=resolvePositions(layoutGraph.nodes,automatic,{saved:current,pinnedNodeIds:board.pinnedNodeIds,priorityNodeIds:(dragged?.length?dragged:[node]).map(item=>item.id)}).positions;
    setNodes(previous=>previous.map(item=>({...item,position:next[item.id]})));onPositions(next);
  },[spatialPositions,flow,layoutGraph,automatic,board.pinnedNodeIds,onPositions]);
  const selection=useCallback(({nodes})=>onSelect(nodes.map(n=>n.id)),[onSelect]);
  const enter=useCallback((_,node)=>setHoveredId(node.id),[]);
  const leave=useCallback((_,node)=>setHoveredId(previous=>previous===node.id?null:previous),[]);
  const clearHover=useCallback(()=>setHoveredId(null),[]);
  return <div className="dsc-flow" onMouseLeave={clearHover}><ReactFlow nodes={displayedNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onSelectionChange={selection} onNodeClick={onOpen} onNodeMouseEnter={enter} onNodeMouseLeave={leave} onNodeDragStop={stopDrag} onConnect={onConnect} onEdgeClick={(_,edge)=>onEdge(edge.data)} minZoom={.04} maxZoom={2} onInit={instance=>{const latest=[...graph.nodes].sort((a,b)=>b.date.localeCompare(a.date))[0];const position=latest&&spatialPositions[latest.id];if(position)instance.setCenter(position.x+WIDTH/2,position.y+HEIGHT/2,{zoom:.85});}} deleteKeyCode={null} selectionKeyCode="Shift" multiSelectionKeyCode={['Meta','Control']} onlyRenderVisibleElements proOptions={{hideAttribution:false}}>
    <Background gap={24} size={1} color="var(--dsc-border)"/>
    <div className="dsc-flow-legend" aria-label={t('legend')}><span><i/>{t('references')}</span><span><i className="is-mutual"/>{t('mutualReferences')}</span><span><i className="is-manual"/>{t('manual')}</span></div>
    {pinnedOverlapCount?<div className="dsc-layout-notice" role="status">{t('pinnedOverlap')}</div>:null}
    <MiniMap pannable zoomable nodeColor={node=>COLORS[node.data.node.lifecycle]||COLORS.document} maskColor="var(--dsw-alias-bg-mask, transparent)" style={{background:'var(--dsw-alias-bg-layer-1)'}}/>
    <div className="dsc-flow-controls"><IconButton icon={ZoomIn} label={t('zoomIn')} onClick={()=>flow.zoomIn()}/><IconButton icon={ZoomOut} label={t('zoomOut')} onClick={()=>flow.zoomOut()}/><ZoomValue/><IconButton icon={Maximize} label={t('overview')} onClick={()=>flow.fitView({padding:.15,duration:duration()})}/>{selectedIds.length?<IconButton icon={FileText} label={t('readableView')} onClick={()=>flow.fitView({nodes:selectedIds.map(id=>({id})),padding:.3,maxZoom:1,minZoom:.55,duration:duration()})}/>:null}</div>
  </ReactFlow></div>;
});
export const GraphCanvas=forwardRef(function GraphCanvas(props,ref) {return <ReactFlowProvider><CanvasBody ref={ref} {...props}/></ReactFlowProvider>;});
