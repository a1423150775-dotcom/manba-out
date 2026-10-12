import { DIRS, add, distance, equal, key, scale, type Hex } from '../../core/hex';
import {BUILTIN_MAPS,validateMap,hasFloor,type ArenaMap} from './maps';
import { createGame } from '../../core/game';
import { nextRandom } from '../../core/random';
import { CHARACTERS, DEFAULT_DECK, RT_CONFIG as C, SKILLS, validDeck, migrateDeck, type CharacterId, type Skill, type SkillId } from './config';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type BotMode = 'normal' | 'move' | 'attack' | 'idle';
export type Intent = { skill: SkillId; slot?: number; targetId?: string; at?: Hex; direction?: number };
export type ActiveAction = Intent & { seq: number; start: number; hitAt: number; end: number; from: Hex; path: Hex[]; step: number; resolved: boolean };
export type CardInstance = { id: string; skill: SkillId };
export type Fighter = { id: string; name: string; color: string; character: CharacterId; deck: SkillId[]; hand: CardInstance[]; queue: CardInstance[]; bot?: Difficulty; botMode: BotMode; position: Hex | null; motion?: { at:number; path:Hex[] }; spawn: Hex; hp: number; energy: number; nextEnergy: number; stunnedUntil: number; respawnAt: number | null; action: ActiveAction | null; score: number; kills: number; deaths: number; coins: number; nextThink: number; previous: Hex | null; lastAttacker: string | null; lastHit: number; nextBuy: number };
export type Setup = Pick<Fighter, 'id' | 'name' | 'color'> & Partial<Pick<Fighter, 'character' | 'deck' | 'bot'>>;
export type Arena = { map:ArenaMap; matchId: string; now: number; seed: number; rng: number; seq: number; phase: 'playing' | 'finished'; players: Fighter[]; springs: { id: string; at: Hex; direction: number; owner: string | null; expires: number | null }[]; obstacles: Hex[]; boxes: Hex[]; shop: Hex | null; nextResources: number; nextScore: number; duration: number; pausedBots: boolean; events: { id: number; at: number; text: string }[]; eventId: number; actionsStarted: number; actionsHit: number; kills: number };
const validHex = (g:Arena,h: unknown): h is Hex => !!h && Number.isInteger((h as Hex).q) && Number.isInteger((h as Hex).r) && hasFloor(g.map,h as Hex);
export function random(g: Arena) { const r = nextRandom(g.rng); g.rng = r.seed; return r.value; }
export function log(g: Arena, text: string) { g.events.push({ id: ++g.eventId, at: g.now, text }); if (g.events.length > 80) g.events.shift(); }
export function occupant(g: Arena, at: Hex) { return g.players.find(p => p.position && equal(p.position, at)); }
export function free(g: Arena, at: Hex) { return hasFloor(g.map,at) && !occupant(g, at) && !g.obstacles.some(h => equal(h, at)); }
export function addFighter(g: Arena, s: Setup) {
  if (g.players.length >= 6 || g.players.some(p => p.id === s.id)) throw new Error('位置已满或身份重复');
  s={...s,deck:migrateDeck(s.deck || DEFAULT_DECK)||s.deck};
  const character = s.character || 'laoda';
  if (!Object.hasOwn(CHARACTERS, character) || !validDeck(s.deck || DEFAULT_DECK)) throw new Error('角色或卡组无效');
  const spawn = g.map.spawns.map(s=>s.at).find(h => free(g, h));
  if (!spawn) throw new Error('无出生位置');
  const p: Fighter = { ...s, character, deck: [...(s.deck || DEFAULT_DECK)], hand: (s.deck || DEFAULT_DECK).slice(0,4).map((skill,i)=>({id:`${s.id}:${i}`,skill})), queue: (s.deck || DEFAULT_DECK).slice(4).map((skill,i)=>({id:`${s.id}:${i+4}`,skill})), botMode: 'normal', spawn, position: spawn, hp: CHARACTERS[character].hp, energy: C.initialEnergy, nextEnergy: g.now + C.regenMs, stunnedUntil: 0, respawnAt: null, action: null, score: 0, kills: 0, deaths: 0, coins: 3, nextThink: g.now + 400, previous: null, lastAttacker: null, lastHit: 0, nextBuy: 0 };
  g.players.push(p); return p;
}
export function createArena(inputs: Setup[], seed = 1, matchId = 'test', duration = C.matchMs,definition:ArenaMap=BUILTIN_MAPS[0]): Arena {
  if (inputs.length < 1 || inputs.length > 6) throw new Error('需要1～6名参赛者');
  const definitionCopy=validateMap(definition,inputs.length);
  // Only copy the existing map layout/resources; no Legacy turn state enters this engine.
  const map = createGame([{ id:'a',name:'a',color:'#fff' },{ id:'b',name:'b',color:'#fff' }], seed, 0);
  const g: Arena = { map:definitionCopy, matchId, now:0, seed, rng:seed || 1, seq:0, phase:'playing', players:[], springs:definitionCopy.springs.map((t,i)=>({id:`spring${i}`,at:t.at,direction:t.direction,owner:null,expires:null})), obstacles:definitionCopy.obstacles, boxes:map.boxes.map(b=>b.at).filter(h=>hasFloor(definitionCopy,h)&&!definitionCopy.obstacles.some(o=>equal(o,h))&&!definitionCopy.springs.some(t=>equal(t.at,h))), shop:map.shop&&hasFloor(definitionCopy,map.shop.at)&&!definitionCopy.obstacles.some(o=>equal(o,map.shop!.at))&&!definitionCopy.springs.some(t=>equal(t.at,map.shop!.at))?map.shop.at:null, nextResources:C.resourceMs, nextScore:C.scoreMs, duration, pausedBots:false, events:[], eventId:0, actionsStarted:0, actionsHit:0, kills:0 };
  inputs.forEach(p=>addFighter(g,p));
  const resourceCells=()=>g.map.floors.filter(h=>free(g,h)&&!g.springs.some(t=>equal(t.at,h))&&!g.boxes.some(at=>equal(at,h))&&!(g.shop&&equal(g.shop,h)));
  if(!g.shop){const cells=resourceCells();if(cells.length)g.shop=cells[Math.floor(random(g)*cells.length)];}
  if(!g.boxes.length){const cells=resourceCells();if(cells.length)g.boxes.push(cells[Math.floor(random(g)*cells.length)]);}
  return g;
}
export function requestMovement(g:Arena,id:string,at:Hex){return startSkill(g,id,{skill:'move',at});}
export type HandRequest = { slot:number; instanceId:string; targetId?:string; at?:Hex; direction?:number };
// Shared entry point for humans and Bots: a slot never authorizes a stale card instance.
export function useHandCard(g:Arena,id:string,input:HandRequest){
 const p=g.players.find(p=>p.id===id);
 if(!p||!input||!Number.isInteger(input.slot)||input.slot<0||input.slot>3)return {ok:false,reason:'请选择当前四张手牌中的卡槽'};
 const card=p.hand[input.slot];
 if(!card||card.id!==input.instanceId)return {ok:false,reason:'当前卡牌已变化，请重新选择'};
 return startSkill(g,id,{skill:card.skill,slot:input.slot,targetId:input.targetId,at:input.at,direction:input.direction});
}
export function startSkill(g: Arena, id: string, intent: Intent): { ok: boolean; reason?: string } {
  const fail = (reason:string) => ({ok:false,reason});
  const p = g.players.find(p=>p.id===id);
  if (g.phase !== 'playing' || !p?.position) return fail('比赛结束或角色正在复活');
  if (p.action) return fail('当前动作尚未完成');
  if (p.stunnedUntil > g.now) return fail('正在击晕中');
  const slot = intent?.slot ?? p.hand.findIndex(c=>c.skill===intent?.skill);
  if (intent?.skill !== 'move' && (!Number.isInteger(slot) || slot<0 || slot>3 || !p.hand[slot] || p.hand[slot].skill!==intent?.skill)) return fail('此卡牌不在当前手牌中');
  const skill: Skill = SKILLS[intent.skill];
  if (p.energy < skill.energyCost) return fail('能量不足');
  if (skill.targetType === 'player' && (!g.players.some(t=>t.id===intent.targetId) || intent.targetId===p.id)) return fail('请选择其他玩家');
  if (skill.targetType === 'cell' && !validHex(g,intent.at)) return fail('请选择地图内合法格子');
  if ((skill.targetType === 'direction' || intent.skill === 'spring') && (!Number.isInteger(intent.direction) || intent.direction! < 0 || intent.direction! > 5)) return fail('方向无效');
  if (intent.skill === 'move' && distance(p.position,intent.at!) !== 1) return fail('移动必须选择相邻格');
  const factor = skill.effect === 'move' ? CHARACTERS[p.character].moveScale : 1;
  const duration = (skill.windup+skill.recovery)*factor;
  const path = skill.effect !== 'move' ? [] : intent.skill === 'move' ? [intent.at!] : [1,2].map(n=>add(p.position!,scale(DIRS[intent.direction!],n)));
  p.energy -= skill.energyCost;
  if(intent.skill!=='move'){const used=p.hand[slot];p.hand[slot]=p.queue.shift()!;p.queue.push(used);}
  p.action = { skill:intent.skill, targetId:intent.targetId, at:intent.at, direction:intent.direction, seq:++g.seq, start:g.now, hitAt:g.now+skill.windup*factor, end:g.now+duration, from:{...p.position}, path, step:0, resolved:false };
  g.actionsStarted++; return {ok:true};
}
export function interrupt(p: Fighter) { p.action = null; }
export function stun(g: Arena, p: Fighter, ms: number) { if (!p.position) return; interrupt(p); p.stunnedUntil = Math.max(p.stunnedUntil,g.now+ms); }
export function die(g: Arena, p: Fighter, source: string | null) {
  if (!p.position) return;
  p.position=null; p.hp=0; p.energy=0; p.action=null; p.stunnedUntil=0; p.respawnAt=g.now+C.respawnMs; p.deaths++;
  const killer=g.players.find(q=>q.id===source && q.id!==p.id);
  if(killer){killer.kills++;killer.score+=C.killScore;g.kills++;}
  log(g,`${p.name}阵亡${killer?'，'+killer.name+'击杀 +2分':''}`);
}
export function damage(g:Arena,p:Fighter,amount:number,source:string) {
  if(!p.position)return; p.hp=Math.max(0,p.hp-amount);p.lastAttacker=source;p.lastHit=g.now;if(p.hp===0)die(g,p,source);
}
type Chain = { source: string | null; used: Set<string>; count: number };
function entered(g:Arena,p:Fighter,chain:Chain): boolean {
  if(!p.position)return false;
  const trap=g.springs.find(t=>equal(t.at,p.position!));
  if(trap && !chain.used.has(trap.id) && chain.count<C.chainLimit){chain.used.add(trap.id);chain.count++;interrupt(p);chain.source ||= trap.owner;push(g,p,trap.direction,2,chain);return true;}
  const index=g.boxes.findIndex(at=>p.position&&equal(at,p.position));
  if(index>=0){g.boxes.splice(index,1);p.hp=Math.min(CHARACTERS[p.character].hp,p.hp+20);p.energy=Math.min(C.maxEnergy,p.energy+2);p.coins++;log(g,`${p.name}拾取盲盒：生命+20、能量+2、金币+1`);}
  return false;
}
// One atomic chain step: move tail first, then apply entrance effects after all positions commit.
export function push(g:Arena,p:Fighter,direction:number,steps:number,chain:Chain={source:null,used:new Set(),count:0}) {
  for(let n=0;n<steps && p.position;n++){
    const line:Fighter[]=[];let current:Fighter|undefined=p;let blocked=false;
    while(current?.position){line.push(current);const next=add(current.position,DIRS[direction]);if(g.obstacles.some(h=>equal(h,next))){blocked=true;break;}current=hasFloor(g.map,next)?occupant(g,next):undefined;if(line.length>6){blocked=true;break;}}
    if(blocked)break;
    for(const moved of [...line].reverse()){
      interrupt(moved); const next=add(moved.position!,DIRS[direction]);
      if(moved.motion?.at!==g.now)moved.motion={at:g.now,path:[{...moved.position!}]};
      moved.motion!.path.push({...next});
      if(chain.source){moved.lastAttacker=chain.source;moved.lastHit=g.now;}
      if(!hasFloor(g.map,next))die(g,moved,chain.source || (g.now-moved.lastHit<5000?moved.lastAttacker:null));else moved.position=next;
    }
    let redirected=false;
    for(const moved of [...line].reverse()) if(entered(g,moved,chain) && moved.id===p.id) redirected=true;
    if(redirected)break;
  }
}
function hit(g:Arena,caster:Fighter,target:Fighter,skill:Skill,elbow=false,shared?:Chain) {
  if(!caster.position || !target.position)return;
  const direction=DIRS.findIndex(d=>equal(add(caster.position!,d),target.position!));
  damage(g,target,Math.round(((skill.damage||0)+(elbow?CHARACTERS[caster.character].elbowDamage:0))*CHARACTERS[caster.character].damageScale),caster.id);
  if(target.position){
    if(skill.stun)stun(g,target,skill.stun);
    const steps=Math.max(0,(skill.push||0)-CHARACTERS[target.character].resistance);
    if(steps&&direction>=0)push(g,target,direction,steps,shared||{source:caster.id,used:new Set(),count:0});
  }
}
function resolve(g:Arena,p:Fighter,a:ActiveAction) {
  const skill:Skill=SKILLS[a.skill]; let success=false;
  if(!p.position)return;
  if(skill.effect==='hit'){
    const target=g.players.find(t=>t.id===a.targetId);
    if(target?.position && distance(p.position,target.position)<=skill.range){hit(g,p,target,skill,a.skill==='elbow');success=true;}
  }else if(skill.effect==='heal'){p.hp=Math.min(CHARACTERS[p.character].hp,p.hp+(skill.heal||0));success=true;
  }else if(skill.effect==='blink' && a.at && distance(p.position,a.at)<=skill.range && free(g,a.at)){p.position=a.at;entered(g,p,{source:null,used:new Set(),count:0});success=true;
  }else if(skill.effect==='area'){
    const targets=g.players.filter(t=>t.id!==p.id && t.position && distance(t.position,p.position!)===1);
    // Adjacent ring targets cannot lie behind one another along a radial direction.
    const chain:Chain={source:p.id,used:new Set(),count:0};for(const t of targets)hit(g,p,t,skill,false,chain);success=true;
  }else if(skill.effect==='spring' && a.at && distance(p.position,a.at)===1 && free(g,a.at) && !g.springs.some(t=>equal(t.at,a.at!)) && !(g.shop&&equal(g.shop,a.at))){
    const owned=g.springs.filter(t=>t.owner===p.id);if(owned.length>=2)g.springs=g.springs.filter(t=>t.id!==owned[0].id);
    g.springs.push({id:`placed${a.seq}`,at:a.at,direction:a.direction!,owner:p.id,expires:g.now+C.springMs});success=true;
  }
  if(success)g.actionsHit++;
  log(g,`${p.name}的${skill.name}${success?'生效':'落空（能量不返还）'}`);
}
function movement(g:Arena){
  const candidates=g.players.filter(p=>p.position && p.action && p.action.path.length>p.action.step && g.now>=p.action.start+(p.action.end-p.action.start)*(p.action.step+.5)/p.action.path.length).sort((a,b)=>a.action!.seq-b.action!.seq);
  const accepted=new Map<string,Hex>(),taken=new Set<string>();
  for(const p of candidates){const to=p.action!.path[p.action!.step];if(!hasFloor(g.map,to)||g.obstacles.some(h=>equal(h,to))||taken.has(key(to)))continue;accepted.set(p.id,to);taken.add(key(to));}
  let changed=true;while(changed){changed=false;for(const [id,to]of accepted){const other=occupant(g,to);if(other&&!accepted.has(other.id)){accepted.delete(id);changed=true;}}}
  for(const p of candidates){const to=accepted.get(p.id);if(!to){interrupt(p);log(g,`${p.name}移动受阻`);}else{p.previous=p.position;p.position=to;p.action!.step++;}}
  for(const p of candidates)if(accepted.has(p.id))entered(g,p,{source:null,used:new Set(),count:0});
}
export function buyResource(g:Arena,id:string,item:'heal'|'energy'){
  const p=g.players.find(p=>p.id===id);
  if(g.phase!=='playing'||!p?.position||!g.shop||distance(p.position,g.shop)>1||p.coins<3||p.nextBuy>g.now||!['heal','energy'].includes(item))return{ok:false,reason:'请靠近商店，需3金币，购买间隔10秒'};
  p.coins-=3;p.nextBuy=g.now+10000;if(item==='heal')p.hp=Math.min(CHARACTERS[p.character].hp,p.hp+25);else p.energy=Math.min(C.maxEnergy,p.energy+3);log(g,`${p.name}购买${item==='heal'?'治疗补给':'能量补给'}`);return{ok:true};
}
export function stepArena(g:Arena){
  if(g.phase!=='playing')return;g.now+=C.tickMs;
  for(const p of g.players){
    if(!p.position && p.respawnAt!==null && g.now>=p.respawnAt){const at=g.map.floors.filter(h=>free(g,h)).sort((a,b)=>(Number(distance(a)<3)-Number(distance(b)<3))||distance(a,p.spawn)-distance(b,p.spawn)||a.q-b.q||a.r-b.r)[0];if(at){p.position=at;p.hp=CHARACTERS[p.character].hp;p.energy=C.initialEnergy;p.nextEnergy=g.now+C.regenMs;p.respawnAt=null;p.lastAttacker=null;log(g,`${p.name}复活`);}}
    if(p.position&&g.now>=p.nextEnergy){p.energy=Math.min(C.maxEnergy,p.energy+1);p.nextEnergy+=C.regenMs*CHARACTERS[p.character].regenScale;}
  }
  movement(g);
  const pending=g.players.filter(p=>p.action).sort((a,b)=>a.action!.seq-b.action!.seq);
  for(const p of pending){const a=p.action;if(!a)continue;if(!a.path.length&&!a.resolved&&g.now>=a.hitAt){a.resolved=true;resolve(g,p,a);}if(p.action===a&&g.now>=a.end)p.action=null;}
  g.springs=g.springs.filter(t=>t.expires===null||t.expires>g.now);
  if(g.now>=g.nextScore){for(const p of g.players)if(p.position){const d=distance(p.position);p.score+=d<=2?3-d:0;}g.nextScore+=C.scoreMs;}
  if(g.now>=g.nextResources){const candidates=g.map.floors.filter(h=>free(g,h)&&!g.springs.some(t=>equal(t.at,h))&&!g.boxes.some(b=>equal(b,h))&&!(g.shop&&equal(g.shop,h)));if(g.boxes.length<4&&candidates.length)g.boxes.push(candidates[Math.floor(random(g)*candidates.length)]);for(const p of g.players)p.coins=Math.min(12,p.coins+1);g.nextResources+=C.resourceMs;}
  if(g.now>=g.duration){g.phase='finished';for(const p of g.players)p.action=null;log(g,'比赛结束，按累计积分排名');}
}
export function advanceArena(g:Arena,to:number){while(g.phase==='playing'&&g.now+C.tickMs<=to)stepArena(g);}
