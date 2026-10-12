import {DIRS,key,type Hex} from '../core/hex';
import type {ArenaMap} from './maps';
import {RT_CONFIG as C} from './config';
export type Vec={x:number;y:number;z:number};
export type Ballistic={origin:Vec;velocity:Vec;gravity?:number};
export const world=(h:Hex)=>({x:h.q+h.r/2,y:Math.sqrt(3)/2*h.r});
export const elevation=(map:ArenaMap,h:Hex)=>map.floors.find(f=>key(f)===key(h))?.height??0;
export const stepHeight=(map:ArenaMap,a:Hex,b:Hex)=>Math.abs(elevation(map,a)-elevation(map,b))<=C.maxStep;
export const moveHeight=(map:ArenaMap,a:Hex,b:Hex)=>stepHeight(map,a,b)||elevation(map,a)-elevation(map,b)>=1;
export const positionAt=(shot:Ballistic,t:number):Vec=>({x:shot.origin.x+shot.velocity.x*t,y:shot.origin.y+shot.velocity.y*t,z:shot.origin.z+shot.velocity.z*t-(shot.gravity??C.gravity)*t*t/2});
export function trajectories(origin:Vec,target:Vec):Ballistic[]{
 const dx=target.x-origin.x,dy=target.y-origin.y,d=Math.hypot(dx,dy),z=target.z-origin.z,v=C.arrowSpeed,g=C.gravity;
 if(![...Object.values(origin),...Object.values(target),d].every(Number.isFinite)||d<1e-6)return[];const raw=v**4-g*(g*d*d+2*z*v*v);if(raw < -1e-9)return[];const disc=Math.max(0,raw);
 return [...new Set([Math.atan((v*v-Math.sqrt(disc))/(g*d)),Math.atan((v*v+Math.sqrt(disc))/(g*d))])].map(angle=>({origin:{...origin},velocity:{x:dx/d*v*Math.cos(angle),y:dy/d*v*Math.cos(angle),z:v*Math.sin(angle)}}));
}
function roots(a:number,b:number,c:number){if(Math.abs(a)<1e-12)return Math.abs(b)<1e-12?[]:[-c/b];const d=b*b-4*a*c;if(d<0)return[];return[(-b-Math.sqrt(d))/(2*a),(-b+Math.sqrt(d))/(2*a)];}
// Exact interval intersection of linear XY and quadratic Z, not point sampling.
function vertical(shot:Ballistic,lo:number,hi:number,bottom:number,top:number):number|null{
 if(lo>hi)return null;const points=[lo,hi,...roots(-(shot.gravity??C.gravity)/2,shot.velocity.z,shot.origin.z-bottom),...roots(-(shot.gravity??C.gravity)/2,shot.velocity.z,shot.origin.z-top)].filter(t=>t>=lo&&t<=hi).sort((a,b)=>a-b);
 const inside=(t:number)=>{const z=positionAt(shot,t).z;return z>=bottom-1e-8&&z<=top+1e-8;};
 for(let i=0;i<points.length;i++){if(inside(points[i]))return points[i];if(i+1<points.length&&inside((points[i]+points[i+1])/2))return points[i];}return null;
}
export type Collider={id:string;kind:'player'|'object'|'terrain';at:Hex;bottom:number;top:number;radius?:number};
export function intersect(shot:Ballistic,c:Collider,from:number,to:number):number|null{
 const p=world(c.at),dx=shot.origin.x-p.x,dy=shot.origin.y-p.y,v=shot.velocity;let lo=from,hi=to;
 if(c.radius!==undefined){const a=v.x*v.x+v.y*v.y,b=2*(dx*v.x+dy*v.y),k=dx*dx+dy*dy-c.radius*c.radius;
  if(a<1e-12){if(k>0)return null;}else{const r=roots(a,b,k).sort((a,b)=>a-b);if(!r.length)return null;lo=Math.max(lo,r[0]);hi=Math.min(hi,r[1]);}
 }else for(const d of DIRS){const n=world(d),start=dx*n.x+dy*n.y,speed=v.x*n.x+v.y*n.y;if(Math.abs(speed)<1e-12){if(start>.5)return null;}else{const t=(.5-start)/speed;if(speed>0)hi=Math.min(hi,t);else lo=Math.max(lo,t);}}
 return vertical(shot,lo,hi,c.bottom,c.top);
}
export function firstCollision(shot:Ballistic,colliders:Collider[],from:number,to:number){let result:{collider:Collider;time:number}|null=null;for(const c of colliders){const t=intersect(shot,c,from,to);if(t!==null&&(!result||t<result.time-1e-9||(Math.abs(t-result.time)<1e-9&&c.id<result.collider.id)))result={collider:c,time:t};}return result;}
export function hexLine(a:Hex,b:Hex):Hex[]{const aw=world(a),bw=world(b),n=Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));const out:Hex[]=[];for(let i=1;i<=n;i++){const t=i/n,x=aw.x+(bw.x-aw.x)*t,y=aw.y+(bw.y-aw.y)*t,r=2*y/Math.sqrt(3),q=x-r/2;let cq=Math.round(q),cr=Math.round(r),cs=Math.round(-q-r);const dq=Math.abs(cq-q),dr=Math.abs(cr-r),ds=Math.abs(cs+q+r);if(dq>dr&&dq>ds)cq=-cr-cs;else if(dr>ds)cr=-cq-cs;out.push({q:cq,r:cr});}return out;}
