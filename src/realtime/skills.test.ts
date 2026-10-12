import { expect,it } from 'vitest';
import { createArena,startSkill,advanceArena,stepArena,stun } from './engine';
import { decideBots } from './bots';
import { DEFAULT_DECK } from './config';
function game(){const g=createArena([{id:'a',name:'a',color:'red'},{id:'b',name:'b',color:'blue',character:'tank'}]);g.springs=[];g.boxes=[];g.players[0].position={q:0,r:0};g.players[1].position={q:1,r:0};g.players.forEach(p=>p.energy=10);return g;}
it('tank resist, laoda boosted elbow, no generic protection',()=>{const g=game();startSkill(g,'a',{skill:'elbow',targetId:'b'});advanceArena(g,300);expect(g.players[1].hp).toBe(120);expect(g.players[1].position).toEqual({q:2,r:0});});
it('dash/heal/heavy/blink/area/spring have real effects',()=>{
 const g=game(),p=g.players[0];p.deck=['blink','area','spring','heal','dash','heavy','move','elbow'];p.hand=p.deck.slice(0,4).map((skill,i)=>({id:'test'+i,skill}));p.queue=p.deck.slice(4).map((skill,i)=>({id:'queue'+i,skill}));g.players[1].position={q:1,r:0};
 startSkill(g,'a',{skill:'area'});advanceArena(g,700);expect(g.players[1].hp).toBe(130);
 p.energy=10;startSkill(g,'a',{skill:'blink',at:{q:0,r:2}});advanceArena(g,1200);expect(p.position).toEqual({q:0,r:2});
 p.energy=10;startSkill(g,'a',{skill:'spring',at:{q:1,r:2},direction:0});advanceArena(g,1800);expect(g.springs).toHaveLength(1);
 p.hp=50;p.energy=10;startSkill(g,'a',{skill:'heal'});advanceArena(g,2800);expect(p.hp).toBe(75);
 p.deck=[...DEFAULT_DECK];p.energy=10;startSkill(g,'a',{skill:'dash',direction:3});advanceArena(g,3400);expect(p.position).toEqual({q:-2,r:2});
 p.energy=10;g.players[1].position={q:-1,r:2};startSkill(g,'a',{skill:'heavy',targetId:'b'});advanceArena(g,4200);expect(g.players[1].hp).toBe(100);
});
it('same-destination conflict has one winner; blocked movement consumes energy',()=>{const g=game();startSkill(g,'a',{skill:'move',at:{q:0,r:1}});startSkill(g,'b',{skill:'move',at:{q:0,r:1}});advanceArena(g,650);expect(g.players[0].position).toEqual({q:0,r:1});expect(g.players[1].position).toEqual({q:1,r:0});expect(g.players[1].energy).toBe(9);});
it('bot movement respects stun and resources, deterministic seeded battle',()=>{const run=()=>{const g=createArena(Array.from({length:6},(_,i)=>({id:String(i),name:String(i),color:'red',bot: i%2?'hard' as const:'normal' as const})),42);for(let n=0;n<1200;n++){stepArena(g);decideBots(g);}return g;};const g=run();expect(g).toEqual(run());expect(g.actionsStarted).toBeGreaterThan(50);expect(g.actionsHit).toBeGreaterThan(10);for(const p of g.players){expect(p.energy).toBeGreaterThanOrEqual(0);expect(p.energy).toBeLessThanOrEqual(10);}const p=g.players[0];if(p.position){stun(g,p,1000);decideBots(g);expect(p.action).toBeNull();}});
