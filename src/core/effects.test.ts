import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer, expireReactions, type GameState } from './game';
import { equal } from './hex';

function scene(count = 4) {
  const game = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' })), 31, 100);
  const caster = currentPlayer(game);
  caster.position = { q: 0, r: 0 };
  caster.hand = [{ id: 'air_cannon', instanceId: 'spell' }];
  game.traps = [];
  return { game, caster, others: game.players.filter(p => p.id !== caster.id) };
}
function cast(game: GameState, casterId: string, cardInstanceId = 'spell', direction = 0) {
  const r = applyAction(game, casterId, { type: 'play', cardInstanceId, direction }, 101);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('M2 基础卡牌与位移', () => {
  it('空气炮只直接攻击扇形目标，侧翼沿侧向，范围外不动', () => {
    const { game, caster, others } = scene();
    others[0].position = { q: 0, r: 1 };
    others[1].position = { q: 1, r: -1 };
    others[2].position = { q: -1, r: 0 };
    others.forEach(p => p.hand = []);
    const next = cast(game, caster.id);
    expect(next.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 0, r: 3 });
    expect(next.players.find(p => p.id === others[1].id)?.position).toEqual({ q: 3, r: -3 });
    expect(next.players.find(p => p.id === others[2].id)?.position).toEqual({ q: -1, r: 0 });
  });
  it('空气炮的一波位移不会因碰撞再推一次', () => {
    const { game, caster, others } = scene(3);
    others[0].position = { q: 1, r: 0 };
    others[1].position = { q: 2, r: 0 };
    others.forEach(p => p.hand = []);
    const next = cast(game, caster.id);
    expect(next.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 3, r: 0 });
    expect(next.players.find(p => p.id === others[1].id)?.position).toEqual({ q: 4, r: 0 });
  });
  it('护盾和镜子分别只影响对应目标，第三人继续受击', () => {
    const { game, caster, others } = scene();
    others[0].position = { q: 0, r: 1 };
    others[1].position = { q: 1, r: 0 };
    others[2].position = { q: 1, r: -1 };
    others[0].hand = [{ id: 'shield', instanceId: 'shield1' }];
    others[1].hand = [{ id: 'mirror', instanceId: 'mirror1' }];
    others[2].hand = [];
    let next = cast(game, caster.id);
    expect(next.pending?.eligible).toEqual([others[0].id, others[1].id]);
    const shield = applyAction(next, others[0].id, { type: 'react', choice: 'shield', cardInstanceId: 'shield1' });
    expect(shield.ok).toBe(true); if (!shield.ok) return; next = shield.state;
    const mirror = applyAction(next, others[1].id, { type: 'react', choice: 'mirror', cardInstanceId: 'mirror1' });
    expect(mirror.ok).toBe(true); if (!mirror.ok) return; next = mirror.state;
    expect(next.pending).toBeNull();
    expect(next.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 0, r: 1 });
    expect(next.players.find(p => p.id === others[1].id)?.position).toEqual({ q: 1, r: 0 });
    expect(next.players.find(p => p.id === others[2].id)?.position).toEqual({ q: 3, r: -3 });
    expect(next.players.find(p => p.id === caster.id)?.position).toEqual({ q: -1, r: 0 });
    expect(next.market).toEqual(game.market);
  });
  it('护盾持有者位于另一目标推挤链中时也不会被间接推动', () => {
    const { game, caster, others } = scene(3);
    others[0].position = { q: 1, r: 0 };
    others[1].position = { q: 2, r: 0 };
    others[0].hand = [];
    others[1].hand = [{ id: 'shield', instanceId: 'guard' }];
    const pending = cast(game, caster.id);
    const defended = applyAction(pending, others[1].id, { type: 'react', choice: 'shield', cardInstanceId: 'guard' });
    expect(defended.ok).toBe(true); if (!defended.ok) return;
    expect(defended.state.players.find(p => p.id === others[1].id)?.position).toEqual({ q: 2, r: 0 });
    expect(defended.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 1, r: 0 });
  });
  it('反应超时默认跳过；出牌之后不能抽公共牌', () => {
    const { game, caster, others } = scene(2);
    others[0].position = { q: 1, r: 0 };
    others[0].hand = [{ id: 'shield', instanceId: 's' }];
    const pending = cast(game, caster.id);
    expect(pending.pending).not.toBeNull();
    const done = expireReactions(pending);
    expect(done.pending).toBeNull();
    expect(done.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 3, r: 0 });
    expect(applyAction(done, caster.id, { type: 'draw', slot: 0, cardInstanceId: done.market.slots[0].instanceId }).ok).toBe(false);
  });
  it('拳头将边界玩家推出局，下一大轮复活并额外获得AP', () => {
    const { game, caster, others } = scene(2);
    caster.position = { q: 3, r: 0 };
    caster.hand = [{ id: 'punch', instanceId: 'fist' }];
    others[0].position = { q: 4, r: 0 }; others[0].hand = [];
    const played = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'fist', targetId: others[0].id });
    expect(played.ok).toBe(true); if (!played.ok) return;
    expect(played.state.players.find(p => p.id === others[0].id)?.position).toBeNull();
    let next = played.state;
    for (let i = 0; i < 2; i++) {
      const ended = applyAction(next, currentPlayer(next).id, { type: 'end' });
      expect(ended.ok).toBe(true); if (!ended.ok) return; next = ended.state;
    }
    const reborn = next.players.find(p => p.id === others[0].id)!;
    expect(reborn.position).not.toBeNull();
    expect(reborn.edgeGuard).toBe(true);
  });
  it('香蕉皮和固定弹簧在逐格进入时连续触发，一次性陷阱先移除', () => {
    const { game, caster, others } = scene(2);
    caster.position = { q: 1, r: -1 };
    caster.hand = [{ id: 'banana', instanceId: 'banana1' }];
    others[0].position = { q: 0, r: 0 }; others[0].hand = [];
    game.traps = [{ id: 'spring0', kind: 'spring', at: { q: 3, r: 0 }, direction: 3, ownerId: null }];
    const placed = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'banana1', at: { q: 1, r: 0 } });
    expect(placed.ok).toBe(true); if (!placed.ok) return;
    let next = placed.state;
    const end = applyAction(next, caster.id, { type: 'end' });
    expect(end.ok).toBe(true); if (!end.ok) return; next = end.state;
    const moved = applyAction(next, others[0].id, { type: 'move', direction: 0 });
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.state.traps.some(t => t.kind === 'banana')).toBe(false);
    expect(moved.state.events.some(e => e.includes('触发香蕉皮'))).toBe(true);
    expect(moved.state.events.some(e => e.includes('触发弹簧'))).toBe(true);
    expect(moved.state.players.find(p => p.id === others[0].id)?.position).not.toBeNull();
  });
  it('非法目标不消耗卡牌额度、手牌或随机流', () => {
    const { game, caster, others } = scene(2);
    caster.hand = [{ id: 'hook', instanceId: 'hook1' }];
    others[0].position = { q: 1, r: 0 };
    const before = structuredClone(game);
    const result = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'hook1', targetId: others[0].id });
    expect(result.ok).toBe(false);
    expect(game).toEqual(before);
  });
  it('钩锁只能拉取直线上2～3格首个玩家，拉至自己面前', () => {
    const { game, caster, others } = scene(3);
    caster.hand = [{ id: 'hook', instanceId: 'hook1' }];
    others[0].position = { q: 3, r: 0 }; others[1].position = { q: -3, r: 0 };
    others.forEach(p => p.hand = []);
    const pulled = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'hook1', targetId: others[0].id });
    expect(pulled.ok).toBe(true); if (!pulled.ok) return;
    expect(pulled.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 1, r: 0 });
  });
  it('弹射陷阱一次性移除并按所选方向推出3格', () => {
    const { game, caster, others } = scene(2);
    caster.position = { q: 1, r: -1 };
    caster.hand = [{ id: 'launch_trap', instanceId: 'launch1' }];
    others[0].position = { q: 0, r: 0 }; others[0].hand = [];
    const placed = applyAction(game, caster.id, { type: 'play', cardInstanceId: 'launch1', at: { q: 1, r: 0 }, direction: 0 });
    expect(placed.ok).toBe(true); if (!placed.ok) return;
    const ended = applyAction(placed.state, caster.id, { type: 'end' });
    expect(ended.ok).toBe(true); if (!ended.ok) return;
    const moved = applyAction(ended.state, others[0].id, { type: 'move', direction: 0 });
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.state.traps.some(t => t.kind === 'launch')).toBe(false);
    expect(moved.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 4, r: 0 });
  });
  it('紧急闪避先进入相邻格，取消该根攻击对自己的位移', () => {
    const { game, caster, others } = scene(2);
    others[0].position = { q: 1, r: 0 };
    others[0].hand = [{ id: 'dodge', instanceId: 'dodge1' }];
    const pending = cast(game, caster.id);
    const dodged = applyAction(pending, others[0].id, { type: 'react', choice: 'dodge', cardInstanceId: 'dodge1', dodgeAt: { q: 1, r: 1 } });
    expect(dodged.ok).toBe(true); if (!dodged.ok) return;
    expect(dodged.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 1, r: 1 });
    expect(dodged.state.players.find(p => p.id === others[0].id)?.reactionUsed).toBe(true);
  });
});
