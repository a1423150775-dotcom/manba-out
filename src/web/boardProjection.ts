import {DIRS, type Hex, key} from '../core/hex';
import type {ArenaMap} from '../realtime/maps';
export type RenderStyle = '2d' | '2.5d';
export function boardProjection(style:RenderStyle, floors:ArenaMap['floors']) {
 const heights=new Map(floors.map(h=>[key(h),h.height??0]));
 const tilt=style==='2.5d'?.62:1;
 const point=(h:Hex)=>({x:470+46*Math.sqrt(3)*(h.q+h.r/2),y:340+69*h.r*tilt-(style==='2.5d'?(heights.get(key(h))??0)*22:0)});
 const vertices=(h:Hex)=>{const p=point(h);return Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return{x:p.x+43*Math.cos(a),y:p.y+43*Math.sin(a)*tilt};});};
 const polygon=(h:Hex)=>vertices(h).map(p=>`${p.x},${p.y}`).join(' ');
 const sides=(h:Hex)=>{const v=vertices(h),depth=18+(heights.get(key(h))??0)*22;return [0,1,2].map(i=>{const a=v[i],b=v[(i+1)%6];return `${a.x},${a.y} ${b.x},${b.y} ${b.x},${b.y+depth} ${a.x},${a.y+depth}`;});};
 // Direction is projected on the ground plane; neighboring terrain height must not rotate it.
 const directionAngle=(d:number)=>{const h=DIRS[d];return Math.atan2(69*h.r*tilt,46*Math.sqrt(3)*(h.q+h.r/2))*180/Math.PI+90;};
 return {point,vertices,polygon,sides,directionAngle,tilt};
}
