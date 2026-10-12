import {DIRS,add,distance,equal,key,scale,type Hex} from '../core/hex';
import {BUILTIN_MAPS,validateMap,hasFloor,type ArenaMap} from './maps';
import {createGame} from '../core/game';
import {nextRandom} from '../core/random';
import {CHARACTERS,DEFAULT_DECK,RT_CONFIG as C,SKILLS,validDeck,migrateDeck,type CharacterId,type Skill,type SkillId} from './config';
import {world,elevation,stepHeight,trajectories,firstCollision,positionAt,hexLine,type Ballistic,type Collider} from './space';
export type Difficulty='easy'|'normal'|'hard';
export type BotMode='normal'|'move'|'attack'|'idle';
export type Intent={skill:SkillId;slot?:number;targetId?:string;at?:Hex;direction?:number;arc?:'low'|'high';auto?:boolean};
export type ActiveAction=Intent & {seq:number;start:number;hitAt:number;end:number;from:Hex;path:Hex[];step:number;resolved:boolean;shot?:Ballistic;carried?:string[]};
export type CardInstance={id:string;skill:SkillId};
export type Fighter={id:string;name:string;color:string;character:CharacterId;deck:SkillId[];hand:CardInstance[];queue:CardInstance[];bot?:Difficulty;botMode:BotMode;position:Hex|null;motion?:{at:number;path:Hex[];duration?:number};spawn:Hex;hp:number;energy:number;nextEnergy:number;stunnedUntil:number;respawnAt:number|null;action:ActiveAction|null;movement:ActiveAction|null;forced:ActiveAction|null;score:number;kills:number;assists:number;deaths:number;coins:number;nextThink:number;previous:Hex|null;lastAttacker:string|null;lastHit:number;nextBuy:number;carriedBy:string|null;contributors:Record<string,number>};
export type Setup=Pick<Fighter,'id'|'name'|'color'> & Partial<Pick<Fighter,'character'|'deck'|'bot'>>;
export type Destructible={id:string;kind:'stone'|'cover'|'mine';at:Hex;hp:number;maxHp:number;height:number;owner:string|null;created:number};
export type Projectile=Ballistic & {id:string;kind:'arrow'|'fireball';owner:string;start:number;end:number;at:Hex;from:Hex};
export type Visual={id:number;kind:string;at:Hex;from?:Hex;start:number;end:number;radius?:number};
export type Arena={map:ArenaMap;matchId:string;now:number;seed:number;rng:number;seq:number;phase:'playing'|'finished';players:Fighter[];springs:{id:string;at:Hex;direction:number;owner:string|null;expires:number|null}[];obstacles:Hex[];objects:Destructible[];projectiles:Projectile[];visuals:Visual[];boxes:Hex[];shop:Hex|null;nextResources:number;duration:number;pausedBots:boolean;events:{id:number;at:number;text:string}[];eventId:number;actionsStarted:number;actionsHit:number;kills:number};
const validHex=(g:Arena,h:unknown):h is Hex=>!!h&&Number.isSafeInteger((h as Hex).q)&&Number.isSafeInteger((h as Hex).r)&&hasFloor(g.map,h as Hex);
export function random(g:Arena){const r=nextRandom(g.rng);g.rng=r.seed;return r.value;}
export function log(g:Arena,text:string){g.events.push({id:++g.eventId,at:g.now,text});if(g.events.length>80)g.events.shift();}
export const occupant=(g:Arena,at:Hex)=>g.players.find(p=>p.position&&equal(p.position,at));
export const solid=(g:Arena,at:Hex)=>g.objects.find(o=>o.kind!=='mine'&&equal(o.at,at));
export const free=(g:Arena,at:Hex)=>hasFloor(g.map,at)&&!occupant(g,at)&&!solid(g,at);
export const canStep=(g:Arena,from:Hex,to:Hex)=>hasFloor(g.map,to)&&stepHeight(g.map,from,to)&&!solid(g,to);
export function addFighter(g:Arena,s:Setup){
 if(g.players.length>=6||g.players.some(p=>p.id===s.id))throw Error('位置已满或身份重复');
 const deck=migrateDeck(s.deck||DEFAULT_DECK),character=s.character||'laoda';if(!deck||!Object.hasOwn(CHARACTERS,character))throw Error('角色或卡组无效');
 const spawn=g.map.spawns.map(s=>s.at).find(h=>free(g,h));if(!spawn)throw Error('无出生位置');
 const p:Fighter={id:s.id,name:s.name,color:s.color,...(s.bot?{bot:s.bot}:{}),character,deck,hand:deck.slice(0,4).map((skill,i)=>({id:`${s.id}:${i}`,skill})),queue:deck.slice(4).map((skill,i)=>({id:`${s.id}:${i+4}`,skill})),botMode:'normal',spawn,position:{...spawn},hp:CHARACTERS[character].hp,energy:C.initialEnergy,nextEnergy:g.now+C.regenMs,stunnedUntil:0,respawnAt:null,action:null,movement:null,forced:null,score:0,kills:0,assists:0,deaths:0,coins:3,nextThink:g.now+400,previous:null,lastAttacker:null,lastHit:0,nextBuy:0,carriedBy:null,contributors:{}};g.players.push(p);return p;
}
export function createArena(inputs:Setup[],seed=1,matchId='test',duration=C.matchMs,definition:ArenaMap=BUILTIN_MAPS[0]):Arena{
 if(inputs.length<1||inputs.length>6)throw Error('需要1～6名参赛者');const map=validateMap(definition,inputs.length),legacy=createGame([{id:'a',name:'a',color:'red'},{id:'b',name:'b',color:'blue'}],seed,0);
 const objects:Destructible[]=map.obstacles.map((at,i)=>({id:'stone'+i,kind:'stone',at,hp:100,maxHp:100,height:1,owner:null,created:0}));
 const g:Arena={map,matchId,now:0,seed,rng:seed||1,seq:0,phase:'playing',players:[],springs:map.springs.map((t,i)=>({id:'spring'+i,at:t.at,direction:t.direction,owner:null,expires:null})),obstacles:map.obstacles.map(h=>({...h})),objects,projectiles:[],visuals:[],boxes:legacy.boxes.map(b=>b.at).filter(h=>hasFloor(map,h)&&!objects.some(o=>equal(o.at,h))&&!map.springs.some(t=>equal(t.at,h))),shop:legacy.shop&&hasFloor(map,legacy.shop.at)&&!objects.some(o=>equal(o.at,legacy.shop!.at))?legacy.shop.at:null,nextResources:C.resourceMs,duration,pausedBots:false,events:[],eventId:0,actionsStarted:0,actionsHit:0,kills:0};inputs.forEach(p=>addFighter(g,p));return g;
}
export function interrupt(p:Fighter){p.action=null;p.movement=null;p.forced=null;}
export function stun(g:Arena,p:Fighter,ms:number){if(!p.position)return;interrupt(p);p.stunnedUntil=Math.max(p.stunnedUntil,g.now+ms);}
function credit(g:Arena,p:Fighter,source:string|null){if(source&&source!==p.id){p.lastAttacker=source;p.lastHit=g.now;p.contributors[source]=g.now;}}
export function die(g:Arena,p:Fighter,source:string|null){if(!p.position)return;p.position=null;p.hp=0;p.energy=0;interrupt(p);p.stunnedUntil=0;p.respawnAt=g.now+C.respawnMs;p.deaths++;const killer=g.players.find(q=>q.id===source&&q.id!==p.id);if(killer){killer.kills++;killer.score+=C.killScore;g.kills++;for(const [id,time]of Object.entries(p.contributors))if(id!==killer.id&&id!==p.id&&g.now-time<=C.assistMs){const a=g.players.find(p=>p.id===id);if(a){a.assists++;a.score+=C.assistScore;}}}log(g,`${p.name}阵亡${killer?'，'+killer.name+'击杀 +2分':'（自杀或环境）'}`);}
export function damage(g:Arena,p:Fighter,amount:number,source:string){if(!p.position)return;credit(g,p,source);p.hp=Math.max(0,p.hp-amount);if(!p.hp)die(g,p,source);}
function visual(g:Arena,kind:string,at:Hex,from?:Hex,radius?:number){g.visuals.push({id:++g.seq,kind,at:{q:at.q,r:at.r},from,start:g.now,end:g.now+600,radius});}
function removeObject(g:Arena,o:Destructible){g.objects=g.objects.filter(x=>x.id!==o.id);g.obstacles=g.objects.filter(x=>x.kind!=='mine').map(x=>x.at);}
export function damageObject(g:Arena,o:Destructible,amount:number,source:string){if(!g.objects.some(x=>x.id===o.id))return;o.hp=Math.max(0,o.hp-amount);if(o.hp<1e-7){removeObject(g,o);if(o.kind==='mine')explode(g,o.at,50,10,o.owner||source,'mine');else visual(g,'break',o.at);}}
export function explode(g:Arena,at:Hex,center:number,ring:number,owner:string,kind='fireball'){
 visual(g,kind,at,undefined,1);for(const p of [...g.players])if(p.position&&distance(p.position,at)<=1)damage(g,p,equal(p.position,at)?center:ring,owner);
 // Remove a mine before recursing: each unique object can explode exactly once.
 for(const o of [...g.objects])if(distance(o.at,at)<=1)damageObject(g,o,equal(o.at,at)?center:ring,owner);
}
type Chain={source:string|null;used:Set<string>;count:number};
function entered(g:Arena,p:Fighter,chain:Chain):boolean{
 if(!p.position)return false;for(const mine of [...g.objects])if(mine.kind==='mine'&&p.position&&equal(mine.at,p.position))damageObject(g,mine,mine.hp,mine.owner||p.id);
 if(!p.position)return true;const trap=g.springs.find(t=>equal(t.at,p.position!));if(trap&&!chain.used.has(trap.id)&&chain.count<C.chainLimit){chain.used.add(trap.id);chain.count++;interrupt(p);chain.source ||= trap.owner;push(g,p,trap.direction,2,chain);return true;}
 const i=g.boxes.findIndex(at=>p.position&&equal(at,p.position));if(i>=0){g.boxes.splice(i,1);p.hp=Math.min(CHARACTERS[p.character].hp,p.hp+20);p.energy=Math.min(C.maxEnergy,p.energy+2);p.coins++;log(g,`${p.name}拾取盲盒`);}return false;
}
export function push(g:Arena,p:Fighter,direction:number,steps:number,chain:Chain={source:null,used:new Set(),count:0}){
 for(let n=0;n<steps&&p.position;n++){const line:Fighter[]=[];let current:Fighter|undefined=p,blocked=false;
 while(current?.position){if(line.includes(current)){blocked=true;break;}line.push(current);const next=add(current.position,DIRS[direction]);if(solid(g,next)||(hasFloor(g.map,next)&&elevation(g.map,next)-elevation(g.map,current.position)>C.maxStep)){blocked=true;break;}current=hasFloor(g.map,next)?occupant(g,next):undefined;}if(blocked)break;
 for(const moved of [...line].reverse()){interrupt(moved);const next=add(moved.position!,DIRS[direction]);if(moved.motion?.at!==g.now)moved.motion={at:g.now,path:[{...moved.position!}]};moved.motion.path.push(next);credit(g,moved,chain.source);if(!hasFloor(g.map,next))die(g,moved,chain.source||(g.now-moved.lastHit<C.assistMs?moved.lastAttacker:null));else moved.position=next;}
 let redirected=false;for(const moved of [...line].reverse())if(entered(g,moved,chain)&&moved.id===p.id)redirected=true;if(redirected)break;}
}
export function colliders(g:Arena,owner:string):Collider[]{return[
 ...g.map.floors.map(at=>({id:'floor:'+key(at),kind:'terrain' as const,at,bottom:-100,top:elevation(g.map,at)})),
 ...g.objects.filter(o=>o.kind!=='mine').map(o=>({id:o.id,kind:'object' as const,at:o.at,bottom:elevation(g.map,o.at),top:elevation(g.map,o.at)+o.height})),
 ...g.players.filter(p=>p.position&&p.id!==owner).map(p=>({id:p.id,kind:'player' as const,at:p.position!,radius:C.bodyRadius,bottom:elevation(g.map,p.position!),top:elevation(g.map,p.position!)+C.bodyHeight}))];}
