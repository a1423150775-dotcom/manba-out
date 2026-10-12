import {expect,it} from 'vitest';
import {createArena,advanceArena,requestMovement,damage} from './engine';
import {findPath,setNavigation} from './navigation';
const setup=()=>{const g=createArena([{id:'a',name:'a',color:'red'},{id:'b',name:'b',color:'blue'}]);g.objects=[];g.obstacles=[];g.springs=[];g.boxes=[];g.players[0].position={q:0,r:0};g.players[1].position={q:-4,r:0};g.players[0].energy=5;return g;};
const step=(g:ReturnType<typeof setup>,q:number,r=0,revision?:number)=>setNavigation(g,'a',{kind:'step',at:{q,r}},requestMovement,revision);
it.each([1,4])('single target %i moves only one step with unchanged timing/cost',q=>{
 const g=setup(),p=g.players[0];expect(step(g,q).ok).toBe(true);expect(p.energy).toBe(4);expect(p.navigation).toBeNull();expect(p.movement!.end-p.movement!.start).toBe(1000);
 advanceArena(g,450);expect(p.position).toEqual({q:0,r:0});advanceArena(g,500);expect(p.position).toEqual({q:1,r:0});advanceArena(g,1000);expect(p.moveRecoveryUntil).toBe(1200);advanceArena(g,4000);expect(p.position).toEqual({q:1,r:0});expect(g.actionsStarted).toBe(1);
});
it('far click routes around walls using the shared pathfinder',()=>{
 const g=setup(),p=g.players[0];g.objects.push({id:'wall',kind:'cover',at:{q:1,r:0},hp:10,maxHp:10,height:1,owner:'b',created:0});const first=findPath(g,p,{q:3,r:0})![0];expect(first).not.toEqual({q:1,r:0});expect(step(g,3).ok).toBe(true);expect(p.movement!.path).toEqual([first]);
});
it('self/unreachable clicks clear old tasks without cost',()=>{
 const g=setup(),p=g.players[0];setNavigation(g,'a',{kind:'follow',targetId:'b'});expect(step(g,0).ok).toBe(true);expect(p.navigation).toBeNull();expect(p.energy).toBe(5);g.map.floors=[{q:0,r:0},{q:3,r:0}];expect(step(g,3)).toMatchObject({ok:false,reason:'无法到达目标位置'});expect(p.energy).toBe(5);expect(g.actionsStarted).toBe(0);
});
it('single click during navigation cancels task and queues only one step after the in-flight step',()=>{
 const g=setup(),p=g.players[0];setNavigation(g,'a',{kind:'point',at:{q:4,r:0}});advanceArena(g,50);expect(step(g,0,3).ok).toBe(true);expect(p.navigation).toBeNull();expect(p.pendingStep).toBeTruthy();advanceArena(g,1050);expect(p.movement!.start).toBe(1050);expect(p.pendingStep).toBeNull();advanceArena(g,4000);expect(g.actionsStarted).toBe(2);expect(p.navigation).toBeNull();
});
it('latest version wins; stale point cannot resurrect follow/stop/step',()=>{
 const g=setup(),p=g.players[0];expect(setNavigation(g,'a',{kind:'point',at:{q:4,r:0}},requestMovement,10).ok).toBe(true);expect(step(g,0,2,12).ok).toBe(true);
 expect(setNavigation(g,'a',{kind:'follow',targetId:'b'},requestMovement,11).ok).toBe(false);expect(p.navigation).toBeNull();expect(p.navigationRevision).toBe(12);expect(step(g,3,0,12).ok).toBe(false);expect(g.actionsStarted).toBe(1);
});
it('double intent remains continuous, with final recovery only',()=>{
 const g=setup(),p=g.players[0];setNavigation(g,'a',{kind:'point',at:{q:3,r:0}},requestMovement,1);advanceArena(g,50);advanceArena(g,1050);expect(p.movement!.start).toBe(1050);advanceArena(g,2050);expect(p.movement!.start).toBe(2050);advanceArena(g,3050);expect(p.position).toEqual({q:3,r:0});expect(p.navigation).toBeNull();expect(p.moveRecoveryUntil).toBe(3250);expect(g.actionsStarted).toBe(3);
});
it('death discards a pending one-shot; manual collision still takes one full move',()=>{
 const g=setup(),p=g.players[0],enemy=g.players[1];enemy.position={q:1,r:0};expect(step(g,1).ok).toBe(true);advanceArena(g,500);expect(enemy.hp).toBe(95);expect(p.position).toEqual({q:0,r:0});expect(p.movement).not.toBeNull();step(g,2);damage(g,p,999,'b');expect(p.pendingStep).toBeNull();advanceArena(g,2000);expect(g.actionsStarted).toBe(1);
});
