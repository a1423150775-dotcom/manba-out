import {expect,it} from 'vitest';
import {RT_CONFIG as C} from './config';
import {createArena,arrowOptions,autoIntent,useHandCard,advanceArena,requestMovement,colliders} from './engine';
import {trajectories,positionAt,firstCollision} from './space';
import {decideBots} from './bots';
const scene=(q=3)=>{const g=createArena([{id:'a',name:'a',color:'red',deck:Array(8).fill('arrow')},{id:'b',name:'b',color:'blue'}]);g.map.floors=[];for(let q=-8;q<=8;q++)for(let r=-8;r<=8;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=8)g.map.floors.push({q,r});g.objects=[];g.obstacles=[];g.springs=[];g.boxes=[];g.players[0].position={q:-7,r:0};g.players[1].position={q,r:0};g.players[0].energy=10;return g;};
it('A/B fixed speed and gravity calibrate horizontal calibrated and same-height 45-degree 4.05',()=>{
 const v=C.arrowSpeed,g=C.gravity;expect(v*v/g).toBeCloseTo(4.05,10);
 expect(positionAt({origin:{x:0,y:0,z:.7},velocity:{x:v,y:0,z:0}},Math.sqrt(1.4/g))).toMatchObject({x:Math.sqrt(1.4*4.05)});
 const shot={origin:{x:0,y:0,z:.7},velocity:{x:v/Math.sqrt(2),y:0,z:v/Math.sqrt(2)}};
 const end=positionAt(shot,2*shot.velocity.z/g);expect(end.x).toBeCloseTo(4.05);expect(end.z).toBeCloseTo(.7);
});
it.each([3,8])('C/D target at %i (10/15 units away) is rejected through hand interface without charge/cycle',q=>{
 const g=scene(q),p=g.players[0],hand=structuredClone(p.hand);expect(arrowOptions(g,p,g.players[1].position!)).toEqual([]);
 for(const arc of ['low','high'] as const)expect(useHandCard(g,'a',{slot:0,instanceId:p.hand[0].id,at:g.players[1].position!,arc})).toMatchObject({ok:false,reason:'目标超出弓箭射程'});
 expect(useHandCard(g,'a',{slot:0,instanceId:p.hand[0].id,auto:true})).toMatchObject({ok:false,reason:'射程内没有可命中目标'});expect(p.energy).toBe(10);expect(p.hand).toEqual(hand);expect(g.actionsStarted).toBe(0);
});
it('E physical obstruction rejects both arcs for auto targeting; low obstruction permits high arc',()=>{
 const g=scene(-4),p=g.players[0];g.objects.push({id:'stone',kind:'stone',at:{q:-5,r:0},height:1,hp:100,maxHp:100,owner:null,created:0});
 const shots=arrowOptions(g,p,g.players[1].position!);expect(firstCollision(shots[0],colliders(g,'a'),0,3)?.collider.id).toBe('stone');expect(autoIntent(g,p,'arrow')?.arc).toBe('high');
 g.objects[0].height=10;expect(autoIntent(g,p,'arrow')).toBeNull();
});
it('F/G height changes physical reach, never changes velocity magnitude',()=>{
 const origin={x:0,y:0,z:1.7},target={x:4.5,y:0,z:.7};expect(trajectories(origin,target)).toHaveLength(2);
 expect(trajectories({x:0,y:0,z:.7},{x:9,y:0,z:2.7})).toHaveLength(0);
 for(const d of [1,3,4,4.5])for(const shot of trajectories(origin,{...target,x:d}))expect(Math.hypot(...Object.values(shot.velocity))).toBeCloseTo(C.arrowSpeed,10);
});
it('H target moves out during flight; another body can intercept; no target-id damage',()=>{
 const g=scene(-3),p=g.players[0],target=g.players[1];expect(useHandCard(g,'a',{slot:0,instanceId:p.hand[0].id,at:target.position!,arc:'high'}).ok).toBe(true);advanceArena(g,700);expect(g.projectiles).toHaveLength(1);const shot=structuredClone(g.projectiles[0]);expect(shot.origin.z).toBe(.7);
 expect(requestMovement(g,'b',{q:-4,r:1}).ok).toBe(true);advanceArena(g,3000);expect(target.hp).toBe(100);expect(g.projectiles).toHaveLength(0);
 const h=scene(-3),a=h.players[0];useHandCard(h,'a',{slot:0,instanceId:a.hand[0].id,at:{q:-4,r:0},arc:'low'});advanceArena(h,700);h.players[1].position={q:-4,r:1};h.players.push({...structuredClone(h.players[1]),id:'interceptor',position:{q:-5,r:0}});advanceArena(h,2000);expect(h.players[1].hp).toBe(100);expect(h.players[2].hp).toBe(80);
});
it('I attack-only Bot cannot bypass range using internal APIs',()=>{
 const g=scene(8),p=g.players[0];p.bot='hard';p.botMode='attack';for(let i=0;i<20;i++){p.nextThink=0;decideBots(g);advanceArena(g,g.now+50);}expect(g.actionsStarted).toBe(0);expect(g.projectiles).toHaveLength(0);expect(g.players[1].hp).toBe(100);
});
it('launch remains fixed-speed and ground-centered after movement; no speed is fitted to flight time',()=>{
 const g=scene(-3),p=g.players[0];requestMovement(g,'a',{q:-6,r:0});useHandCard(g,'a',{slot:0,instanceId:p.hand[0].id,at:{q:-4,r:0},arc:'low'});advanceArena(g,700);const s=g.projectiles[0];expect(s.origin.x).toBe(-6);expect(s.origin.z).toBe(.7);expect(Math.hypot(...Object.values(s.velocity))).toBeCloseTo(C.arrowSpeed);
});
it('blocked nearest player is skipped in favor of a farther hittable player',()=>{
 const g=scene(-3),p=g.players[0];g.objects.push({id:'stone',kind:'stone',at:{q:-5,r:0},height:10,hp:100,maxHp:100,owner:null,created:0});g.players.push({...structuredClone(g.players[1]),id:'c',position:{q:-7,r:4}});expect(autoIntent(g,p,'arrow')?.at).toEqual({q:-7,r:4});
});
it('default-map center to radius-six edge is rejected by new physical calibration',()=>{
 const g=scene(6),p=g.players[0];p.position={q:0,r:0};expect(arrowOptions(g,p,{q:6,r:0})).toHaveLength(0);expect(autoIntent(g,p,'arrow')).toBeNull();expect(trajectories({x:0,y:0,z:.7},{x:10,y:0,z:.7})).toHaveLength(0);
});

it.each([1,2,3,4,5,6,8,10])('new fixed calibration: %i centers, hand validation and real damage',d=>{const g=scene(-7+d),p=g.players[0],target=g.players[1],before=p.energy,hand=structuredClone(p.hand);const result=useHandCard(g,p.id,{slot:0,instanceId:p.hand[0].id,at:target.position!,arc:'low'});expect(result.ok).toBe(d<=4);if(d<=4){advanceArena(g,3000);expect(target.hp).toBe(80);}else{expect(p.energy).toBe(before);expect(p.hand).toEqual(hand);expect(g.projectiles).toHaveLength(0);}});
