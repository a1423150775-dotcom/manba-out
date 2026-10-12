import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createArena,stepArena,type Setup} from '../src/realtime/engine';
import {decideBots} from '../src/realtime/bots';
import {BUILTIN_MAPS,hasFloor} from '../src/realtime/maps';
import {adaptLoadout,CYCLE,type SkillRule,type Mode} from '../src/realtime/modes';
import {key} from '../src/core/hex';
mkdirSync('modes22-review',{recursive:true});const reports=[];const started=performance.now(),heap=process.memoryUsage().heapUsed;
for(const mode of ['ffa','moba','siege'] as Mode[])for(const n of [2,6])for(const rule of [CYCLE,{type:'fixed',slotCount:2}] as SkillRule[]){
 const map=BUILTIN_MAPS.find(m=>(m.supportedModes||['ffa']).includes(mode))!;
 const setup:Setup[]=Array.from({length:n},(_,i)=>({id:String(i),name:'Bot'+i,color:'red',team:i%2?'red':'blue',character:'laoda',bot:'normal',deck:adaptLoadout(rule.type==='fixed'?['elbow','fireball']:undefined,rule)}));
 const g=createArena(setup,42,mode,mode==='moba'?600000:300000,map,{mode,skillRule:rule});let minCore=500;
 while(g.phase==='playing'){stepArena(g);decideBots(g);const occupied=g.players.filter(p=>p.position).map(p=>key(p.position!));assert.equal(new Set(occupied).size,occupied.length,'overlap');for(const p of g.players){assert(p.hp>=0&&p.hp<=100);assert(p.energy>=0&&p.energy<=10);assert.equal(p.hand.length,rule.slotCount);assert.equal(p.queue.length,rule.type==='cycle'?4:0);if(p.position)assert(hasFloor(map,p.position));}minCore=Math.min(minCore,...g.objects.filter(o=>o.kind==='core').map(o=>o.hp));}
 assert(g.actionsStarted>10);reports.push({mode,n,rule,actions:g.actionsStarted,kills:g.kills,winner:g.winner,reason:g.endReason,minCore,cores:g.objects.filter(o=>o.kind==='core').map(o=>({team:o.team,hp:o.hp})),positions:g.players.map(p=>p.position)});console.log(reports.at(-1));
}
writeFileSync('modes22-review/simulation.json',JSON.stringify({reports,wallMs:performance.now()-started,heapBefore:heap,heapAfter:process.memoryUsage().heapUsed,note:'Accelerated server simulation, not real devices or a leak proof'},null,2));
