import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer, expireBoxDecision } from './game';
import { add, DIRS, distance, equal, onBoard } from './hex';

const seats = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' }));

describe('地图盲盒与商店', () => {
  it('第1轮刷新实体商店和盲盒，均不覆盖玩家或固定弹簧', () => {
    for (const count of [2, 3, 4]) {
      const game = createGame(seats.slice(0, count === 4 ? 3 : count).concat(count === 4 ? [{ id: 'p3', name: '玩家3', color: '#fff' }] : []), 71, 100);
      expect(game.shop).not.toBeNull();
      expect(game.boxes).toHaveLength(count === 2 ? 1 : 2);
      for (const at of [...game.boxes.map(b => b.at), game.shop!.at]) {
        expect(game.players.some(p => p.position && equal(p.position, at))).toBe(false);
        expect(game.traps.some(t => equal(t.at, at))).toBe(false);
      }
      expect(game.shop!.stock.map(s => s.price)).toEqual([3, 3, 6]);
    }
  });
  it('购买要求到达商店，满手牌必须原子指定弃牌；公共池不变', () => {
    const game = createGame(seats.slice(0, 2), 72, 100);
    const player = currentPlayer(game);
    player.hand.push({ id: 'punch', instanceId: 'extra' });
    const stock = game.shop!.stock[0];
    const market = structuredClone(game.market);
    const random = game.random.market;
    const far = applyAction(game, player.id, { type: 'buy', cardInstanceId: stock.card.instanceId, replaceInstanceId: 'extra' });
    expect(far.ok).toBe(false);
    player.position = game.shop!.at;
    const missing = applyAction(game, player.id, { type: 'buy', cardInstanceId: stock.card.instanceId });
    expect(missing.ok).toBe(false);
    const bought = applyAction(game, player.id, { type: 'buy', cardInstanceId: stock.card.instanceId, replaceInstanceId: 'extra' });
    expect(bought.ok).toBe(true); if (!bought.ok) return;
    expect(currentPlayer(bought.state).hand).toHaveLength(3);
    expect(currentPlayer(bought.state).coins).toBe(0);
    expect(bought.state.ap).toBe(2);
    expect(bought.state.shop!.stock).toHaveLength(2);
    expect(bought.state.market).toEqual(market);
    expect(bought.state.random.market).toBe(random);
    expect(applyAction(bought.state, player.id, { type: 'buy', cardInstanceId: bought.state.shop!.stock[0].card.instanceId }).ok).toBe(false);
  });
  it('满手牌盲盒进入10秒选择状态，超时放弃；公共池保持不变', () => {
    const game = createGame(seats.slice(0, 2), 73, 100);
    const player = currentPlayer(game);
    player.hand.push({ id: 'punch', instanceId: 'extra' });
    const box = game.boxes[0];
    const direction = DIRS.findIndex(d => {
      const from = add(box.at, { q: -d.q, r: -d.r });
      return onBoard(from) && !game.players.some(p => p.id !== player.id && p.position && equal(p.position, from)) && !game.traps.some(t => equal(t.at, from));
    });
    expect(direction).toBeGreaterThanOrEqual(0);
    player.position = add(box.at, { q: -DIRS[direction].q, r: -DIRS[direction].r });
    const market = structuredClone(game.market);
    const moved = applyAction(game, player.id, { type: 'move', direction });
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.state.boxes).toHaveLength(0);
    expect(moved.state.boxDecisions).toHaveLength(1);
    expect(applyAction(moved.state, player.id, { type: 'end' }).ok).toBe(false);
    const expired = expireBoxDecision(moved.state);
    expect(expired.boxDecisions).toHaveLength(0);
    expect(expired.players.find(p => p.id === player.id)?.hand).toHaveLength(3);
    expect(expired.market).toEqual(market);
  });
  it('多格位移途经盲盒但最终停在别处时不领取', () => {
    const game = createGame(seats.slice(0, 2), 74, 100);
    const player = currentPlayer(game);
    player.position = { q: 0, r: 0 };
    game.players.find(p => p.id !== player.id)!.position = { q: -4, r: 0 };
    player.hand = [{ id: 'rocket_boots', instanceId: 'rocket' }];
    game.traps = [];
    game.boxes = [{ id: 'passing-box', at: { q: 1, r: 0 } }];
    const moved = applyAction(game, player.id, { type: 'play', cardInstanceId: 'rocket', direction: 0, length: 2 });
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.state.players.find(p => p.id === player.id)?.position).toEqual({ q: 2, r: 0 });
    expect(moved.state.boxes).toHaveLength(1);
  });
});
