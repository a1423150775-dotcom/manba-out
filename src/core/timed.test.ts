import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer } from './game';

const seats = [{ id: 'a', name: '甲', color: '#fff' }, { id: 'b', name: '乙', color: '#000' }];
function setup(kind: 'time_bomb' | 'gravity_well') {
  const game = createGame(seats, 105, 100);
  const caster = currentPlayer(game);
  const other = game.players.find(p => p.id !== caster.id)!;
  caster.position = { q: 2, r: 0 };
  other.position = { q: -1, r: 0 };
  caster.hand = [{ id: kind, instanceId: 'device' }];
  other.hand = [];
  game.traps = []; game.boxes = []; game.shop = null;
  return { game, caster, other };
}
function nextRound(game: ReturnType<typeof setup>['game']) {
  let next = game;
  for (let i = 0; i < 2; i++) {
    const result = applyAction(next, currentPlayer(next).id, { type: 'end' });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.reason);
    next = result.state;
  }
  return next;
}
describe('定时机关', () => {
  it('定时炸弹下轮开始触发，可进入反应窗口并由目标护盾防御', () => {
    const { game, caster, other } = setup('time_bomb');
    other.position = { q: 0, r: 0 };
    other.hand = [{ id: 'shield', instanceId: 'guard' }];
    const placed = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'device', at: { q: 1, r: 0 } });
    expect(placed.ok).toBe(true); if (!placed.ok) return;
    expect(placed.state.timed).toHaveLength(1);
    const started = nextRound(placed.state);
    expect(started.round).toBe(2);
    expect(started.pending?.cardId).toBe('time_bomb');
    const guarded = applyAction(started, other.id, { type: 'react', choice: 'shield', cardInstanceId: 'guard' });
    expect(guarded.ok).toBe(true); if (!guarded.ok) return;
    expect(guarded.state.pending).toBeNull();
    expect(guarded.state.players.find(p => p.id === other.id)?.position).toEqual({ q: 0, r: 0 });
    expect(guarded.state.timed).toHaveLength(0);
  });
  it('引力井下一轮将2格内目标拉近1格', () => {
    const { game, caster, other } = setup('gravity_well');
    const placed = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'device', at: { q: 0, r: 0 } });
    expect(placed.ok).toBe(true); if (!placed.ok) return;
    const started = nextRound(placed.state);
    expect(started.pending).toBeNull();
    expect(started.players.find(p => p.id === other.id)?.position).toEqual({ q: 0, r: 0 });
  });
});
