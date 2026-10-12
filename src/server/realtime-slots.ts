import type {Team} from '../realtime/modes';
import {equal,type Hex} from '../core/hex';
import {hasFloor,type ArenaMap} from '../realtime/maps';
export type BattleSlot={team?:Team;number:number;kind:'human'|'bot';occupantId:string|null;spawn:Hex};
export function defaultSlots(map:ArenaMap,count=2):BattleSlot[]{if(count<2||count>6||map.spawns.length<count)throw Error('需要2～6席且地图出生点充足');return map.spawns.slice(0,count).map((s,i)=>({team:s.team||(i%2?'red':'blue'),number:i+1,kind:'human',occupantId:null,spawn:{...s.at}}));}
export function validateSpawn(map:ArenaMap,slots:BattleSlot[],number:number,at:Hex){if(!at||!Number.isSafeInteger(at.q)||!Number.isSafeInteger(at.r)||!hasFloor(map,at)||map.buildings?.some(o=>equal(o.at,at))||map.obstacles.some(o=>equal(o,at))||map.springs.some(s=>equal(s.at,at)))throw Error('出生点须为无障碍、无机关的合法地板');if(slots.some(s=>s.number!==number&&equal(s.spawn,at)))throw Error('出生点不能重复');return{q:at.q,r:at.r};}

/** Preserve seat teams when changing maps; extra siege seats use legal nearby base cells. */
export function spawnSlotsOnMap(map:ArenaMap,slots:BattleSlot[]):BattleSlot[]{
 const assigned:BattleSlot[]=[];
 for(const slot of slots){const roots=map.spawns.filter(s=>!slot.team||s.team===slot.team).map(s=>s.at);const origins=roots.length?roots:map.spawns.map(s=>s.at);const candidates=[...origins,...map.floors.filter(h=>origins.some(o=>Math.max(Math.abs(h.q-o.q),Math.abs(h.r-o.r),Math.abs(h.q+h.r-o.q-o.r))<=1))];const at=candidates.find(h=>{try{validateSpawn(map,assigned,slot.number,h);return true;}catch{return false;}});if(!at)throw Error('地图不能容纳当前阵营席位');assigned.push({...slot,spawn:{q:at.q,r:at.r}});}
 return assigned;
}
