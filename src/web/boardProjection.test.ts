import {it,expect} from 'vitest';
import {boardProjection} from './boardProjection';
import {DIRS,add} from '../core/hex';
import {BUILTIN_MAPS,validateMap} from '../realtime/maps';
import {createArena,requestMovement,advanceArena,push} from '../realtime/v20/engine';
it('height is validated visual metadata, optional and JSON stable',()=>{
 const m=structuredClone(BUILTIN_MAPS[0]);m.floors[0].height=2;
 expect(validateMap(JSON.parse(JSON.stringify(m)))).toEqual(m);
 for(const height of [-1,5,NaN,Infinity,'2'])expect(()=>validateMap({...m,floors:[{...m.floors[0],height},...m.floors.slice(1)]})).toThrow();
});
it('2D ignores height; oblique tops rise and have three visible sides',()=>{
 const h={q:0,r:0,height:2};expect(boardProjection('2d',[h]).point(h)).toEqual(boardProjection('2d',[]).point(h));
 const p=boardProjection('2.5d',[h]);expect(p.point(h).y).toBe(296);expect(p.sides(h)).toHaveLength(3);
 expect(p.polygon(h).split(' ')).toHaveLength(6);
});
for(const style of ['2d','2.5d'] as const)for(let d=0;d<6;d++)it(`${style}: direction ${d} projects consistently with spring arrow and push`,()=>{
 const p=boardProjection(style,[]),from=p.point({q:0,r:0}),to=p.point(DIRS[d]),angle=(p.directionAngle(d)-90)*Math.PI/180;
 expect(Math.atan2(to.y-from.y,to.x-from.x)).toBeCloseTo(angle);
 const g=createArena([{id:'a',name:'a',color:'red'},{id:'b',name:'b',color:'blue'}]);g.springs=[];g.players[0].position={q:0,r:0};g.players[1].position=DIRS[d];push(g,g.players[1],d,1);
 expect(g.players[1].position).toEqual(add(DIRS[d],DIRS[d]));
});
it('height does not change movement midpoint, energy or hand cycle',()=>{
 const map=structuredClone(BUILTIN_MAPS[0]);map.floors.forEach((h,i)=>h.height=i%5);
 const players=[{id:'a',name:'a',color:'red'},{id:'b',name:'b',color:'blue'}];
 const games=[createArena(players),createArena(players,1,'test',300000,map)];
 for(const g of games){expect(requestMovement(g,'a',{q:4,r:-1}).ok).toBe(true);advanceArena(g,499);expect(g.players[0].position).toEqual({q:4,r:0});advanceArena(g,500);expect(g.players[0].position).toEqual({q:4,r:-1});}
 expect(games[0].players).toEqual(games[1].players);
});
