import {board,type Hex} from '../core/hex';
import type {ArenaMap} from './maps';
const at=(q:number,r:number):Hex=>({q,r});
export const TEAM_MAPS:ArenaMap[]=[{
 version:1,id:'duel-bases',name:'双桥基地',description:'小型双路基地攻防，中路互通、两侧高台与可破坏掩障。',supportedModes:['moba'],
 floors:board(6).map(h=>({...h,height:Math.abs(h.r)===3?.5:Math.abs(h.r)>=4?1:0})),
 spawns:[at(-5,0),at(5,0),at(-5,1),at(5,-1),at(-4,-1),at(4,1)].map((at,i)=>({number:i+1,at,team:i%2?'red':'blue'})),springs:[],obstacles:[at(0,-2),at(0,2),at(1,-3),at(-1,3)],
 buildings:[{id:'blue-core',kind:'core',team:'blue',at:at(-6,0)},{id:'red-core',kind:'core',team:'red',at:at(6,0)},{id:'blue-tower',kind:'tower',team:'blue',at:at(-3,0)},{id:'red-tower',kind:'tower',team:'red',at:at(3,0)}],
 healing:[...[-1,0,1].map(r=>({team:'blue' as const,at:at(-4,r)})),...[-1,0,1].map(r=>({team:'red' as const,at:at(4,r)}))]
},{version:1,id:'hill-castle',name:'双径山城',description:'红方守城、蓝方攻城。高台城墙、正门楼梯与侧翼阶梯；可从城墙跳落。',supportedModes:['siege'],
 floors:board(6).map(h=>({...h,height:h.q>=4?2:h.q>0?(Math.abs(h.r)<=1?h.q*.5:2):0})),
 spawns:[at(-5,0),at(4,0),at(-4,-1),at(4,-1),at(-4,1),at(4,1)].map((at,i)=>({number:i+1,at,team:i%2?'red':'blue'})),springs:[],obstacles:[at(2,-2),at(2,2),at(3,-2)],
 buildings:[{id:'castle-core',kind:'core',team:'red',at:at(5,0)},{id:'castle-gate',kind:'gate',team:'red',at:at(2,0)},{id:'castle-tower',kind:'tower',team:'red',at:at(3,-1)}],healing:[]
}];
