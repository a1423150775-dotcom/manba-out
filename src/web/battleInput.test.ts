import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {BATTLE_INPUT,MapClickIntent,SelectionExpiry} from './battleInput';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());
it('single click waits 260ms and submits exactly one step',()=>{
 const c=new MapClickIntent(),one=vi.fn(),two=vi.fn();c.tap('3,0',one,two);
 vi.advanceTimersByTime(259);expect(one).not.toHaveBeenCalled();vi.advanceTimersByTime(1);
 expect(one).toHaveBeenCalledTimes(1);expect(two).not.toHaveBeenCalled();
});
it('same-cell double tap sends only navigation, never a single step',()=>{
 const c=new MapClickIntent(),one=vi.fn(),two=vi.fn();c.tap('3,0',one,two);vi.advanceTimersByTime(150);c.tap('3,0',one,two);vi.advanceTimersByTime(1000);
 expect(one).not.toHaveBeenCalled();expect(two).toHaveBeenCalledTimes(1);
});
it('new cell replaces pending click; cancellation/selection/pinch can discard it',()=>{
 const c=new MapClickIntent(),one=vi.fn(),other=vi.fn();c.tap('1,0',one,vi.fn());c.tap('2,0',other,vi.fn());vi.advanceTimersByTime(260);expect(one).not.toHaveBeenCalled();expect(other).toHaveBeenCalledTimes(1);
 c.tap('3,0',one,vi.fn());c.cancel();vi.advanceTimersByTime(1000);expect(one).not.toHaveBeenCalled();
});
it('selection expires after precisely 5 seconds, explicit aim renews it',()=>{
 expect(BATTLE_INPUT.selectionTimeoutMs).toBe(5000);const t=new SelectionExpiry(),expire=vi.fn();t.touch(expire);vi.advanceTimersByTime(4999);expect(expire).not.toHaveBeenCalled();t.touch(expire);vi.advanceTimersByTime(4999);expect(expire).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(expire).toHaveBeenCalledTimes(1);
});
it('cancel/unmount removes selection timer without firing timeout',()=>{
 const t=new SelectionExpiry(),expire=vi.fn();t.touch(expire);t.cancel();vi.advanceTimersByTime(6000);expect(expire).not.toHaveBeenCalled();
});
