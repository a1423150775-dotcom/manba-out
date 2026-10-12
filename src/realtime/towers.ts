import type {Arena,Destructible,Fighter} from './engine';
import {MODE_CONFIG as M,type Team} from './modes';
import {RT_CONFIG as C} from './config';
import {world,elevation,firstCollision,type Collider,type Vec,type Ballistic} from './space';
export type TowerShot={id:string;owner:string;team:Team;target:string;position:Vec;previous:Vec;updated:number;start:number;end:number};
export type BattleMetrics={towerShots:number;towerHits:number;towerDamage:number;destroyed:{id:string;kind:string;at:number}[];pathFailures:number};
export const newBattleMetrics=():BattleMetrics=>({towerShots:0,towerHits:0,towerDamage:0,destroyed:[],pathFailures:0});
const aim=(g:Arena,p:Fighter):Vec=>({...world(p.position!),z:elevation(g.map,p.position!)+.7});
const colliders=(g:Arena,owner:string,team:Team):Collider[]=>[
 ...g.map.floors.map(at=>({id:'floor',kind:'terrain' as const,at,bottom:-100,top:elevation(g.map,at)})),
 ...g.objects.filter(o=>o.kind!=='mine'&&o.id!==owner).map(o=>({id:o.id,kind:'object' as const,at:o.at,bottom:elevation(g.map,o.at),top:elevation(g.map,o.at)+o.height})),
 ...g.players.filter(p=>p.position&&p.hp>0&&p.team&&p.team!==team).map(p=>({id:p.id,kind:'player' as const,at:p.position!,radius:C.bodyRadius,bottom:elevation(g.map,p.position!),top:elevation(g.map,p.position!)+C.bodyHeight}))];
const segment=(a:Vec,b:Vec):Ballistic=>({origin:a,velocity:{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},gravity:0});
export function towerCanHit(g:Arena,tower:Destructible,p:Fighter){
 if(!p.position||!p.team||p.team===tower.team||!tower.team)return false;
 const a=world(tower.at),b=world(p.position);if(Math.hypot(a.x-b.x,a.y-b.y)>M.towerRange+1e-8)return false;
 return firstCollision(segment({...a,z:elevation(g.map,tower.at)+tower.height+.05},aim(g,p)),colliders(g,tower.id,tower.team),0,1)?.collider.id===p.id;
}
export function tickTowers(g:Arena,hit:(p:Fighter,n:number,source:string)=>void,effect:(kind:string,at:{q:number;r:number})=>void){
 // Sweep every travelled segment. No gravity, teleportation, or damage at launch.
 for(const shot of [...g.towerShots]){
  const target=g.players.find(p=>p.id===shot.target&&p.position&&p.hp>0&&p.team!==shot.team);
  if(!target||g.now>=shot.end){g.towerShots=g.towerShots.filter(s=>s!==shot);continue;}
  const end=aim(g,target),a=shot.position,dx=end.x-a.x,dy=end.y-a.y,dz=end.z-a.z,d=Math.hypot(dx,dy,dz),step=Math.min(d,M.towerSpeed*(g.now-shot.updated)/1000),k=d?step/d:0;
  const next={x:a.x+dx*k,y:a.y+dy*k,z:a.z+dz*k},collision=firstCollision(segment(a,next),colliders(g,shot.owner,shot.team),0,1);
  shot.previous={...a};shot.position=next;shot.updated=g.now;
  if(collision){g.towerShots=g.towerShots.filter(s=>s!==shot);effect('tower-impact',collision.collider.at);if(collision.collider.kind==='player'){const p=g.players.find(p=>p.id===collision.collider.id)!;g.metrics.towerHits++;g.metrics.towerDamage+=Math.min(p.hp,M.towerDamage);hit(p,M.towerDamage,shot.owner);}}
 }
 for(const tower of g.objects.filter(o=>o.kind==='tower'&&o.team)){
  if(g.now<(tower.nextAttack||0))continue;
  const tw=world(tower.at),target=g.players.filter(p=>towerCanHit(g,tower,p)).sort((a,b)=>{const aw=world(a.position!),bw=world(b.position!);return Math.hypot(aw.x-tw.x,aw.y-tw.y)-Math.hypot(bw.x-tw.x,bw.y-tw.y)||a.id.localeCompare(b.id);})[0];
  if(!target)continue;tower.nextAttack=g.now+M.towerInterval;
  const position={...tw,z:elevation(g.map,tower.at)+tower.height+.05};g.towerShots.push({id:'tower-shot-'+ ++g.seq,owner:tower.id,team:tower.team!,target:target.id,position,previous:{...position},updated:g.now,start:g.now,end:g.now+M.towerLifetime});g.metrics.towerShots++;effect('tower-muzzle',tower.at);
 }
}
