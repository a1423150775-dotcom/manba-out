import {useEffect,useRef,useState} from 'react';
import {DIRS,add,distance,equal,key,type Hex} from '../core/hex';
import {CHARACTERS,SKILLS,type SkillId} from '../realtime/config';
import type {Arena,Fighter,Intent} from '../realtime/engine';
import {useBoardViewport} from './useBoardViewport';
import {Glyph} from './icons';
import {boardProjection,type RenderStyle} from './boardProjection';
export function BattleBoard({game,you,selected,direction,time,onIntent,onInvalid}:{game:Arena;you?:Fighter;selected:SkillId|null;direction:number;time:number;onIntent:(i:Intent)=>void;onInvalid:(reason:string)=>void}){
 const [info,setInfo]=useState('');
 const [style,setStyle]=useState<RenderStyle>(()=>{try{return localStorage.getItem('elbow-render-style')==='2.5d'?'2.5d':'2d';}catch{return'2d';}});
 const projection=boardProjection(style,game.map.floors),xy=projection.point,polygon=projection.polygon;
 const terrain=[...game.map.floors].sort((a,b)=>a.r-b.r||a.q-b.q);

 const wrap=useRef<HTMLDivElement>(null),[size,setSize]=useState({w:940,h:680,hud:210});
 useEffect(()=>{const el=wrap.current;if(!el)return;const hud=document.querySelector('.rt-skills');const update=()=>{const r=el.getBoundingClientRect();setSize({w:Math.max(320,r.width),h:Math.max(240,r.height),hud:hud?.getBoundingClientRect().height||40});};const observer=new ResizeObserver(update);observer.observe(el);if(hud)observer.observe(hud);update();return()=>observer.disconnect();},[]);
 const points=game.map.floors.map(xy),left=Math.min(...points.map(p=>p.x))-52,right=Math.max(...points.map(p=>p.x))+52,top=Math.min(...points.map(p=>p.y))-65,bottom=Math.max(...points.map(p=>p.y))+65;
 const center={x:(left+right)/2,y:(top+bottom)/2},usable=Math.max(130,size.h-size.hud-90),fit=Math.min((size.w-20)/(right-left),usable/(bottom-top));
 const [mode,setMode]=useState<'map'|'follow'>(()=>{try{return localStorage.getItem('elbow-camera')==='follow'?'follow':'map';}catch{return'map';}});
 const tap=(cell:string)=>{
  const floor=game.map.floors.find(h=>key(h)===cell);if(!floor)return;
  // Display-only elevation never enters a movement or skill request.
  const h:Hex={q:floor.q,r:floor.r};
  const enemy=game.players.find(p=>p.position&&equal(p.position,h)&&p.id!==you?.id),spring=game.springs.find(t=>equal(t.at,h));
  setInfo(`${cell} · ${distance(h)<=2?3-distance(h):0}分区${spring?' · 弹簧向'+['东','东北','西北','西','西南','东南'][spring.direction]+'弹射2格':''}${enemy?' · '+enemy.name+' '+enemy.hp+' HP':''}`);
  if(!you?.position||!selected)return;
  if(game.obstacles.some(at=>equal(at,h))){onInvalid('此格有障碍物');return;}const def=SKILLS[selected],d=distance(you.position,h);
  if(def.targetType==='player'){if(enemy)onIntent({skill:selected,targetId:enemy.id});else onInvalid('目标不合法，请点击其他玩家');}
  else if(def.targetType==='direction'){const direction=DIRS.findIndex(v=>equal(add(you.position!,v),h)||equal(add(add(you.position!,v),v),h));if(direction>=0)onIntent({skill:selected,direction});else onInvalid('请选择高亮的六方向目标格');}
  else if(def.targetType==='cell'&&d>0&&d<=def.range&&(selected==='move'||!game.players.some(p=>p.position&&equal(p.position,h))))onIntent({skill:selected,at:h,direction});else onInvalid('目标不合法，请选择高亮范围内的目标格');
 };
 const camera=useBoardViewport(tap,size.w,size.h);
 const displayed=useRef(new Map<string,{x:number;y:number}>()),last=useRef(performance.now()),focus=useRef({x:470,y:340});
 const now=performance.now(),dt=Math.min(50,now-last.current);last.current=now;
 const actors=game.players.filter(p=>p.position).map(p=>{
  let desired=xy(p.position!);const a=p.action;
  if(a?.path.length){const progress=Math.max(0,Math.min(.9999,(time-a.start)/(a.end-a.start)))*a.path.length,index=Math.floor(progress),from=xy(index===0?a.from:a.path[index-1]),to=xy(a.path[index]);desired={x:from.x+(to.x-from.x)*(progress-index),y:from.y+(to.y-from.y)*(progress-index)};}
  if(p.motion&&p.motion.path.length>1&&time-p.motion.at<260&&!a){const path=p.motion.path,progress=Math.max(0,Math.min(.9999,(time-p.motion.at)/260))*(path.length-1),i=Math.floor(progress),from=xy(path[i]),to=xy(path[i+1]);desired={x:from.x+(to.x-from.x)*(progress-i),y:from.y+(to.y-from.y)*(progress-i)};}
  if(style==='2.5d'&&p.motion&&time-p.motion.at<260&&!a)desired.y-=Math.sin(Math.max(0,(time-p.motion.at)/260)*Math.PI)*18;
  const old=displayed.current.get(p.id)||desired,alpha=1-Math.exp(-Math.max(1,dt)/55),pos={x:old.x+(desired.x-old.x)*alpha,y:old.y+(desired.y-old.y)*alpha};displayed.current.set(p.id,pos);return {p,pos};
 }).sort((a,b)=>a.pos.y-b.pos.y||a.p.id.localeCompare(b.p.id));
 const target=you&&displayed.current.get(you.id);if(target){const a=1-Math.exp(-Math.max(1,dt)/80);focus.current={x:focus.current.x+(target.x-focus.current.x)*a,y:focus.current.y+(target.y-focus.current.y)*a};}
 const changeMode=(next:'map'|'follow')=>{setMode(next);camera.reset();if(next==='follow'){camera.zoomIn();if(target)focus.current={...target};}try{localStorage.setItem('elbow-camera',next);}catch{}};
 const changeStyle=(next:RenderStyle)=>{if(next===style)return;displayed.current.clear();if(you?.position)focus.current=boardProjection(next,game.map.floors).point(you.position);setStyle(next);try{localStorage.setItem('elbow-render-style',next);}catch{}};
 return <div className="rt-board-wrap" ref={wrap}><div className="board-tools"><button type="button" aria-pressed={style==='2d'} onClick={()=>changeStyle('2d')}>2D</button><button type="button" aria-pressed={style==='2.5d'} onClick={()=>changeStyle('2.5d')}>2.5D</button><button type="button" aria-pressed={mode==='follow'} disabled={!you} onClick={()=>changeMode('follow')}>跟随视角</button><button type="button" aria-pressed={mode==='map'} onClick={()=>changeMode('map')}>全地图</button><button type="button" onClick={camera.zoomIn}>放大</button><button type="button" onClick={camera.zoomOut}>缩小</button><button type="button" onClick={()=>changeMode(mode)}>重置视角</button></div><svg className="rt-board" data-camera={mode} data-renderer={style} viewBox={`0 0 ${size.w} ${size.h}`} {...camera.handlers} aria-label="实时六边形棋盘"><g data-layer="camera" transform={`translate(${size.w/2+camera.camera.x} ${55+usable/2+camera.camera.y}) scale(${fit*camera.camera.zoom*(mode==='follow'?1.35:1)}) translate(${-((mode==='follow'&&you)?focus.current.x:center.x)} ${-((mode==='follow'&&you)?focus.current.y:center.y)})`}>
 <g data-layer="floor">{terrain.map(h=><g key={key(h)} data-cell={key(h)} data-height={h.height??0} role="button" tabIndex={0} aria-label={`格子${key(h)}`} onKeyDown={e=>{if(e.key==='Enter')tap(key(h));}}>
 {style==='2.5d'&&<g data-layer="terrain-sides" pointerEvents="none">{projection.sides(h).map((points,i)=><polygon key={i} points={points} fill={['#637b84','#415969','#516775'][i]} stroke="#334c5c" strokeWidth="1"/>)}</g>}
 <polygon data-surface="top" points={polygon(h)} fill={['#ffd469','#ffb77d','#fff0ae','#d4e6e2'][Math.min(3,distance(h))]} stroke="#fff" strokeWidth={style==='2.5d'?2:3}/></g>)}</g>
 <g data-layer="ground" pointerEvents="none">{game.map.floors.map(h=>{const p=xy(h),spring=game.springs.find(t=>equal(t.at,h)),box=game.boxes.some(b=>equal(b,h)),shop=game.shop&&equal(game.shop,h);return <g key={key(h)} transform={`translate(${p.x-19} ${p.y-19*projection.tilt}) scale(1 ${projection.tilt})`}>{game.obstacles.some(at=>equal(at,h))&&<path d="M0 30L5 4L26 0L38 25L32 38H5Z" fill="#58677c" stroke="#24344a" strokeWidth="3"/>}{distance(h)===0&&<Glyph name="crown" size={38}/>} {(spring||box||shop)&&<Glyph name={spring?'spring':box?'gift':'shop'} size={38}/>} {spring&&<g transform={`translate(19 19) rotate(${90-spring.direction*60})`}><path d="M0-33-6-22H6Z" fill="#c64542"/></g>}</g>;})}</g>
 <g data-layer="ground-effects" pointerEvents="none"><defs><marker id="rt-blink-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#9775ee"/></marker></defs>{actors.map(({p})=>p.action?.skill==='blink'&&p.action.at&&<g key={'blink'+p.id} data-effect="blink-ground"><path markerEnd="url(#rt-blink-arrow)" d={`M${xy(p.action.from).x} ${xy(p.action.from).y} L${xy(p.action.at).x} ${xy(p.action.at).y}`} stroke="#9775ee" strokeWidth="5" strokeDasharray="8 5"/><polygon points={polygon(p.action.at)} fill="#9775ee" opacity=".25" stroke="#7453b8" strokeWidth="3"/></g>)}</g>
 <g data-layer="actors">{actors.map(({p,pos})=><g key={p.id} data-player={p.id} data-cell={key(p.position!)} transform={`translate(${pos.x} ${pos.y})`}>{style==='2.5d'&&<><ellipse cy="17" rx="29" ry="10" fill="#142f43" opacity=".3"/><path d="M-20 0V14Q0 36 20 14V0" fill={p.color} stroke="#27324c" strokeWidth="3"/></>}<circle cy={style==='2.5d'?-9:0} r="26" fill={p.color} stroke={p.stunnedUntil>time?'#f96aff':p.id===you?.id?'#fff':'#27324c'} strokeWidth="5"/><text pointerEvents="none" textAnchor="middle" y={style==='2.5d'?-2:7} fill="#fff" fontSize="18" fontWeight="900">{p.bot?'AI':'人'}</text></g>)}</g>
 <g data-layer="effects" pointerEvents="none">{game.players.filter(p=>p.motion&&time-p.motion.at<650).map(p=><polyline key={"trace"+p.id} points={p.motion!.path.map(h=>{const v=xy(h);return `${v.x},${v.y}`;}).join(" ")} fill="none" stroke={p.color} strokeWidth="5" opacity=".6" strokeDasharray="8 5"/>)}{actors.map(({p,pos})=>p.action&&<circle key={p.id} cx={pos.x} cy={pos.y} r="32" fill="none" stroke="#eb884b" strokeWidth="5" strokeDasharray={`${Math.max(0,Math.min(1,(time-p.action.start)/(p.action.end-p.action.start)))*201} 201`}/>)}</g>
 <g data-layer="labels" pointerEvents="none">{actors.map(({p,pos})=><g key={p.id} transform={`translate(${pos.x} ${pos.y})`}><rect x="-31" y="-44" width="62" height="10" rx="3" fill="#652d3d"/><rect x="-31" y="-44" width={62*p.hp/CHARACTERS[p.character].hp} height="10" rx="3" fill="#48d890"/><text y="-48" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff" stroke="#27324c" strokeWidth="3" paintOrder="stroke">{p.hp} HP{p.stunnedUntil>time?' · 晕':''}</text><rect x="-42" y="31" width="84" height="21" rx="6" fill="#27324c"/><text y="46" textAnchor="middle" fill="white" fontSize="12">{p.name.slice(0,7)}</text></g>)}</g>
 <g data-layer="targets" pointerEvents="none">{selected&&you?.position&&game.map.floors.map(h=>{const def=SKILLS[selected],d=distance(you.position!,h),enemy=game.players.some(p=>p.id!==you.id&&p.position&&equal(p.position,h));const valid=def.targetType==='player'?enemy:def.targetType==='direction'?DIRS.some(v=>equal(add(you.position!,v),h)||equal(add(add(you.position!,v),v),h)):def.targetType==='cell'&&d>0&&d<=def.range&&(selected==='move'||!game.players.some(p=>p.position&&equal(p.position,h)));return valid&&!game.obstacles.some(at=>equal(at,h))&&<polygon key={key(h)} points={polygon(h)} fill="none" stroke={d<=def.range?'#298769':'#dba855'} strokeWidth="4" strokeDasharray="8 5"/>;})}</g>
 </g></svg><div className="rt-cell-info">{info||'选卡后点目标直接释放 · 单指拖动 / 双指缩放'}</div></div>;
}
