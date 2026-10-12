import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createArena,stepArena,type Setup} from '../src/realtime/engine';
import {decideBots} from '../src/realtime/bots';
import {BUILTIN_MAPS,hasFloor} from '../src/realtime/maps';
import {key,distance,DIRS,add,equal,type Hex} from '../src/core/hex';
import {moveHeight} from '../src/realtime/space';
const reports=[];const begin=performance.now();mkdirSync('tower-review',{recursive:true});
for(const mode of ['moba','siege'] as const)for(const counts of (mode==='moba'?[[1,1],[2,2],[3,3]]:[[1,1],[2,2],[3,3],[3,2]]))for(const seed of [11,42,103]){
 const map=BUILTIN_MAPS.find(m=>m.supportedModes?.includes(mode))!;const setup:Setup[]=[];
 for(const [i,team]of (['blue','red'] as const).entries())for(let n=0;n<counts[i];n++)setup.push({id:team+n,name:team+n,color:team,team,bot:'normal',spawn:map.spawns.filter(s=>s.team===team)[n].at});
 const g=createArena(setup,seed,'balance',mode==='moba'?600000:300000,map,{mode});let stalls=0;const positions=new Map<string,{key:string;since:number}>();
 while(g.phase==='playing'){stepArena(g);decideBots(g);const cells=g.players.filter(p=>p.position).map(p=>key(p.position!));assert.equal(new Set(cells).size,cells.length);for(const p of g.players){assert(p.hp>=0&&p.hp<=100);assert(p.energy>=0&&p.energy<=10);if(p.position){assert(hasFloor(map,p.position));const old=positions.get(p.id);if(!old||old.key!==key(p.position))positions.set(p.id,{key:key(p.position),since:g.now});else if(g.now-old.since>=30000){stalls++;old.since=g.now;}}}}
 const row={mode,counts,seed,winner:g.winner,reason:g.endReason,seconds:g.now/1000,kills:g.kills,actions:g.actionsStarted,...g.metrics,stationary30s:stalls,cores:g.objects.filter(o=>o.kind==='core').map(o=>({team:o.team,hp:o.hp}))};reports.push(row);console.log(JSON.stringify(row));
}
// Shortest legal travel times include finite initial energy5, regeneration1.1/s; no enemies or skills.
const travel=[];for(const mode of ['moba','siege'] as const){const map=BUILTIN_MAPS.find(m=>m.supportedModes?.includes(mode))!;for(const spawn of map.spawns.filter(s=>s.number<=2)){const targets=[{name:'center',at:{q:0,r:0}},...map.buildings!.filter(b=>b.team!==spawn.team).map(b=>({name:b.kind,at:b.at}))];for(const t of targets){const todo=[{at:spawn.at,n:0}],seen=new Set<string>();let steps:number|null=null;while(todo.length){const c=todo.shift()!;if(seen.has(key(c.at)))continue;seen.add(key(c.at));if(distance(c.at,t.at)<=(t.name==='center'?0:1)){steps=c.n;break;}for(const d of DIRS){const h=add(c.at,d);if(hasFloor(map,h)&&moveHeight(map,c.at,h)&&!map.obstacles.some(o=>equal(o,h))&&!map.buildings!.some(o=>equal(o.at,h)))todo.push({at:h,n:c.n+1});}}travel.push({mode,team:spawn.team,target:t.name,steps,minMoveSeconds:steps,includesCombat:false});}}}
writeFileSync('tower-review/balance.json',JSON.stringify({reports,travel,elapsedMs:performance.now()-begin,note:'21 seeded accelerated normal-Bot matches; stationary30s is observation, not proof of a pathfinding deadlock. No real-device balance claim.'},null,2));
