import {TEAM_MAPS} from './team-maps';
import type {Mode,Team} from './modes';
import {board,DIRS,scale,clockwiseDirection,distance,key,equal,type Hex} from '../core/hex';
import {CONFIG} from '../core/config';
export type MapBuilding={id:string;kind:'core'|'tower'|'gate';team:Team;at:Hex};
export type MinionLane={team:Team;spawn:Hex;waypoints:Hex[];targetTeam:Team};
export type ArenaMap={version:1;minionLanes?:MinionLane[];supportedModes?:Mode[];buildings?:MapBuilding[];healing?:{team:Team;at:Hex}[];id:string;name:string;description:string;floors:(Hex & {height?:number})[];spawns:{number:number;at:Hex;team?:Team}[];springs:{at:Hex;direction:number}[];obstacles:Hex[]};
export const MAP_LIMITS={radius:8,minFloors:12,maxFloors:217,maxBytes:60000};
const classic:ArenaMap={version:1,id:'classic',name:'中心竞技场',description:'半径6的开放竞技场；保留六座原有弹簧，外围加入少量石头与弹簧。按击杀与助攻计分。',floors:board(6),spawns:DIRS.map((d,i)=>({number:i+1,at:scale(d,5)})),springs:[...DIRS.map((d,i)=>({at:scale(d,3),direction:clockwiseDirection((i+3)%6)})),...[0,2,4].map(i=>({at:{q:DIRS[i].q*4+DIRS[(i+1)%6].q,r:DIRS[i].r*4+DIRS[(i+1)%6].r},direction:clockwiseDirection((i+3)%6)}))],obstacles:DIRS.map((d,i)=>({q:d.q*4+DIRS[(i+1)%6].q*2,r:d.r*4+DIRS[(i+1)%6].r*2}))};
export const BUILTIN_MAPS:ArenaMap[]=[classic,
 {version:1,id:'abyss',name:'深渊环岛',description:'环形平台围绕深渊；内缘同样能被击落。',floors:board(5).filter(h=>distance(h)>=2),spawns:DIRS.map((d,i)=>({number:i+1,at:scale(d,5)})),springs:DIRS.map((d,i)=>({at:scale(d,4),direction:(i+1)%6})),obstacles:[{q:2,r:1},{q:-2,r:-1}]},
 {version:1,id:'factory',name:'弹簧工厂',description:'不规则车间、内部缺口与密集弹簧，注意障碍和连锁弹射。',floors:board(5).filter(h=>!((h.q===5||h.q===-5)&&h.r!==0)&&!(h.q===1&&h.r===-1)&&!(h.q===-1&&h.r===1)),spawns:CONFIG.starts[6].map((at,i)=>({number:i+1,at:{...at}})),springs:[...DIRS.map((d,i)=>({at:scale(d,3),direction:(i+2)%6})),{at:{q:0,r:1},direction:0},{at:{q:2,r:0},direction:2}],obstacles:[{q:1,r:1},{q:-1,r:-1},{q:2,r:-3},{q:-2,r:3}]}];
