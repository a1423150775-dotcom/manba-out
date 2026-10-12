import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { applyDebugPatch, DEBUG_SCENARIOS, exportReproduction, scenarioPatch } from './debug';

describe('仅开发环境场景编辑', () => {
  it('五个预设场景可构造、导出并保持对局身份', () => {
    for (const name of DEBUG_SCENARIOS) {
      const count = name === 'air-defense' ? 4 : name === 'collision' ? 3 : 2;
      const game = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#fff' })), 902, 100);
      const patched = applyDebugPatch(game, scenarioPatch(game, name));
      expect(patched.matchId).toBe(game.matchId);
      expect(patched.version).toBe(game.version + 1);
      expect(patched.players.every(p => p.hand.length <= 3)).toBe(true);
      const data = JSON.parse(exportReproduction(patched));
      expect(data.seed).toBe(902);
      expect(data.state.market.slots).toHaveLength(4);
    }
  });
  it('拒绝越界、叠人和第四张手牌', () => {
    const game = createGame([{ id: 'a', name: '甲', color: '#fff' }, { id: 'b', name: '乙', color: '#000' }], 1, 100);
    expect(() => applyDebugPatch(game, { positions: { a: { q: 9, r: 0 } } })).toThrow();
    expect(() => applyDebugPatch(game, { positions: { a: { q: 0, r: 0 }, b: { q: 0, r: 0 } } })).toThrow();
    expect(() => applyDebugPatch(game, { hands: { a: ['punch', 'hook', 'banana', 'shield'] } })).toThrow();
  });
});
