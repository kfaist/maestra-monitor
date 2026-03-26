'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FleetSlot } from '@/types';

export const SLOT_COLORS = ['#00d4ff','#a78bfa','#34d399','#f59e0b','#f472b6','#38bdf8'];

interface GlobalSignal { id:string; label:string; type:string; color:string; icon:string; source:string; }

const GLOBAL_SIGNALS: GlobalSignal[] = [
  { id:'prompt_text',     label:'prompt_text',     type:'string',  color:'#00d4ff', icon:'✦', source:'mirrors-echo' },
  { id:'audio_amplitude', label:'audio_amplitude', type:'float',   color:'#a78bfa', icon:'◈', source:'mirrors-echo' },
  { id:'visitor_present', label:'visitor_present', type:'boolean', color:'#34d399', icon:'◉', source:'mirrors-echo' },
  { id:'audio.sub',       label:'sub',             type:'audio',   color:'#7c3aed', icon:'▋', source:'audio' },
  { id:'audio.bass',      label:'bass',            type:'audio',   color:'#db2777', icon:'▋', source:'audio' },
  { id:'audio.mid',       label:'mid',             type:'audio',   color:'#d97706', icon:'▋', source:'audio' },
  { id:'audio.high',      label:'high',            type:'audio',   color:'#0891b2', icon:'▋', source:'audio' },
  { id:'audio.rms',       label:'rms',             type:'audio',   color:'#059669', icon:'◈', source:'audio' },
  { id:'audio.bpm',       label:'bpm',             type:'audio',   color:'#f59e0b', icon:'♩', source:'audio' },
];
const DMX_SIGNALS: GlobalSignal[] = [
  { id:'dmx.active_cue',      label:'active_cue',      type:'string', color:'#f59e0b', icon:'💡', source:'dmx' },
  { id:'dmx.active_sequence', label:'active_sequence', type:'string', color:'#f472b6', icon:'▶',  source:'dmx' },
];
const ALL_SIGNALS = [...GLOBAL_SIGNALS, ...DMX_SIGNALS];

const EV_SERVER = 'https://maestra-backend-v2-production.up.railway.app';

interface SignalPanelProps {
  injectActive:boolean; onInjectToggle:(a:boolean)=>void;
  promptText:string; onPromptChange:(t:string)=>void;
  onBroadcast:(p:string)=>void; onP6Flush:(p:string)=>void;
  slots?:FleetSlot[];
  entityStates?:Record<string,Record<string,unknown>>;
}
type RoutingMap = Record<string,string[]>;

async function fetchState(slug:string) {
  try {
    const r = await fetch(`${EV_SERVER}/entities?slug=${slug}`,{signal:AbortSignal.timeout(4000)});
    if(!r.ok) return null;
    const d = await r.json();
    return (Array.isArray(d)?d[0]:d)?.state ?? null;
  } catch { return null; }
}

