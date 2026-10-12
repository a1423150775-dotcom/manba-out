import {it,expect} from 'vitest';
import {defaultSlots,validateSpawn} from './realtime-slots';
import {BUILTIN_MAPS} from '../realtime/maps';
it('default two human slots and unique spawn points for two to six',()=>{for(let n=2;n<=6;n++){const slots=defaultSlots(BUILTIN_MAPS[0],n);expect(slots).toHaveLength(n);for(const s of slots){expect(s.kind).toBe('human');expect(s.occupantId).toBeNull();expect(validateSpawn(BUILTIN_MAPS[0],slots,s.number,s.spawn)).toEqual(s.spawn);}}});
it('spawn validation rejects off-floor, duplicate, obstacles, springs and malformed positions',()=>{const m=BUILTIN_MAPS[0],slots=defaultSlots(m);for(const h of [{q:20,r:0},{q:.5,r:0},slots[1].spawn,m.obstacles[0],m.springs[0].at])expect(()=>validateSpawn(m,slots,1,h)).toThrow();expect(validateSpawn(m,slots,1,{q:0,r:0})).toEqual({q:0,r:0});});
it('room spawn edits do not mutate built-in map or another room',()=>{const m=BUILTIN_MAPS[0],before=JSON.stringify(m),a=defaultSlots(m),b=defaultSlots(m);a[0].spawn=validateSpawn(m,a,1,{q:0,r:0});expect(JSON.stringify(m)).toBe(before);expect(b[0].spawn).not.toEqual(a[0].spawn);});
