import assert from 'node:assert/strict';
import { writeFileSync,mkdirSync } from 'node:fs';
import { createArena,stepArena,type Setup } from '../src/realtime/engine';
import { decideBots } from '../src/realtime/bots';
import { CHARACTERS,type CharacterId } from '../src/realtime/config';
import {hasFloor} from '../src/realtime/maps';
import { key } from '../src/core/hex';
mkdirSync('realtime-review',{recursive:true});
const results=[];const cpu=process.cpuUsage(),wall=performance.now(),memoryBefore=process.memoryUsage().heapUsed;
for(const scenario of [{humans:1,bots:1},{humans:1,bots:3},{humans:1,bots:5},{humans:0,bots:6}]){
 let actions=0,kills=0;
 for(let seed=1;seed<=20;seed++){
  const setup:Setup[]=Array.from({length:scenario.humans+scenario.bots},(_,i)=>({id:String(i),name:`测试${i}`,color:'red',character:(['laoda','tank','mouse'] as CharacterId[])[i%3],...(i<scenario.humans?{}:{bot:(['easy','normal','hard'] as const)[i%3]})}));
  const g=createArena(setup,seed,'sim',600000);
  while(g.phase==='playing'){
   stepArena(g);decideBots(g);
   const occupied=g.players.filter(p=>p.position).map(p=>key(p.position!));assert.equal(new Set(occupied).size,occupied.length,'duplicate occupancy');
   for(const p of g.players){assert.equal(p.hand.length,4);assert.equal(p.queue.length,4);const cards=[...p.hand,...p.queue];assert.equal(new Set(cards.map(c=>c.id)).size,8);assert.deepEqual(cards.map(c=>c.skill).sort(),[...p.deck].sort());assert.ok(p.hp>=0&&p.hp<=CHARACTERS[p.character].hp);assert.ok(p.energy>=0&&p.energy<=10);if(p.position)assert.ok(hasFloor(g.map,p.position));else assert.equal(p.hp,0);}
   assert.equal(g.kills,g.players.reduce((n,p)=>n+p.kills,0));assert.ok(g.events.length<=80);
  }
  assert.ok(g.actionsStarted>10,'bots must participate');actions+=g.actionsStarted;kills+=g.kills;
 }
 results.push({...scenario,matches:20,simulatedMinutes:200,actions,kills});
}
const report={results,wallMs:Math.round(performance.now()-wall),cpuMs:Math.round((process.cpuUsage(cpu).user+process.cpuUsage(cpu).system)/1000),heapBefore:memoryBefore,heapAfter:process.memoryUsage().heapUsed,note:'Accelerated simulation; stationary human slots are not browser input. Heap samples are not proof of no long-running memory leak.'};
writeFileSync('realtime-review/simulation.json',JSON.stringify(report,null,2));console.log(report);