export default function SignalPanel({ slots=[], entityStates={} }:SignalPanelProps) {
  const [live, setLive] = useState<Record<string,string|number|boolean>>({});
  const [dmxOnline, setDmxOnline] = useState(false);
  const [routing, setRouting] = useState<RoutingMap>({});
  const [dragging, setDragging] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState<string|null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const prevPrompt = useRef('');

  useEffect(() => {
    async function poll() {
      const [m,d] = await Promise.allSettled([fetchState('krista1_visual'),fetchState('dmx-lighting')]);
      const v:Record<string,string|number|boolean> = {};
      if(m.status==='fulfilled'&&m.value) {
        const s=m.value as Record<string,unknown>;
        v['prompt_text']     = String(s.prompt_text??s.p6??s.prompt??'');
        v['audio_amplitude'] = parseFloat(String(s.audio_amplitude??s.audio_level??0));
        v['visitor_present'] = !!s.visitor_present;
        const np=String(v['prompt_text']);
        if(np&&np!==prevPrompt.current){
          prevPrompt.current=np;
          if(promptRef.current){promptRef.current.style.outline='1px solid rgba(0,212,255,0.8)';setTimeout(()=>{if(promptRef.current)promptRef.current.style.outline=''},600);}
        }
      }
      if(d.status==='fulfilled'&&d.value){
        setDmxOnline(true);
        const s=d.value as Record<string,unknown>;
        v['dmx.active_cue']=String(s.active_cue_id??'');
        v['dmx.active_sequence']=String(s.active_sequence_id??'');
      } else setDmxOnline(false);
      setLive(v);
    }
    poll(); const t=setInterval(poll,2000); return ()=>clearInterval(t);
  },[]);

  const onDragStart=useCallback((id:string)=>setDragging(id),[]);
  const onDragEnd=useCallback(()=>{setDragging(null);setDragOver(null);},[]);
  const onDrop=useCallback((slotId:string)=>{
    if(!dragging)return;
    setRouting(p=>{const c=p[slotId]??[];return c.includes(dragging)?p:{...p,[slotId]:[...c,dragging]};});
    setDragging(null);setDragOver(null);
  },[dragging]);
  const removeRoute=useCallback((slotId:string,sigId:string)=>{
    setRouting(p=>({...p,[slotId]:(p[slotId]??[]).filter(s=>s!==sigId)}));
  },[]);

  const getSig=(id:string)=>ALL_SIGNALS.find(s=>s.id===id);
  const getColor=(i:number)=>SLOT_COLORS[i%SLOT_COLORS.length];
  const getOuts=(slot:FleetSlot):GlobalSignal[]=>{
    if(!slot.active)return[];
    const sig=slot.signalType;
    // Base signals from signal type
    let base:GlobalSignal[]=[];
    if(sig==='touchdesigner') base=GLOBAL_SIGNALS.filter(s=>s.source==='mirrors-echo');
    else if(sig==='audio_reactive') base=GLOBAL_SIGNALS.filter(s=>s.source==='audio');
    else if(sig==='json_stream') base=GLOBAL_SIGNALS.filter(s=>s.type==='string');
    // Also surface any keys from live entity state not already in base
    const eid=slot.entity_id||slot.id;
    const state=entityStates[eid];
    if(state) {
      Object.keys(state).forEach(k=>{
        if(!base.find(s=>s.id===k||s.label===k)) {
          base.push({id:k,label:k,type:typeof state[k] as string,color:'var(--slot-color,#00d4ff)',icon:'◈',source:'entity'});
        }
      });
    }
    return base;
  };

  const chip=(sig:GlobalSignal,key?:string,slotId?:string,removable=false)=>(
    <div key={key??sig.id} draggable={!slotId}
      onDragStart={()=>!slotId&&onDragStart(sig.id)}
      onDragEnd={()=>!slotId&&onDragEnd()}
      style={{display:'flex',alignItems:'center',gap:4,background:`${sig.color}12`,border:`1px solid ${sig.color}35`,
        padding:'3px 7px',fontSize:9,cursor:slotId?'default':'grab',opacity:dragging===sig.id?0.5:1,}}>
      <span style={{color:sig.color}}>{sig.icon}</span>
      <span style={{fontFamily:'var(--font-mono)',color:sig.color}}>{sig.label}</span>
      {removable&&slotId&&<span onClick={()=>removeRoute(slotId,sig.id)} style={{marginLeft:2,color:'var(--text-dim)',cursor:'pointer',fontSize:11,lineHeight:1}}>×</span>}
    </div>
  );

  return (
    <div className="signal-panel" style={{display:'flex',flexDirection:'column',gap:0}}>

      {/* ── GLOBAL OUT ─────────────────────────────────────── */}
      <div className="signal-section" style={{paddingBottom:14}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--text-dim)',marginBottom:10}}>
          // Global OUT — drag to slot IN
        </div>

        <div style={{marginBottom:8}}>
          <div style={{fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)',opacity:0.45,marginBottom:5}}>mirrors-echo</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {GLOBAL_SIGNALS.filter(s=>s.source==='mirrors-echo').map(sig=>(
              <div key={sig.id} ref={sig.id==='prompt_text'?promptRef:undefined}
                draggable onDragStart={()=>onDragStart(sig.id)} onDragEnd={onDragEnd}
                style={{display:'flex',alignItems:'center',gap:8,background:`${sig.color}10`,border:`1px solid ${sig.color}35`,
                  padding:'5px 8px',cursor:'grab',opacity:dragging===sig.id?0.5:1,transition:'opacity 0.15s'}}>
                <span style={{color:sig.color,fontSize:11,flexShrink:0}}>{sig.icon}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:sig.color,flex:1}}>{sig.label}</span>
                <span style={{fontSize:8,color:'var(--text-dim)',opacity:0.4}}>{sig.type}</span>
                <span style={{fontFamily:'var(--font-display)',fontSize:10,color:'var(--text-dim)',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {live[sig.id]!==undefined?String(live[sig.id]).slice(0,22):'--'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{marginBottom:8}}>
          <div style={{fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)',opacity:0.45,marginBottom:5}}>audio analysis</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {GLOBAL_SIGNALS.filter(s=>s.source==='audio').map(sig=>chip(sig))}
          </div>
        </div>

        <div>
          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
            <div style={{fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)',opacity:0.45}}>dmx-lighting</div>
            <div style={{width:5,height:5,borderRadius:'50%',background:dmxOnline?'var(--active)':'var(--text-dim)',flexShrink:0}}/>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {DMX_SIGNALS.map(sig=>(
              <div key={sig.id} draggable onDragStart={()=>onDragStart(sig.id)} onDragEnd={onDragEnd}
                style={{display:'flex',alignItems:'center',gap:4,background:`${sig.color}12`,border:`1px solid ${sig.color}35`,
                  padding:'3px 7px',fontSize:9,cursor:'grab',opacity:dragging===sig.id?0.5:1}}>
                <span style={{color:sig.color}}>{sig.icon}</span>
                <span style={{fontFamily:'var(--font-mono)',color:sig.color}}>{sig.label}</span>
                <span style={{fontFamily:'var(--font-display)',fontSize:8,color:'var(--text-dim)',marginLeft:2}}>
                  {live[sig.id]?String(live[sig.id]).slice(0,12):'idle'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SLOT ROUTING ──────────────────────────────────── */}
      <div className="signal-section" style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--text-dim)',marginBottom:12}}>
          // Slot Signal Routing
        </div>
        {slots.length===0&&<div style={{fontSize:10,color:'var(--text-dim)',opacity:0.35,fontStyle:'italic'}}>No slots connected</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {slots.map((slot,idx)=>{
            const color=getColor(idx);
            const ins=routing[slot.id]??[];
            const outs=getOuts(slot);
            const isLive=slot.active;
            return (
              <div key={slot.id} style={{border:`1px solid ${color}40`,background:`${color}06`,padding:'8px 10px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:5,height:5,borderRadius:'50%',background:isLive?color:'var(--text-dim)',boxShadow:isLive?`0 0 6px ${color}`:'none',flexShrink:0}}/>
                    <span style={{fontFamily:'var(--font-display)',fontSize:10,fontWeight:700,color,letterSpacing:'0.08em'}}>{slot.label}</span>
                    {isLive&&<span style={{fontSize:8,padding:'1px 5px',border:`1px solid ${color}50`,color,letterSpacing:'0.1em'}}>LIVE</span>}
                    {isLive&&slot.fps&&<span style={{fontSize:8,color:'var(--text-dim)',opacity:0.5}}>{slot.fps}fps</span>}
                  </div>
                  {isLive&&<span style={{fontSize:7,color:'var(--text-dim)',opacity:0.35,fontStyle:'italic'}}>protected</span>}
                </div>

                {/* IN */}
                <div style={{marginBottom:outs.length>0?8:0}}>
                  <div style={{fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)',opacity:0.45,marginBottom:4}}>IN</div>
                  <div onDragOver={e=>{e.preventDefault();setDragOver(slot.id);}} onDragLeave={()=>setDragOver(null)} onDrop={()=>onDrop(slot.id)}
                    style={{minHeight:26,border:`1px dashed ${dragOver===slot.id?color:'var(--border)'}`,background:dragOver===slot.id?`${color}10`:'var(--surface2)',
                      padding:'4px 6px',display:'flex',flexWrap:'wrap',gap:4,alignItems:'center',transition:'all 0.15s'}}>
                    {ins.length===0&&<span style={{fontSize:9,color:'var(--text-dim)',opacity:0.3}}>drop signals here</span>}
                    {ins.map(sigId=>{const s=getSig(sigId);return s?chip(s,sigId,slot.id,!isLive):null;})}
                  </div>
                </div>

                {/* OUT */}
                {outs.length>0&&(
                  <div>
                    <div style={{fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)',opacity:0.45,marginBottom:4}}>OUT</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {outs.map(sig=>(
                        <div key={sig.id} style={{display:'flex',alignItems:'center',gap:4,background:`${color}12`,border:`1px solid ${color}45`,padding:'3px 7px',fontSize:9}}>
                          <span style={{color}}>{sig.icon}</span>
                          <span style={{fontFamily:'var(--font-mono)',color}}>{sig.label}</span>
                          {live[sig.id]!==undefined&&<span style={{fontFamily:'var(--font-display)',fontSize:8,color:'var(--text-dim)',marginLeft:2}}>{String(live[sig.id]).slice(0,14)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isLive&&outs.length===0&&ins.length===0&&(
                  <div style={{fontSize:9,color:'var(--text-dim)',opacity:0.28,fontStyle:'italic'}}>available — connect to configure</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
