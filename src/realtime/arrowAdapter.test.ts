import {MODE_CONFIG as M} from './modes';
import {it,expect} from 'vitest';
import {CHARACTERS,RT_CONFIG as C,characterArrowSpeed} from './config';
import {createArena,arrowOptions,advanceArena} from './engine';
import {BUILTIN_MAPS} from './maps';
import {trajectories} from './space';
it('speed adapter changes only configured character and remains finite; buildings do not inherit it',()=>{const c=CHARACTERS.mouse as typeof CHARACTERS.mouse & {arrowSpeedScale?:number};c.arrowSpeedScale=1.1;try{const g=createArena([{id:'a',name:'a',color:'red',character:'mouse'},{id:'b',name:'b',color:'blue'}]);g.players[0].position={q:0,r:0};g.players[1].position={q:3,r:0};g.objects=[];const shots=arrowOptions(g,g.players[0],{q:4,r:0});expect(Math.hypot(...Object.values(shots[0].velocity))).toBeCloseTo(C.arrowSpeed*1.1);expect(characterArrowSpeed('laoda')).toBe(C.arrowSpeed);expect(trajectories({x:0,y:0,z:.7},{x:10,y:0,z:.7},characterArrowSpeed('mouse'))).toHaveLength(0);g.mode='moba';g.players[1].team='red';g.objects=[{id:'tower',team:'blue',kind:'tower',at:{q:0,r:1},height:1,hp:250,maxHp:250,owner:null,created:0}];advanceArena(g,350);expect(Math.hypot(...Object.values(g.projectiles[0].velocity))).toBeCloseTo(M.towerArrowSpeed);}finally{delete c.arrowSpeedScale;}});
it('height2 expands physical reach downwards and restricts upwards',()=>{expect(trajectories({x:0,y:0,z:2.7},{x:5,y:0,z:.7})).toHaveLength(2);expect(trajectories({x:0,y:0,z:.7},{x:5,y:0,z:2.7})).toHaveLength(0);});
