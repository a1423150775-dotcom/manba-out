import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { applyAction, createGame, currentPlayer, finishGameEarly } from './game';
import { add, board, DIRS, distance, equal, getAirCannonCells, getAirCannonKnockbackDirection } from './hex';

const seats = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' }));

describe('六边形棋盘与座次', () => {
  it('全体投票提前结束时不额外结算未完成大轮', () => {
    const game = createGame(seats(2), 7, 100);
    const before = game.players.map(player => player.score);
    const ended = finishGameEarly(game, 200);
    expect(ended.phase).toBe('finished');
    expect(ended.finishedAt).toBe(200);
    expect(ended.players.map(player => player.score)).toEqual(before);
    expect(ended.round).toBe(game.round);
    expect(ended.version).toBe(game.version + 1);
    expect(game.phase).toBe('playing');
    expect(applyAction(ended, currentPlayer(ended).id, { type: 'end' }).ok).toBe(false);
  });
  it('地图61格，起点全部在边缘', () => {
    expect(board()).toHaveLength(61);
    for (const n of [2, 3, 4, 5, 6]) {
      const game = createGame(seats(n), 7, 100);
      expect(game.players.map(p => distance(p.spawn))).toEqual(Array(n).fill(4));
      expect(game.traps).toHaveLength(6);
      expect(game.players.every(p => p.hand.length === 2 && p.hand.every(card => card.id === 'laoda_elbow'))).toBe(true);
    }
  });
  it('相同种子和输入得到完全一致的起局', () => {
    expect(createGame(seats(4), 42, 100)).toEqual(createGame(seats(4), 42, 100));
  });
  it('每大轮轮流改变首位，所有人完成后才计分', () => {
    let game = createGame(seats(3), 11, 100);
    const original = game.baseOrder;
    for (let i = 0; i < 3; i++) {
      const result = applyAction(game, currentPlayer(game).id, { type: 'end' }, 101 + i);
      expect(result.ok).toBe(true);
      if (result.ok) game = result.state;
    }
    expect(game.round).toBe(2);
    expect(game.roundOrder[0]).toBe(original[1]);
  });
});

describe('公共4+1与卡牌额度', () => {
  it('只替换被抽取的卡位，旧预览准确补入', () => {
    const game = createGame(seats(2), 123, 100);
    const actor = currentPlayer(game);
    const before = structuredClone(game.market);
    const result = applyAction(game, actor.id, { type: 'draw', slot: 2, cardInstanceId: before.slots[2].instanceId }, 101);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.market.slots[2]).toEqual(before.nextCard);
    for (const i of [0, 1, 3]) expect(result.state.market.slots[i]).toEqual(before.slots[i]);
    expect(result.state.market.nextCard.instanceId).not.toBe(before.nextCard.instanceId);
    expect(currentPlayer(result.state).hand).toHaveLength(3);
    expect(result.state.cardAction).toBe('draw');
    expect(game.market).toEqual(before);
    const duplicate = applyAction(result.state, actor.id, { type: 'draw', slot: 2, cardInstanceId: before.slots[2].instanceId }, 102);
    expect(duplicate.ok).toBe(false);
  });
  it('移动、结束回合、非法抽牌均不改变公共牌和随机流', () => {
    let game = createGame(seats(2), 321, 100);
    const market = structuredClone(game.market);
    const random = game.random.market;
    const actor = currentPlayer(game);
    const bad = applyAction(game, actor.id, { type: 'draw', slot: 0, cardInstanceId: '过期' }, 101);
    expect(bad.ok).toBe(false);
    expect(game.random.market).toBe(random);
    const move = applyAction(game, actor.id, { type: 'move', direction: 3 }, 102);
    expect(move.ok).toBe(true);
    if (move.ok) game = move.state;
    const end = applyAction(game, actor.id, { type: 'end' }, 103);
    expect(end.ok).toBe(true);
    if (end.ok) game = end.state;
    expect(game.market).toEqual(market);
    expect(game.random.market).toBe(random);
  });
  it('手牌满3张时禁止抽牌，失败不推进随机流', () => {
    const game = createGame(seats(2), 99, 100);
    currentPlayer(game).hand.push({ id: 'punch', instanceId: 'extra' });
    const market = structuredClone(game.market);
    const random = game.random.market;
    const result = applyAction(game, currentPlayer(game).id, { type: 'draw', slot: 0, cardInstanceId: market.slots[0].instanceId });
    expect(result.ok).toBe(false);
    expect(game.market).toEqual(market);
    expect(game.random.market).toBe(random);
  });
});

describe('空气炮共享几何', () => {
  it('方向0的八格与规格完全一致', () => {
    expect(getAirCannonCells({ q: 0, r: 0 }, 0, 4)).toEqual([
      { q: 0, r: 1 }, { q: 1, r: 0 }, { q: 1, r: -1 },
      { q: 0, r: 2 }, { q: 1, r: 1 }, { q: 2, r: 0 }, { q: 2, r: -1 }, { q: 2, r: -2 },
    ]);
  });
  it('六方向都是8个不同且距离不超过2的格子', () => {
    for (let direction = 0; direction < 6; direction++) {
      const cells = getAirCannonCells({ q: 0, r: 0 }, direction, CONFIG.radius);
      expect(cells).toHaveLength(8);
      expect(new Set(cells.map(c => `${c.q},${c.r}`)).size).toBe(8);
      expect(cells.every(c => distance(c) >= 1 && distance(c) <= 2)).toBe(true);
    }
  });
  it('平移、边界裁剪和侧翼方向', () => {
    const origin = { q: 1, r: -1 };
    expect(getAirCannonCells(origin, 0, 6)).toEqual(getAirCannonCells({ q: 0, r: 0 }, 0, 6).map(c => add(c, origin)));
    expect(getAirCannonCells({ q: 4, r: 0 }, 0, 4).every(c => distance(c) <= 4)).toBe(true);
    expect(getAirCannonCells({ q: 4, r: 0 }, 0, 4).length).toBeLessThan(8);
    expect(equal(getAirCannonKnockbackDirection({ q: 0, r: 0 }, { q: 0, r: 2 }, 0), DIRS[5])).toBe(true);
    expect(equal(getAirCannonKnockbackDirection({ q: 0, r: 0 }, { q: 2, r: -2 }, 0), DIRS[1])).toBe(true);
    expect(equal(getAirCannonKnockbackDirection({ q: 0, r: 0 }, { q: 1, r: 1 }, 0), DIRS[0])).toBe(true);
  });
  it('六个朝向可由同一轴坐标旋转公式得到', () => {
    const rotate = (h: { q: number; r: number }) => ({ q: -h.r, r: h.q + h.r });
    const sort = (cells: { q: number; r: number }[]) => cells.map(c => `${c.q},${c.r}`).sort();
    for (let k = 0; k < 6; k++) {
      const cells = getAirCannonCells({ q: 0, r: 0 }, k, 4).map(rotate);
      expect(sort(cells)).toEqual(sort(getAirCannonCells({ q: 0, r: 0 }, (k + 5) % 6, 4)));
    }
  });
});
