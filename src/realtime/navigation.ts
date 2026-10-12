import {RT_CONFIG} from './config';
import {DIRS,add,distance,equal,key,type Hex} from '../core/hex';
import {hasFloor} from './maps';
import {moveHeight} from './space';
import type {Arena,Fighter} from './engine';
export type Navigation={kind:'point'|'follow';at?:Hex;targetId?:string;path:Hex[];nextPlan:number;blockedSince?:number;status:string};
export type NavigationRequest={kind:'step';at:Hex}|{kind:'point';at:Hex}|{kind:'follow';targetId:string}|{kind:'stop'};
const blocked=(g:Arena,p:Fighter,h:Hex)=>g.objects.some(o=>o.kind!=='mine'&&equal(o.at,h))||[...g.players,...(g.minions||[])].some(t=>t.id!==p.id&&t.position&&equal(t.position,h));
// Bounded Dijkstra: at most 217 map cells; mine cells are costly, never impassable.
export function findPath(g:Arena,p:Fighter,target:Hex,adjacent=false):Hex[]|null{
 if(!p.position)return null;const queue=[{at:p.position,path:[] as Hex[],cost:0}],best=new Map([[key(p.position),0]]);
 while(queue.length){queue.sort((a,b)=>a.cost-b.cost);const n=queue.shift()!;if(n.cost!==best.get(key(n.at)))continue;
 if(distance(n.at,target)<=(adjacent?1:0))return n.path;
 for(const dir of DIRS){const h=add(n.at,dir);if(!hasFloor(g.map,h)||!moveHeight(g.map,n.at,h)||blocked(g,p,h))continue;
 const cost=n.cost+1+(g.objects.some(o=>o.kind==='mine'&&equal(o.at,h))?6:0)+(g.springs.some(s=>equal(s.at,h))?3:0);if(cost>=(best.get(key(h))??Infinity))continue;best.set(key(h),cost);queue.push({at:h,path:[...n.path,h],cost});}
 }return null;
}
export function navigationRevision(p:Fighter,revision?:number){
 if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision<1||revision<=(p.navigationRevision||0)))return{ok:false,reason:'移动请求已过期，请重新选择目标'};
 p.navigationRevision=revision??(p.navigationRevision||0)+1;return{ok:true};
}
type Move=(g:Arena,id:string,at:Hex,automatic?:boolean)=>{ok:boolean;reason?:string};
export function singleStep(g:Arena,p:Fighter,target:Hex,move:Move):{ok:boolean;reason?:string}{
 p.navigation=null;p.pendingStep=null;
 if(!p.position)return{ok:false,reason:'死亡期间不能移动'};
 if(!target||!Number.isSafeInteger(target.q)||!Number.isSafeInteger(target.r)||!hasFloor(g.map,target))return{ok:false,reason:'无法到达目标位置'};
 if(equal(p.position,target))return{ok:true};
 const path=findPath(g,p,target);
 // Preserve the existing adjacent manual collision attack, never use it for automatic routing.
 const collision=distance(p.position,target)===1&&g.players.some(t=>t.id!==p.id&&t.position&&equal(t.position,target));
 if(!path?.length&&!collision)return{ok:false,reason:'无法到达目标位置'};
 if(p.movement?.skill==='move'){
  p.pendingStep={at:{q:target.q,r:target.r},expires:g.now+1500};p.navigationNotice='当前一步完成后，再移动一步';return{ok:true};
 }
 const r=move(g,p.id,collision?target:path![0],false);p.navigationNotice=r.ok?'单步移动':r.reason;return r;
}
export function setNavigation(g:Arena,id:string,input:NavigationRequest,move?:Move,revision?:number){const p=g.players.find(p=>p.id===id);if(!p||g.phase!=='playing')return{ok:false,reason:'比赛已结束或玩家不存在'};
 const accepted=navigationRevision(p,revision);if(!accepted.ok)return accepted;p.pendingStep=null;
 if(input?.kind==='step')return move?singleStep(g,p,input.at,move):{ok:false,reason:'单步移动接口不可用'};
 if(input?.kind==='stop'){p.navigation=null;if(p.movement?.skill==='move'){p.movement=null;p.moveRecoveryUntil=g.now+RT_CONFIG.moveRecoveryMs;}p.navigationNotice='已停止自动移动';return{ok:true};}
 if(!p.position)return{ok:false,reason:'死亡期间不能设置移动任务'};
 if(input?.kind==='point'){if(!input.at||!Number.isSafeInteger(input.at.q)||!Number.isSafeInteger(input.at.r)||!hasFloor(g.map,input.at))return{ok:false,reason:'目标格不存在'};if(g.objects.some(o=>o.kind!=='mine'&&equal(o.at,input.at)))return{ok:false,reason:'目标格被障碍物占据'};p.navigation={kind:'point',at:{q:input.at.q,r:input.at.r},path:[],nextPlan:0,status:'正在规划路线'};}
 else if(input?.kind==='follow'){if(!g.players.some(t=>t.id===input.targetId&&t.id!==id&&t.position))return{ok:false,reason:'跟随目标无效或已死亡'};p.navigation={kind:'follow',targetId:input.targetId,path:[],nextPlan:0,status:'正在接近目标'};}
 else return{ok:false,reason:'移动任务无效'};p.navigationNotice='';return{ok:true};
}
export function tickNavigation(g:Arena,move:Move){for(const p of g.players){
 if(p.pendingStep){const pending=p.pendingStep;if(!p.position||g.phase!=='playing'||g.now>pending.expires){p.pendingStep=null;p.navigationNotice='待移动操作已取消';}else if(!p.movement){const r=singleStep(g,p,pending.at,move);if(!r.ok)p.navigationNotice=r.reason;}}
 const nav=p.navigation;if(!nav)continue;
 if(!p.position||g.phase!=='playing'){p.navigation=null;p.navigationNotice='自动移动已取消：角色死亡或比赛结束';continue;}
 const target=nav.kind==='follow'?[...g.players,...(g.minions||[])].find(t=>t.id===nav.targetId)?.position:nav.at;if(!target){if(p.movement?.skill==='move'){p.movement=null;p.moveRecoveryUntil=g.now+RT_CONFIG.moveRecoveryMs;}p.navigation=null;p.navigationNotice='跟随已取消：目标死亡或离开';continue;}
 if(p.stunnedUntil>g.now||p.forced||p.carriedBy){nav.status='控制中，稍后继续';continue;}
 if(p.action||p.movement)continue;if(p.energy+1e-9<1){nav.status='等待能量恢复';continue;}if(g.now<nav.nextPlan)continue;nav.nextPlan=g.now+500;
 const path=findPath(g,p,target,nav.kind==='follow'||g.players.some(t=>t.id!==p.id&&t.position&&equal(t.position,target)));nav.path=path||[];
 if(path===null){nav.status='路径受阻，等待通路';nav.blockedSince??=g.now;if(g.now-nav.blockedSince>=5000){p.navigation=null;p.navigationNotice='自动移动已取消：连续5秒无法到达';}continue;}
 nav.blockedSince=undefined;if(!path.length){if(nav.kind==='point'){p.navigation=null;p.navigationNotice='已到达目的地附近';}else nav.status='已在目标相邻格';continue;}
 const result=move(g,p.id,path[0],true);nav.status=result.ok?'自动移动中':result.reason||'暂时无法移动';
 }}