export function arrowOptions(g:Arena,p:Fighter,at:Hex){if(!p.position||!validHex(g,at)||distance(p.position,at)>SKILLS.arrow.range)return[];return trajectories({...world(p.position),z:elevation(g.map,p.position)+C.launchHeight},{...world(at),z:elevation(g.map,at)+.5});}
export function unobstructed(g:Arena,p:Fighter,target:Fighter){if(!p.position||!target.position)return false;const a=world(p.position),b=world(target.position);const shot:Ballistic={origin:{...a,z:elevation(g.map,p.position)+.5},velocity:{x:b.x-a.x,y:b.y-a.y,z:elevation(g.map,target.position)-elevation(g.map,p.position)},gravity:0};return firstCollision(shot,colliders(g,p.id),0,1)?.collider.id===target.id;}
export function autoIntent(g:Arena,p:Fighter,skill:SkillId):Intent|null{
 if(!p.position||!['elbow','basic','hook','fireball','arrow','charge'].includes(skill))return null;
 const candidates=g.players.filter(t=>t.id!==p.id&&t.position&&distance(p.position!,t.position)<=SKILLS[skill].range).map(t=>({t,shot:undefined as Ballistic|undefined})).filter(c=>{
 if(skill==='hook')return unobstructed(g,p,c.t);
 if(skill==='charge')return DIRS.some(d=>[1,2,3].some(n=>equal(add(p.position!,scale(d,n)),c.t.position!)));
 if(skill==='arrow'){c.shot=arrowOptions(g,p,c.t.position!).find(s=>{const t=Math.hypot(world(c.t.position!).x-s.origin.x,world(c.t.position!).y-s.origin.y)/Math.hypot(s.velocity.x,s.velocity.y);return firstCollision(s,colliders(g,p.id),0,t+.01)?.collider.id===c.t.id;});return !!c.shot;}
 return true;}).sort((a,b)=>distance(p.position!,a.t.position!)-distance(p.position!,b.t.position!));
 if(!candidates.length)return null;const nearest=distance(p.position,candidates[0].t.position!),ties=candidates.filter(c=>distance(p.position!,c.t.position!)===nearest),chosen=ties[Math.floor(random(g)*ties.length)],target=chosen.t;
 if(skill==='charge')return{skill,direction:DIRS.findIndex(d=>[1,2,3].some(n=>equal(add(p.position!,scale(d,n)),target.position!)))};
 if(skill==='arrow'||skill==='fireball')return{skill,at:{...target.position!},arc:chosen.shot&&chosen.shot.velocity.z>arrowOptions(g,p,target.position!)[0].velocity.z+1e-8?'high':'low'};
 return{skill,targetId:target.id};
}
export type HandRequest={slot:number;instanceId:string;targetId?:string;at?:Hex;direction?:number;arc?:'low'|'high';auto?:boolean};
export function useHandCard(g:Arena,id:string,input:HandRequest){const p=g.players.find(p=>p.id===id);if(!p||!input||!Number.isInteger(input.slot)||input.slot<0||input.slot>3)return{ok:false,reason:'请选择当前四张手牌中的卡槽'};const c=p.hand[input.slot];if(!c||c.id!==input.instanceId)return{ok:false,reason:'当前卡牌已变化，请重新选择'};if(input.auto){const aim=autoIntent(g,p,c.skill);if(!aim)return{ok:false,reason:'没有合法自动目标；此技能可能需要手动选格'};return startSkill(g,id,{...aim,slot:input.slot});}return startSkill(g,id,{...input,skill:c.skill});}
export function requestMovement(g:Arena,id:string,at:Hex){return startSkill(g,id,{skill:'move',at});}
export function startSkill(g:Arena,id:string,intent:Intent):{ok:boolean;reason?:string}{
 const fail=(reason:string)=>({ok:false,reason}),p=g.players.find(p=>p.id===id);if(g.phase!=='playing'||!p?.position)return fail('比赛结束或角色正在复活');
 if(!intent||!Object.hasOwn(SKILLS,intent.skill))return fail('未知技能');if(p.action)return fail('当前技能仍在前摇');if(p.stunnedUntil>g.now)return fail('正在击晕中');if(p.forced)return fail('正在强制位移');
 const skill:Skill=SKILLS[intent.skill];if(skill.motion&&(p.movement||p.carriedBy))return fail('已有主动位移，不能开始第二个位移');
 const slot=intent.slot??p.hand.findIndex(c=>c.skill===intent.skill);if(intent.skill!=='move'&&(!Number.isInteger(slot)||slot<0||slot>3||p.hand[slot]?.skill!==intent.skill))return fail('此卡牌不在当前手牌中');if(p.energy+1e-9<skill.energyCost)return fail('能量不足');
 if(skill.targetType==='player'&&!g.players.some(t=>t.id===intent.targetId&&t.id!==id&&t.position)&&!(intent.skill!=='hook'&&g.objects.some(o=>o.id===intent.targetId)))return fail('目标不合法');
 if(skill.targetType==='cell'&&!validHex(g,intent.at))return fail('请选择有地板的目标格');
 if(intent.at&&skill.targetType==='cell'&&(distance(p.position,intent.at)>skill.range||distance(p.position,intent.at)<(intent.skill==='fireball'?0:1)))return fail('目标超出技能范围');
 if((skill.targetType==='direction'||intent.skill==='cover')&&(!Number.isInteger(intent.direction)||intent.direction!<0||intent.direction!>5))return fail('请选择六方向之一');
 if(intent.arc!==undefined&&!['low','high'].includes(intent.arc))return fail('弹道选择无效');
 if(intent.skill==='move'&&!canStep(g,p.position,intent.at!))return fail('目标有障碍或高度差超过0.5');
 if((intent.skill==='fireball'||intent.skill==='arrow')&&g.projectiles.length>=C.maxProjectiles)return fail('场上投射物已达上限');
 if((intent.skill==='cover'||intent.skill==='mine')&&g.objects.length+3>C.maxObjects)return fail('场上物体已达上限');
 const shots=intent.skill==='arrow'?arrowOptions(g,p,intent.at!):[],shot=shots[intent.arc==='high'?shots.length-1:0];if(intent.skill==='arrow'&&!shot)return fail('无法射击：不存在可行弹道');
 const a:ActiveAction={...intent,at:intent.at?{q:intent.at.q,r:intent.at.r}:undefined,seq:++g.seq,start:g.now,hitAt:g.now+skill.windup,end:g.now+skill.windup,from:{...p.position},path:[],step:0,resolved:false,shot};
 p.energy=Number((p.energy-skill.energyCost).toFixed(6));if(intent.skill!=='move'){const used=p.hand[slot];p.hand[slot]=p.queue.shift()!;p.queue.push(used);}if(intent.skill==='move')p.movement={...a,path:[a.at!],end:g.now+1000,hitAt:g.now+500};else p.action=a;g.actionsStarted++;return{ok:true};
}
function resolve(g:Arena,p:Fighter,a:ActiveAction){
 if(!p.position)return;const skill:Skill=SKILLS[a.skill];let success=false;const at=a.at;
 if(skill.effect==='hit'){
 const target=g.players.find(t=>t.id===a.targetId&&t.position),object=g.objects.find(o=>o.id===a.targetId),targetAt=target?.position||object?.at;
 if(targetAt&&distance(p.position,targetAt)===1&&Math.abs(elevation(g.map,p.position)-elevation(g.map,targetAt))<=1){visual(g,a.skill,targetAt,p.position);if(object)damageObject(g,object,skill.damage!,p.id);else if(target){const dir=DIRS.findIndex(d=>equal(add(p.position!,d),targetAt));damage(g,target,skill.damage!,p.id);if(target.position&&skill.stun)stun(g,target,skill.stun);if(target.position&&skill.push&&dir>=0)push(g,target,dir,skill.push,{source:p.id,used:new Set(),count:0});}success=true;}
 }else if(a.skill==='blink'&&at&&distance(p.position,at)<=3&&free(g,at)){visual(g,'blink',at,p.position);p.position={...at};p.motion=undefined;entered(g,p,{source:null,used:new Set(),count:0});success=true;
 }else if(a.skill==='charge'){p.movement={...a,start:g.now,end:g.now+C.chargeMs,from:{...p.position},path:[1,2,3].map(n=>add(p.position!,scale(DIRS[a.direction!],n))),step:0,carried:[]};success=true;
 }else if(a.skill==='fireball'&&g.projectiles.length<C.maxProjectiles&&at&&distance(p.position,at)<=4&&hasFloor(g.map,at)){
 const origin={...world(p.position),z:elevation(g.map,p.position)+.7},target={...world(at),z:elevation(g.map,at)},t=C.fireFlightMs/1000;g.projectiles.push({id:'fire'+a.seq,kind:'fireball',owner:p.id,start:g.now,end:g.now+C.fireFlightMs,at,from:{...p.position},origin,velocity:{x:(target.x-origin.x)/t,y:(target.y-origin.y)/t,z:(target.z-origin.z+C.gravity*t*t/2)/t}});success=true;
 }else if(a.skill==='arrow'&&g.projectiles.length<C.maxProjectiles&&a.shot&&at){g.projectiles.push({...a.shot,origin:{...world(p.position),z:elevation(g.map,p.position)+C.launchHeight},id:'arrow'+a.seq,kind:'arrow',owner:p.id,start:g.now,end:g.now+5000,at,from:{...p.position}});success=true;
 }else if(a.skill==='cover'&&at&&distance(p.position,at)<=2){const cells=[add(at,DIRS[a.direction!]),at,add(at,DIRS[(a.direction!+3)%6])];if(g.objects.length+3<=C.maxObjects&&cells.every(h=>free(g,h)&&!g.springs.some(s=>equal(s.at,h))&&!g.objects.some(o=>equal(o.at,h)))){for(const h of cells){g.objects.push({id:'wall'+(++g.seq),kind:'cover',at:h,hp:10,maxHp:10,height:1,owner:p.id,created:g.now});visual(g,'build',h);}g.obstacles=g.objects.filter(o=>o.kind!=='mine').map(o=>o.at);success=true;}
 }else if(a.skill==='mine'&&at&&distance(p.position,at)<=2&&free(g,at)&&g.objects.length<C.maxObjects&&!g.objects.some(o=>equal(o.at,at))&&!g.springs.some(s=>equal(s.at,at))){g.objects.push({id:'mine'+a.seq,kind:'mine',at,hp:10,maxHp:10,height:.1,owner:p.id,created:g.now});success=true;
 }else if(a.skill==='hook'){const t=g.players.find(t=>t.id===a.targetId&&t.position);if(t?.position&&distance(p.position,t.position)<=3&&unobstructed(g,p,t)){visual(g,'hook',t.position,p.position);damage(g,t,5,p.id);if(t.position){stun(g,t,1000);const line=hexLine(t.position,p.position).slice(0,-1);t.forced={...a,from:{...t.position},path:line,start:g.now,end:g.now+C.hookMs,step:0};}success=true;}}
 if(success)g.actionsHit++;log(g,`${p.name}的${skill.name}${success?'生效':'落空（不退款）'}`);
}
function finishCharge(g:Arena,p:Fighter,a:ActiveAction){if(p.movement===a)p.movement=null;for(const id of a.carried||[]){const t=g.players.find(t=>t.id===id&&t.position);if(t){t.carriedBy=null;push(g,t,(a.direction!+C.chargeSide)%6,1,{source:p.id,used:new Set(),count:0});}}}
function movement(g:Arena){
 // Ordinary moves resolve simultaneously, so legal swaps are atomic.
 const candidates=g.players.filter(p=>p.position&&p.movement?.skill==='move'&&p.movement.step===0&&g.now>=p.movement.hitAt).sort((a,b)=>a.movement!.seq-b.movement!.seq),accepted=new Map<string,Hex>(),taken=new Set<string>();
 for(const p of candidates){const to=p.movement!.at!;if(canStep(g,p.position!,to)&&!taken.has(key(to))){accepted.set(p.id,to);taken.add(key(to));}}
 let changed=true;while(changed){changed=false;for(const [id,to]of accepted){const other=occupant(g,to);if(other&&!accepted.has(other.id)){accepted.delete(id);changed=true;}}}
 for(const p of candidates){const to=accepted.get(p.id);if(!to){p.movement=null;log(g,`${p.name}移动受阻`);}else{p.previous=p.position;p.position={...to};p.movement!.step++;}}
 for(const p of candidates)if(accepted.has(p.id))entered(g,p,{source:null,used:new Set(),count:0});
 for(const p of g.players){const a=p.movement;if(!p.position||!a)continue;if(a.skill==='charge'&&a.step<a.path.length&&g.now>=a.start+(a.end-a.start)*(a.step+.5)/a.path.length){const to=a.path[a.step];
 if(!hasFloor(g.map,to)){die(g,p,g.now-p.lastHit<C.assistMs?p.lastAttacker:null);continue;}if(!stepHeight(g.map,p.position,to)){finishCharge(g,p,a);continue;}const wall=solid(g,to);if(wall)damageObject(g,wall,10,p.id);if(solid(g,to)){finishCharge(g,p,a);continue;}
 const first=occupant(g,to);if(first){const line:Fighter[]=[];let t:Fighter|undefined=first;while(t?.position&&!line.includes(t)){line.push(t);t=occupant(g,add(t.position,DIRS[a.direction!]));}
 for(const t of line)if(!a.carried!.includes(t.id)){a.carried!.push(t.id);t.carriedBy=p.id;damage(g,t,10,p.id);if(t.position)stun(g,t,500);}if(first.position)push(g,first,a.direction!,1,{source:p.id,used:new Set(),count:0});}
 if(occupant(g,to)){finishCharge(g,p,a);continue;}p.previous=p.position;p.position={...to};a.step++;entered(g,p,{source:null,used:new Set(),count:0});}
 if(p.movement===a&&g.now>=a.end){if(a.skill==='charge')finishCharge(g,p,a);else p.movement=null;}}
 for(const p of g.players){const a=p.forced;if(!p.position||!a)continue;while(p.forced===a&&a.step<a.path.length&&g.now>=a.start+(a.end-a.start)*(a.step+1)/a.path.length){const to=a.path[a.step];if(!free(g,to)||!canStep(g,p.position!,to)){p.forced=null;break;}p.position={...to};a.step++;entered(g,p,{source:p.lastAttacker,used:new Set(),count:0});}if(p.forced===a&&g.now>=a.end)p.forced=null;}
}
function projectiles(g:Arena){for(const shot of [...g.projectiles]){if(shot.kind==='fireball'){if(g.now>=shot.end){g.projectiles=g.projectiles.filter(s=>s.id!==shot.id);explode(g,shot.at,40,30,shot.owner);}continue;}
 const from=Math.max(0,(g.now-C.tickMs-shot.start)/1000),to=(g.now-shot.start)/1000,hit=firstCollision(shot,colliders(g,shot.owner),from,to);
 if(hit||g.now>=shot.end||positionAt(shot,to).z<-8){g.projectiles=g.projectiles.filter(s=>s.id!==shot.id);if(hit){visual(g,'arrow-hit',hit.collider.at);if(hit.collider.kind==='player'){const p=g.players.find(p=>p.id===hit.collider.id);if(p)damage(g,p,30,shot.owner);}if(hit.collider.kind==='object'){const o=g.objects.find(o=>o.id===hit.collider.id);if(o)damageObject(g,o,30,shot.owner);}}}}
}
export function buyResource(g:Arena,id:string,item:'heal'|'energy'){const p=g.players.find(p=>p.id===id);if(g.phase!=='playing'||!p?.position||!g.shop||distance(p.position,g.shop)>1||p.coins<3||p.nextBuy>g.now||!['heal','energy'].includes(item))return{ok:false,reason:'请靠近商店，需3金币，购买间隔10秒'};p.coins-=3;p.nextBuy=g.now+10000;if(item==='heal')p.hp=Math.min(CHARACTERS[p.character].hp,p.hp+25);else p.energy=Math.min(C.maxEnergy,p.energy+3);return{ok:true};}
export function stepArena(g:Arena){if(g.phase!=='playing')return;g.now+=C.tickMs;
 for(const p of g.players){if(!p.position&&p.respawnAt!==null&&g.now>=p.respawnAt){const at=g.map.floors.filter(h=>free(g,h)).sort((a,b)=>distance(a,p.spawn)-distance(b,p.spawn)||a.q-b.q||a.r-b.r)[0];if(at){p.position={q:at.q,r:at.r};p.hp=CHARACTERS[p.character].hp;p.energy=C.initialEnergy;p.respawnAt=null;p.lastAttacker=null;p.contributors={};log(g,`${p.name}复活`);}}else if(p.position)p.energy=Math.min(C.maxEnergy,Number((p.energy+C.regenPerSecond*C.tickMs/1000).toFixed(6)));p.nextEnergy=g.now+(1-(p.energy%1))*C.regenMs;}
 movement(g);
 for(const p of g.players)if(p.carriedBy&&!g.players.some(c=>c.id===p.carriedBy&&c.movement?.skill==='charge'))p.carriedBy=null;
 for(const p of g.players.filter(p=>p.action).sort((a,b)=>a.action!.seq-b.action!.seq)){const a=p.action;if(a&&g.now>=a.hitAt){p.action=null;resolve(g,p,a);}}
 projectiles(g);
 for(const o of [...g.objects])if(o.kind==='mine'&&o.created<g.now)damageObject(g,o,C.mineDecay*C.tickMs/1000,o.owner||'environment');
 g.visuals=g.visuals.filter(v=>v.end>g.now).slice(-128);
 if(g.now>=g.nextResources){const cells=g.map.floors.filter(h=>free(g,h)&&!g.springs.some(s=>equal(s.at,h))&&!g.boxes.some(b=>equal(b,h))&&!(g.shop&&equal(g.shop,h)));if(g.boxes.length<4&&cells.length)g.boxes.push(cells[Math.floor(random(g)*cells.length)]);for(const p of g.players)p.coins=Math.min(12,p.coins+1);g.nextResources+=C.resourceMs;}
 if(g.now>=g.duration){g.phase='finished';for(const p of g.players)interrupt(p);log(g,'比赛结束，击杀与助攻积分排名');}}
export function advanceArena(g:Arena,to:number){while(g.phase==='playing'&&g.now+C.tickMs<=to)stepArena(g);}
