import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer } from './game';

function setup(count = 3) {
  const game = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' })), 77, 100);
  const caster = currentPlayer(game);
  caster.position = { q: 0, r: 0 };
  game.traps = []; game.boxes = []; game.shop = null;
  const others = game.players.filter(p => p.id !== caster.id);
  others.forEach(p => p.hand = []);
  return { game, caster, others };
}
describe('稀有与传奇卡基础结算', () => {
  it('交换位置原子提交，公共池不动', () => {
    const { game, caster, others } = setup(2);
    others[0].position = { q: 2, r: 0 };
    caster.hand = [{ id: 'swap', instanceId: 's' }];
    const market = structuredClone(game.market);
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 's', targetId: others[0].id });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.players.find(p => p.id === caster.id)?.position).toEqual({ q: 2, r: 0 });
    expect(result.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 0, r: 0 });
    expect(result.state.market).toEqual(market);
  });
  it('目标护盾取消成对交换', () => {
    const { game, caster, others } = setup(2);
    others[0].position = { q: 2, r: 0 };
    others[0].hand = [{ id: 'shield', instanceId: 'guard' }];
    caster.hand = [{ id: 'swap', instanceId: 's' }];
    const cast = applyAction(game, caster.id, { type: 'play', cardInstanceId: 's', targetId: others[0].id });
    expect(cast.ok).toBe(true); if (!cast.ok) return;
    const guarded = applyAction(cast.state, others[0].id, { type: 'react', choice: 'shield', cardInstanceId: 'guard' });
    expect(guarded.ok).toBe(true); if (!guarded.ok) return;
    expect(guarded.state.players.find(p => p.id === caster.id)?.position).toEqual({ q: 0, r: 0 });
    expect(guarded.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 2, r: 0 });
  });
  it('磁铁只把2格内目标拉近，邻接目标不进入施法者格', () => {
    const { game, caster, others } = setup();
    others[0].position = { q: 2, r: 0 };
    others[1].position = { q: -1, r: 0 };
    caster.hand = [{ id: 'magnet', instanceId: 'm' }];
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'm' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 1, r: 0 });
    expect(result.state.players.find(p => p.id === others[1].id)?.position).toEqual({ q: -1, r: 0 });
  });
  it('快递在防御结算之后才消耗自己的随机流', () => {
    const { game, caster, others } = setup(2);
    others[0].position = { q: 1, r: 0 };
    others[0].hand = [{ id: 'shield', instanceId: 'guard' }];
    caster.hand = [{ id: 'friend_delivery', instanceId: 'd' }];
    const before = game.random.delivery;
    const cast = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'd', targetId: others[0].id });
    expect(cast.ok).toBe(true); if (!cast.ok) return;
    expect(cast.state.random.delivery).toBe(before);
    const guarded = applyAction(cast.state, others[0].id, { type: 'react', choice: 'shield', cardInstanceId: 'guard' });
    expect(guarded.ok).toBe(true); if (!guarded.ok) return;
    expect(guarded.state.random.delivery).toBe(before);
  });
  it('传送和地震均按轴坐标结算', () => {
    const first = setup(2);
    first.caster.hand = [{ id: 'teleport', instanceId: 't' }];
    const teleported = applyAction(first.game, first.caster.id, { type: 'play', cardInstanceId: 't', at: { q: 1, r: -1 } });
    expect(teleported.ok).toBe(true); if (!teleported.ok) return;
    expect(teleported.state.players.find(p => p.id === first.caster.id)?.position).toEqual({ q: 1, r: -1 });
    const second = setup(2);
    second.others[0].position = { q: 1, r: 0 };
    second.caster.hand = [{ id: 'quake', instanceId: 'q' }];
    const quake = applyAction(second.game, second.caster.id, { type: 'play', cardInstanceId: 'q', at: { q: 0, r: 0 } });
    expect(quake.ok).toBe(true); if (!quake.ok) return;
    expect(quake.state.players.find(p => p.id === second.others[0].id)?.position).toEqual({ q: 3, r: 0 });
  });
});
