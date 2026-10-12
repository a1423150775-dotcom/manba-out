import {units,arrowColliders,launchArrow,launchFireball,type Arena,type Destructible,type Fighter} from './engine';
import {MODE_CONFIG as M} from './modes';
import {RT_CONFIG as C} from './config';
import {world,elevation,firstCollision,trajectories} from './space';
export type BattleMetrics={towerShots:number;towerHits:number;towerDamage:number;coreShots:number;coreDamage:number;towerMinionShots:number;towerPlayerShots:number;coreMinionShots:number;corePlayerShots:number;minionSpawns:number;minionDeaths:number;minionBuildingDamage:number;destroyed:{id:string;kind:string;at:number}[];pathFailures:number};
export const newBattleMetrics=():BattleMetrics=>({towerShots:0,towerHits:0,towerDamage:0,coreShots:0,coreDamage:0,towerMinionShots:0,towerPlayerShots:0,coreMinionShots:0,corePlayerShots:0,minionSpawns:0,minionDeaths:0,minionBuildingDamage:0,destroyed:[],pathFailures:0});
export function buildingArrow(g:Arena,b:Destructible,p:Fighter){if(!p.position)return;const shot=trajectories({...world(b.at),z:elevation(g.map,b.at)+M.buildingHeight},{...world(p.position),z:elevation(g.map,p.position)+C.launchHeight},M.towerArrowSpeed)[0];if(!shot)return;const t=Math.hypot(world(p.position).x-shot.origin.x,world(p.position).y-shot.origin.y)/Math.hypot(shot.velocity.x,shot.velocity.y);return firstCollision(shot,arrowColliders(g,b.id),0,t+.01)?.collider.id===p.id?shot:undefined;}
export function towerCanHit(g:Arena,b:Destructible,p:Fighter){if(!p.position||p.hp<=0||!p.team||p.team===b.team||!b.team)return false;const a=world(b.at),v=world(p.position);if(Math.hypot(a.x-v.x,a.y-v.y)>(b.kind==='tower'?M.towerRange:M.coreRange)+1e-8)return false;return b.kind==='core'||!!buildingArrow(g,b,p);}
export function tickTowers(g:Arena){if(g.phase!=='playing')return;for(const b of g.objects.filter(o=>(o.kind==='tower'||o.kind==='core')&&o.team)){
 g.sourceTeams[b.id]=b.team!;g.sourceBuildings[b.id]=b.kind as 'tower'|'core';
 const a=world(b.at),targets=units(g).filter(p=>towerCanHit(g,b,p)).sort((p,q)=>Number(!!q.minion)-Number(!!p.minion)||Math.hypot(world(p.position!).x-a.x,world(p.position!).y-a.y)-Math.hypot(world(q.position!).x-a.x,world(q.position!).y-a.y)||p.id.localeCompare(q.id)),target=targets[0];
 const old=b.aim,lastFire=old?.lastFire;if(!target){b.aim=lastFire===undefined?undefined:{targetId:'',lastFire};continue;}
 const windup=b.kind==='tower'?M.towerWindup:M.coreWindup,interval=b.kind==='tower'?M.towerInterval:M.coreInterval;
 if(old?.targetId!==target.id)b.aim={targetId:target.id,lastFire};const aim=b.aim!;
 if(aim.fireAt===undefined&&g.now>=((aim.lastFire??-interval)+interval-windup)){aim.windupStart=g.now;aim.fireAt=g.now+windup;}
 if(aim.fireAt===undefined||g.now<aim.fireAt||g.projectiles.length>=C.maxProjectiles)continue;
 // Revalidate at release; origin/aim lock now, projectiles never home.
 if(!towerCanHit(g,b,target)){aim.fireAt=undefined;continue;}
 if(b.kind==='tower'){const shot=buildingArrow(g,b,target);if(!shot)continue;launchArrow(g,b.id,b.at,target.position!,shot,'tower');g.metrics.towerShots++;if(target.minion)g.metrics.towerMinionShots++;else g.metrics.towerPlayerShots++;}
 else{launchFireball(g,b.id,b.at,target.position!,elevation(g.map,b.at)+M.buildingHeight,'core');g.metrics.coreShots++;if(target.minion)g.metrics.coreMinionShots++;else g.metrics.corePlayerShots++;}
 aim.lastFire=g.now;aim.flashUntil=g.now+180;aim.fireAt=undefined;aim.windupStart=undefined;
 }}
