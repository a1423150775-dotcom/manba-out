import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer } from './game';

const seats = [{ id: 'a', name: '甲', color: '#fff' }, { id: 'b', name: '乙', color: '#000' }];
function make(id: 'rocket_boots' | 'ice' | 'barricade' | 'dismantle' | 'supply_dash') {
  const game = createGame(seats, 1234, 100);
  const caster = currentPlayer(game);
  caster.position = { q: 0, r: 0 };
  caster.hand = [{ id, instanceId: 'test-card' }];
  game.traps = [];
  game.boxes = [];
  game.shop = null;
  return { game, caster, other: game.players.find(p => p.id !== caster.id)! };
}
describe('新增普通卡', () => {
  it('火箭鞋途中遇玩家停止，不推动玩家', () => {
    const { game, caster, other } = make('rocket_boots');
    other.position = { q: 2, r: 0 };
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'test-card', direction: 0, length: 4 });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.players.find(p => p.id === caster.id)?.position).toEqual({ q: 1, r: 0 });
    expect(result.state.players.find(p => p.id === other.id)?.position).toEqual({ q: 2, r: 0 });
  });
  it('补给冲刺只增加普通移动专用AP', () => {
    const { game, caster } = make('supply_dash');
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'test-card' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.ap).toBe(3);
    expect(result.state.moveAp).toBe(2);
    const moved = applyAction(result.state, caster.id, { type: 'move', direction: 0 });
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.state.moveAp).toBe(1);
    expect(moved.state.ap).toBe(3);
  });
  it('冰面只在进入时触发，下次个人回合AP减1', () => {
    const { game, caster, other } = make('ice');
    other.position = { q: 2, r: 0 };
    const placed = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'test-card', at: { q: 1, r: 0 } });
    expect(placed.ok).toBe(true); if (!placed.ok) return;
    const ended = applyAction(placed.state, caster.id, { type: 'end' });
    expect(ended.ok).toBe(true); if (!ended.ok) return;
    const moved = applyAction(ended.state, other.id, { type: 'move', direction: 3 });
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.state.players.find(p => p.id === other.id)?.iceNext).toBe(true);
    let next = moved.state;
    while (!(currentPlayer(next).id === other.id && next.round > 1)) {
      const r = applyAction(next, currentPlayer(next).id, { type: 'end' });
      expect(r.ok).toBe(true); if (!r.ok) return; next = r.state;
    }
    expect(next.ap).toBe(2);
  });
  it('路障阻挡移动，拆迁队移除临时路障', () => {
    const { game, caster } = make('barricade');
    const placed = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'test-card', at: { q: 1, r: 0 } });
    expect(placed.ok).toBe(true); if (!placed.ok) return;
    expect(placed.state.obstacles).toHaveLength(1);
    expect(applyAction(placed.state, caster.id, { type: 'move', direction: 0 }).ok).toBe(false);
    const toDismantle = structuredClone(placed.state);
    toDismantle.cardAction = 'none';
    toDismantle.players.find(p => p.id === caster.id)!.hand = [{ id: 'dismantle', instanceId: 'remove' }];
    const removed = applyAction(toDismantle, caster.id, { type: 'play', cardInstanceId: 'remove', at: { q: 1, r: 0 } });
    expect(removed.ok).toBe(true); if (!removed.ok) return;
    expect(removed.state.obstacles).toHaveLength(0);
  });
});
