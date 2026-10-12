import { describe, expect, it } from 'vitest';
import { ACTIVE_CARD_IDS, IMPLEMENTED_CARDS } from './cards';
import { CONFIG } from './config';
import { applyAction, createGame, currentPlayer } from './game';
import { DIRS, add, clockwiseDirection, distance, equal, scale } from './hex';
import { springArrowRotation, xy } from '../web/Board';

const seats = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `神秘牢大${i + 1}`, color: '#fff' }));

describe('正式卡牌库', () => {
  it('初始牌、公共4+1、商店和盲盒只生成牢大肘击，旧实现仍留存', () => {
    expect(ACTIVE_CARD_IDS).toEqual(['laoda_elbow']);
    expect(IMPLEMENTED_CARDS).toHaveLength(24);
    for (const count of [2, 3, 4, 5, 6]) {
      const game = createGame(seats(count), count, 100);
      expect(game.players.flatMap(p => p.hand).map(c => c.id)).toEqual(Array(count * 2).fill('laoda_elbow'));
      expect([...game.market.slots, game.market.nextCard].map(c => c.id)).toEqual(Array(5).fill('laoda_elbow'));
      expect(game.shop?.stock.every(item => item.card.id === 'laoda_elbow')).toBe(true);
      expect(game.maxRounds).toBe(CONFIG.rounds[count]);
      const actor = currentPlayer(game);
      actor.position = add(game.boxes[0].at, DIRS[3]);
      actor.hand = [];
      game.traps = [];
      const opened = applyAction(game, actor.id, { type: 'move', direction: 0 });
      expect(opened.ok).toBe(true);
      if (opened.ok) expect(opened.state.players.find(p => p.id === actor.id)?.hand.map(c => c.id)).toEqual(['laoda_elbow']);
    }
  });

  it('抽牌仅替换所选位置，手牌上限和卡牌额度不变', () => {
    const game = createGame(seats(2), 4, 100);
    const before = structuredClone(game.market);
    const actor = currentPlayer(game);
    const result = applyAction(game, actor.id, { type: 'draw', slot: 1, cardInstanceId: before.slots[1].instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.market.slots[1]).toEqual(before.nextCard);
    expect([0, 2, 3].map(i => result.state.market.slots[i])).toEqual([before.slots[0], before.slots[2], before.slots[3]]);
    expect(actor.hand).toHaveLength(2);
    expect(currentPlayer(result.state).hand).toHaveLength(3);
    expect(applyAction(result.state, actor.id, { type: 'play', cardInstanceId: actor.hand[0].instanceId, targetId: game.players.find(p => p.id !== actor.id)!.id }).ok).toBe(false);
  });

  it('牢大肘击击退2格、连锁推挤和有效出界加2分', () => {
    const game = createGame(seats(3), 8, 100);
    const actor = currentPlayer(game);
    const others = game.players.filter(p => p.id !== actor.id);
    game.traps = []; game.boxes = []; game.shop = null;
    actor.position = { q: 0, r: 0 };
    others[0].position = { q: 1, r: 0 }; others[1].position = { q: 2, r: 0 };
    others.forEach(p => p.hand = []);
    const played = applyAction(game, actor.id, { type: 'play', cardInstanceId: actor.hand[0].instanceId, targetId: others[0].id });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.players.find(p => p.id === others[0].id)?.position).toEqual({ q: 3, r: 0 });
    expect(played.state.players.find(p => p.id === others[1].id)?.position).toEqual({ q: 4, r: 0 });
    expect(currentPlayer(played.state).score).toBe(0);

    const edge = createGame(seats(2), 8, 100);
    const attacker = currentPlayer(edge), victim = edge.players.find(p => p.id !== attacker.id)!;
    edge.traps = []; edge.boxes = []; edge.shop = null;
    attacker.position = { q: 3, r: 0 }; victim.position = { q: 4, r: 0 }; victim.hand = [];
    const knockout = applyAction(edge, attacker.id, { type: 'play', cardInstanceId: attacker.hand[0].instanceId, targetId: victim.id });
    expect(knockout.ok).toBe(true);
    if (knockout.ok) {
      expect(knockout.state.players.find(p => p.id === victim.id)?.position).toBeNull();
      expect(knockout.state.players.find(p => p.id === attacker.id)?.score).toBe(2);
    }
  });
});

describe('固定弹簧', () => {
  it('保留全部坐标，并按实际屏幕坐标顺时针旋转60度', () => {
    const game = createGame(seats(2), 9, 100);
    expect(game.traps).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const trap = game.traps.find(t => t.id === `spring${i}`)!;
      expect(trap.at).toEqual(scale(DIRS[i], 3));
      const inward = (i + 3) % 6;
      expect(trap.direction).toBe(clockwiseDirection(inward));
      const origin = xy({ q: 0, r: 0 });
      const oldPoint = xy(DIRS[inward]);
      const newPoint = xy(DIRS[trap.direction]);
      const oldAngle = Math.atan2(oldPoint.y - origin.y, oldPoint.x - origin.x);
      const newAngle = Math.atan2(newPoint.y - origin.y, newPoint.x - origin.x);
      const clockwise = (newAngle - oldAngle + Math.PI * 2) % (Math.PI * 2);
      expect(clockwise).toBeCloseTo(Math.PI / 3);
      const arrowAngle = (-90 + springArrowRotation(trap.direction) + 360) % 360;
      const travelAngle = (Math.atan2(newPoint.y - origin.y, newPoint.x - origin.x) * 180 / Math.PI + 360) % 360;
      expect(arrowAngle).toBeCloseTo(travelAngle);
      expect(equal(add(trap.at, scale(DIRS[trap.direction], 2)), { q: 0, r: 0 })).toBe(false);
    }
  });

  it('弹簧实际沿箭头方向推进两步，可连锁并出界', () => {
    const game = createGame(seats(4), 10, 100);
    const actor = currentPlayer(game), others = game.players.filter(p => p.id !== actor.id);
    const spring = game.traps.find(t => t.id === 'spring0')!;
    expect(spring.at).toEqual({ q: 3, r: 0 });
    expect(spring.direction).toBe(2);
    actor.position = { q: 2, r: 0 };
    others.forEach((player, index) => { player.position = { q: 3, r: -2 - index }; });
    game.traps = [spring]; game.boxes = []; game.shop = null;
    const moved = applyAction(game, actor.id, { type: 'move', direction: 0 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.state.events.some(event => event.includes('触发弹簧'))).toBe(true);
    expect(moved.state.players.find(p => p.id === others[2].id)?.position).toBeNull();
    expect(moved.state.players.find(p => p.id === actor.id)?.position).toEqual({ q: 3, r: -2 });
    expect(distance(moved.state.players.find(p => p.id === actor.id)!.position!)).toBe(3);
  });
});
