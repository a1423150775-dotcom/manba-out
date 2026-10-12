import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer } from './game';

function scene(count = 4) {
  const game = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' })), 108, 100);
  const caster = currentPlayer(game);
  caster.position = { q: 0, r: 0 };
  game.traps = []; game.boxes = []; game.shop = null;
  const others = game.players.filter(p => p.id !== caster.id);
  others.forEach(p => p.hand = []);
  return { game, caster, others };
}
describe('群体位移卡', () => {
  it('机关遥控器改方向并记录恢复轮', () => {
    const { game, caster } = scene(2);
    game.traps.push({ id: 'fixed', kind: 'spring', at: { q: 2, r: 0 }, direction: 3, ownerId: null });
    caster.hand = [{ id: 'remote', instanceId: 'r' }];
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'r', at: { q: 2, r: 0 }, direction: 0 });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.traps[0].direction).toBe(0);
    expect(result.state.traps[0].originalDirection).toBe(3);
    expect(result.state.traps[0].restoreRound).toBe(2);
  });
  it('交换风暴只交换两名其他玩家，2人局非法', () => {
    const { game, caster, others } = scene(3);
    others[0].position = { q: 2, r: 0 }; others[1].position = { q: -2, r: 0 };
    caster.hand = [{ id: 'swap_storm', instanceId: 'ss' }];
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'ss', targetId: others[0].id, secondTargetId: others[1].id });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: -2, r: 0 });
    expect(result.state.players.find(p => p.id === others[1].id)?.position).toEqual({ q: 2, r: 0 });
    const two = scene(2);
    two.caster.hand = [{ id: 'swap_storm', instanceId: 'ss' }];
    expect(applyAction(two.game, two.caster.id, { type: 'play', cardInstanceId: 'ss', targetId: two.others[0].id, secondTargetId: 'none' }).ok).toBe(false);
  });
  it('龙卷风对环上的玩家同时旋转，不受即将腾空的位置假阻挡', () => {
    const { game, caster, others } = scene(3);
    others[0].position = { q: 1, r: 0 }; others[1].position = { q: 0, r: 1 };
    caster.hand = [{ id: 'tornado', instanceId: 'tw' }];
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'tw', at: { q: 0, r: 0 } });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 0, r: 1 });
    expect(result.state.players.find(p => p.id === others[1].id)?.position).toEqual({ q: -1, r: 1 });
  });
  it('全员集合只用初始空闲的中心七格，不覆盖原占位', () => {
    const { game, caster, others } = scene(3);
    others[0].position = { q: 3, r: 0 }; others[1].position = { q: -3, r: 0 };
    caster.hand = [{ id: 'gathering', instanceId: 'g' }];
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'g' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const a = result.state.players.find(p => p.id === others[0].id)?.position;
    const b = result.state.players.find(p => p.id === others[1].id)?.position;
    expect(a).not.toEqual(b);
    expect(a).not.toEqual({ q: 0, r: 0 });
    expect(b).not.toEqual({ q: 0, r: 0 });
  });
});
