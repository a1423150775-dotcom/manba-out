import {equal,type Hex} from '../core/hex';
import {hasFloor,type ArenaMap} from '../realtime/maps';
export type BattleSlot={number:number;kind:'human'|'bot';occupantId:string|null;spawn:Hex};
export function defaultSlots(map:ArenaMap,count=2):BattleSlot[]{if(count<2||count>6||map.spawns.length<count)throw Error('需要2～6席且地图出生点充足');return map.spawns.slice(0,count).map((s,i)=>({number:i+1,kind:'human',occupantId:null,spawn:{...s.at}}));}
export function validateSpawn(map:ArenaMap,slots:BattleSlot[],number:number,at:Hex){if(!at||!Number.isSafeInteger(at.q)||!Number.isSafeInteger(at.r)||!hasFloor(map,at)||map.obstacles.some(o=>equal(o,at))||map.springs.some(s=>equal(s.at,at)))throw Error('出生点须为无障碍、无机关的合法地板');if(slots.some(s=>s.number!==number&&equal(s.spawn,at)))throw Error('出生点不能重复');return{q:at.q,r:at.r};}
