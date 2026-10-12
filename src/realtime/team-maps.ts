import {board,type Hex} from '../core/hex';
import type {ArenaMap} from './maps';
const at=(q:number,r:number):Hex=>({q,r});
// Mirror about world X=0 (axial q'=-q-r), preserving unequal upper/lower lanes.
const mirror=(h:Hex)=>at(-h.q-h.r,h.r);
const mobaFloors=board(8).filter(h=>Math.abs(h.q+h.r/2)<=7&&Math.abs(h.r)<=5&&!(h.r===0&&Math.abs(h.q)===3)&&!(h.r===3&&(h.q===-1||h.q===-2))).map(h=>{const x=Math.abs(h.q+h.r/2);let height=0;if(x<4.5){if(h.r<=-2)height=x>=3.5?.5:1;else if(h.r===-1)height=.5;else if(h.r>=3)height=x>=3.5?.5:1;else if(h.r===2)height=.5;}if(h.r===-4&&(h.q===0||h.q===4))height=2;if(h.r===-3&&(h.q===-1||h.q===4))height=1.5;return{...h,height};});
const blueSpawns=[at(-6,0),at(-6,1),at(-5,-1)];
const blueTowers=[at(-4,-1),at(-5,2)];
export const TEAM_MAPS:ArenaMap[]=[{
 version:1,id:'duel-bases',name:'双桥基地',description:'上路高台正面推进，下路曲折侧翼；中央宽阔换线，石头可打开捷径。扩宽侧翼、左右镜像纵深基地与双塔。',supportedModes:['moba'],
 floors:mobaFloors,
 minionLanes:[{spawn:at(-6,-1),waypoints:[at(-3,-2),at(1,-2),at(4,-2),at(6,0)]},{spawn:at(-6,2),waypoints:[at(-3,2),at(0,1),at(2,2),at(5,1)]}].flatMap(l=>[{team:'blue' as const,targetTeam:'red' as const,...l},{team:'red' as const,targetTeam:'blue' as const,spawn:mirror(l.spawn),waypoints:l.waypoints.map(mirror)}]),
 spawns:blueSpawns.flatMap((h,i)=>[{number:i*2+1,at:h,team:'blue' as const},{number:i*2+2,at:mirror(h),team:'red' as const}]),springs:[],
 obstacles:[at(-1,-1),at(0,2)].flatMap(h=>[h,mirror(h)]),
 buildings:[{id:'blue-core',kind:'core',team:'blue',at:at(-7,0)},{id:'red-core',kind:'core',team:'red',at:at(7,0)},...blueTowers.flatMap((h,i)=>[{id:'blue-tower-'+i,kind:'tower' as const,team:'blue' as const,at:h},{id:'red-tower-'+i,kind:'tower' as const,team:'red' as const,at:mirror(h)}])],
 healing:[...[-1,0,1].map(r=>({team:'blue' as const,at:at(-5,r)})),...[-1,0,1].map(r=>({team:'red' as const,at:mirror(at(-5,r))}))]
},{version:1,id:'hill-castle',name:'双径山城',description:'正门最短、南翼楼梯绕塔、北侧石墙可破；城内高台可绕行，扩大外围通道与城内纵深，保留三路突破。',supportedModes:['siege'],
 minionLanes:[{team:'blue',targetTeam:'red',spawn:at(-5,1),waypoints:[at(-1,0),at(1,0),at(4,0)]},{team:'blue',targetTeam:'red',spawn:at(-5,-1),waypoints:[at(-2,-2),at(1,-2),at(3,-2),at(5,0)]}],
 // Three separated approaches. The gate has a level apron for melee; .5 steps reach the keep.
 floors:board(8).filter(h=>h.q>=-5&&h.q<=7&&h.r>=-5&&h.r<=5).map(h=>{let height=0;if(h.q>=1){const route=h.r===0||h.r===1||h.r===3||h.r===-3||h.r===-2;height=route?Math.min(2,Math.max(0,(h.q-1)*.5)):2;}return{...h,height};}),
 spawns:[at(-4,0),at(7,-1),at(-4,-1),at(7,0),at(-4,1),at(6,1)].map((at,i)=>({number:i+1,at,team:i%2?'red':'blue'})),springs:[],
 obstacles:[at(1,-3),at(1,-2),at(-1,-1),at(-1,2)],
 buildings:[{id:'castle-core',kind:'core',team:'red',at:at(5,0)},{id:'castle-gate',kind:'gate',team:'red',at:at(1,0)},{id:'castle-tower',kind:'tower',team:'red',at:at(3,1)}],
 healing:[{team:'blue',at:at(-4,0)},{team:'blue',at:at(-4,1)}]
}];
