import type {Arena,Fighter} from '../realtime/engine';
import {MODE_CONFIG} from '../realtime/modes';
import {world} from '../realtime/space';
import {DIRS,add,key} from '../core/hex';
import {boardProjection,type RenderStyle} from './boardProjection';

/** Acquisition range warning, not a promise that a shot clears intervening terrain. */
export function TowerRangeWarning({game,viewer,style}:{game:Arena;viewer?:Fighter;style:RenderStyle}){
 if(!viewer?.position||viewer.hp<=0||!viewer.team||game.phase!=='playing')return null;
 const p=world(viewer.position),projection=boardProjection(style,game.map.floors);
 const towers=game.objects.filter(o=>o.kind==='tower'&&o.hp>0&&o.team&&o.team!==viewer.team&&Math.hypot(world(o.at).x-p.x,world(o.at).y-p.y)<=MODE_CONFIG.towerRange+1e-8);
 return <g data-layer="tower-range-warning" pointerEvents="none" aria-label={towers.length?'已进入敌方防御塔范围':undefined}>{towers.map(t=>{
  const center=world(t.at),cells=game.map.floors.filter(h=>Math.hypot(world(h).x-center.x,world(h).y-center.y)<=MODE_CONFIG.towerRange+1e-8),inside=new Set(cells.map(key));
  return <g key={t.id} data-tower-warning={t.id}><title>敌方防御塔射程：{MODE_CONFIG.towerRange}格，障碍仍会阻挡箭矢</title>{cells.map(h=>{
   const v=projection.vertices(h);return <g key={key(h)}><polygon points={projection.polygon(h)} fill="#f16b35" fillOpacity=".16" stroke="#ffad58" strokeOpacity=".35" strokeWidth="1"/>{DIRS.map((d,i)=>{if(inside.has(key(add(h,d))))return null;const j=(6-i)%6;return <line key={i} x1={v[j].x} y1={v[j].y} x2={v[(j+1)%6].x} y2={v[(j+1)%6].y} stroke="#ff9c38" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;})}</g>;
  })}</g>;
 })}</g>;
}