BUILTIN_MAPS.push(...TEAM_MAPS);
const fail=(message:string):never=>{throw new Error('地图无效：'+message);};
function record(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('字段格式错误或包含未知字段');return v as Record<string,unknown>;}
function hex(v:unknown):Hex{const p=record(v,['q','r']);if(!Number.isSafeInteger(p.q)||!Number.isSafeInteger(p.r)||distance(p as Hex)>MAP_LIMITS.radius)fail('坐标必须是半径8以内的整数轴坐标');return{q:p.q as number,r:p.r as number};}
function list(v:unknown,max:number){if(!Array.isArray(v)||v.length>max)fail('集合格式或数量超限');return v as unknown[];}
export function validateMap(value:unknown,players=2):ArenaMap{
 if(JSON.stringify(value)?.length>MAP_LIMITS.maxBytes)fail('JSON过大');const p=record(value,['version','id','name','description','floors','spawns','springs','obstacles','supportedModes','buildings','healing','minionLanes']);
 if(p.version!==1)fail('不支持此版本');if(typeof p.id!=='string'||! /^[a-zA-Z0-9_-]{1,48}$/.test(p.id))fail('ID需1～48个英文字母、数字、短横线或下划线');
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>40||typeof p.description!=='string'||p.description.length>240)fail('名称或描述长度错误');
 const seen=new Set<string>();
 const floors=list(p.floors,217).map(value=>{const f={...record(value,['q','r','height','elevation','hasFloor'])},at=hex({q:f.q,r:f.r});if(seen.has(key(at)))fail('地板重复');seen.add(key(at));if(f.hasFloor!==undefined&&typeof f.hasFloor!=='boolean')fail('hasFloor必须是布尔值');if(f.height!==undefined&&f.elevation!==undefined&&f.height!==f.elevation)fail('高度字段冲突');const height=f.elevation??f.height;if(height!==undefined&&(typeof height!=='number'||!Number.isFinite(height)||height< -1||height>4||(height<0&&height!==-1)))fail('地形高度需0～4，-1表示无地板');if(f.hasFloor===false||height===-1)return null;if(height===undefined)return at;return{...at,height:height as number};}).filter((f):f is Hex & {height?:number}=>f!==null);if(floors.length<12)fail('至少需要12块地板');const cells=new Set(floors.map(key));
 const occupied=new Set<string>();const place=(at:Hex)=>{if(!cells.has(key(at)))fail('出生点或机关不在地板上');if(occupied.has(key(at)))fail('出生点、机关或障碍位置重复');occupied.add(key(at));};
 const spawns=list(p.spawns,6).map(s=>{const v=record(s,['number','at','team']);if(!Number.isInteger(v.number)||(v.number as number)<1||(v.number as number)>6)fail('出生点编号需1～6');const at=hex(v.at);place(at);if(v.team!==undefined&&!['blue','red'].includes(String(v.team)))fail('出生阵营无效');return{number:v.number as number,at,...(v.team?{team:v.team as Team}:{})};}).sort((a,b)=>a.number-b.number);
 if(spawns.length<Math.max(2,players)||new Set(spawns.map(s=>s.number)).size!==spawns.length)fail('出生点不足或编号重复');
 const springs=list(p.springs,48).map(s=>{const v=record(s,['at','direction']);if(!Number.isInteger(v.direction)||(v.direction as number)<0||(v.direction as number)>5)fail('弹簧方向需0～5');const at=hex(v.at);place(at);return{at,direction:v.direction as number};});
 const obstacles=list(p.obstacles,100).map(hex);obstacles.forEach(place);
 const supportedModes=p.supportedModes===undefined?undefined:list(p.supportedModes,3).map(m=>{if(!['ffa','moba','siege'].includes(String(m)))fail('模式无效');return m as Mode;});
 if(supportedModes&&!supportedModes.length)fail('至少选择一种模式');
 const buildings=p.buildings===undefined?undefined:list(p.buildings,24).map(value=>{const v=record(value,['id','kind','team','at']);if(typeof v.id!=='string'||! /^[a-zA-Z0-9_-]{1,48}$/.test(v.id)||!['core','tower','gate'].includes(String(v.kind))||!['blue','red'].includes(String(v.team)))fail('建筑字段无效');const at=hex(v.at);place(at);return{id:v.id as string,kind:v.kind as MapBuilding['kind'],team:v.team as Team,at};});
 if(buildings&&new Set(buildings.map(b=>b.id)).size!==buildings.length)fail('建筑ID重复');
 const healing=p.healing===undefined?undefined:list(p.healing,24).map(value=>{const v=record(value,['team','at']),at=hex(v.at);if(!['blue','red'].includes(String(v.team))||!cells.has(key(at))||buildings?.some(b=>equal(b.at,at))||obstacles.some(h=>equal(h,at)))fail('恢复地板无效');return{team:v.team as Team,at};});
 if(healing&&new Set(healing.map(h=>key(h.at))).size!==healing.length)fail('恢复地板重复');
 const minionLanes=p.minionLanes===undefined?undefined:list(p.minionLanes,8).map(value=>{const v=record(value,['team','spawn','waypoints','targetTeam']),spawn=hex(v.spawn),waypoints=list(v.waypoints,24).map(hex);if(!['blue','red'].includes(String(v.team))||!['blue','red'].includes(String(v.targetTeam))||v.team===v.targetTeam||![spawn,...waypoints].every(h=>cells.has(key(h))))fail('小兵路线无效');return{team:v.team as Team,targetTeam:v.targetTeam as Team,spawn,waypoints};});
 for(const mode of supportedModes||[])if(mode!=='ffa'){
  if(!['blue','red'].every(team=>spawns.some(s=>s.team===team)))fail('组队地图需要双方出生区域');
  const cores=buildings?.filter(b=>b.kind==='core')||[];
  if(mode==='moba'&&!['blue','red'].every(team=>cores.filter(b=>b.team===team).length===1))fail('MOBA需要双方各一个核心');
  if(mode==='siege'&&(cores.length!==1||cores[0].team!=='red'))fail('城堡需要一个防守方核心');
  // Potential routes may traverse destructible objects, but never climb a cliff.
  for(const core of cores){const seen=new Set<string>(),queue=spawns.filter(s=>s.team!==core.team).map(s=>s.at);while(queue.length){const h=queue.shift()!;if(seen.has(key(h)))continue;seen.add(key(h));for(const d of DIRS){const n={q:h.q+d.q,r:h.r+d.r};const a=floors.find(f=>equal(f,h))?.height||0,b=floors.find(f=>equal(f,n))?.height||0;if(cells.has(key(n))&&!seen.has(key(n))&&(Math.abs(a-b)<=.5||a-b>=1))queue.push(n);}}if(!seen.has(key(core.at)))fail('敌方无法到达核心所在区域');}
 }
 return {version:1,...(minionLanes?{minionLanes}:{}),...(supportedModes?{supportedModes}:{}),...(buildings?{buildings}:{}),...(healing?{healing}:{}),id:p.id as string,name:(p.name as string).trim(),description:p.description as string,floors,spawns,springs,obstacles};
}
export const hasFloor=(map:ArenaMap,h:Hex)=>map.floors.some(at=>equal(at,h));
export function chooseMap(id:unknown){const found=BUILTIN_MAPS.find(m=>m.id===id);if(!found)fail('地图不存在');return validateMap(found);}

export const supportsMode=(map:ArenaMap,mode:Mode)=>(map.supportedModes||['ffa']).includes(mode);
