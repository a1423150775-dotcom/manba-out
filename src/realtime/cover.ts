import {DIRS,add,equal,type Hex} from '../core/hex';
import {hasFloor} from './maps';
import type {Arena} from './engine';
/** Opposite directions describe the same straight three-cell wall. */
export function coverCells(center:Hex,axis:number):Hex[]{return [add(center,DIRS[axis%3]),{q:center.q,r:center.r},add(center,DIRS[axis%3+3])];}
export function coverCellReason(g:Arena,h:Hex):string|null{
 if(!hasFloor(g.map,h))return '没有地板';
 if([...g.players,...(g.minions||[])].some(p=>p.position&&equal(p.position,h)))return '玩家占据';
 const o=g.objects.find(o=>equal(o.at,h));
 if(o)return o.kind==='mine'?'地雷占据':o.kind==='cover'?'已有掩体':'实体障碍';
 // Preserve existing trap incompatibility; never erase a trap to place a wall.
 if(g.springs.some(s=>equal(s.at,h)))return '弹簧占据';
 return null;
}
