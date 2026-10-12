import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer, type GameState } from './game';

const seats = Array.from({ length: 2 }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' }));
const start = (): GameState => {
  const game = createGame(seats, 20261011, 100);
  game.traps = [];
  game.boxes = [];
  game.shop = null;
  currentPlayer(game).hand = [];
  return game;
};
const move = (game: GameState) => {
  for (let direction = 0; direction < 6; direction++) {
    const result = applyAction(game, currentPlayer(game).id, { type: 'move', direction }, 101);
    if (result.ok) return result.state;
  }
  throw new Error('没有合法的相邻移动格');
};
const draw = (game: GameState) => applyAction(game, currentPlayer(game).id, {
  type: 'draw', slot: 0, cardInstanceId: game.market.slots[0].instanceId,
}, 102);

describe('个人回合：移动与卡牌操作彼此独立', () => {
  it('开局即使没有手牌也能移动，消耗1 AP且保留卡牌额度', () => {
    const game = move(start());
    expect(currentPlayer(game).hand).toHaveLength(0);
    expect(game.ap).toBe(2);
    expect(game.cardAction).toBe('none');
  });

  it('不抽牌、不出牌也可直接结束回合，公共卡池不变', () => {
    const game = start();
    const market = structuredClone(game.market);
    const result = applyAction(game, currentPlayer(game).id, { type: 'end' }, 103);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turnId).toBe(game.turnId + 1);
    expect(result.state.market).toEqual(market);
  });

  it('先移动再抽牌：AP与卡牌额度分别记录', () => {
    const moved = move(start());
    const result = draw(moved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.ap).toBe(2);
    expect(result.state.cardAction).toBe('draw');
    expect(currentPlayer(result.state).hand).toHaveLength(1);
  });

  it('先抽牌再移动：移动不受已抽牌影响', () => {
    const result = draw(start());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const moved = move(result.state);
    expect(moved.ap).toBe(2);
    expect(moved.cardAction).toBe('draw');
    expect(currentPlayer(moved).hand).toHaveLength(1);
  });

  it('先出牌再移动：移动不受已出牌影响', () => {
    const game = start();
    currentPlayer(game).hand = [{ id: 'supply_dash', instanceId: 'test-dash' }];
    const result = applyAction(game, currentPlayer(game).id, { type: 'play', cardInstanceId: 'test-dash' }, 102);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cardAction).toBe('play');
    const moved = move(result.state);
    expect(moved.cardAction).toBe('play');
    expect(moved.ap + moved.moveAp).toBe(result.state.ap + result.state.moveAp - 1);
  });

  it('抽牌和主动出牌严格二选一，第二次操作也被拒绝', () => {
    const drawn = draw(start());
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    const card = currentPlayer(drawn.state).hand[0];
    expect(applyAction(drawn.state, currentPlayer(drawn.state).id, { type: 'play', cardInstanceId: card.instanceId }).ok).toBe(false);
    expect(draw(drawn.state).ok).toBe(false);

    const game = start();
    currentPlayer(game).hand = [{ id: 'supply_dash', instanceId: 'test-dash' }];
    const played = applyAction(game, currentPlayer(game).id, { type: 'play', cardInstanceId: 'test-dash' });
    expect(played.ok).toBe(true);
    if (played.ok) expect(draw(played.state).ok).toBe(false);
  });
});
