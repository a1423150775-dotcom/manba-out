import { CARDS, type CardId } from './cards';
import { CONFIG } from './config';
import { board, distance, equal, onBoard, type Hex } from './hex';
import type { GameState, Trap } from './game';

export type DebugPatch = {
  positions?: Record<string, Hex | null>;
  hands?: Record<string, CardId[]>;
  market?: { slots: CardId[]; nextCard: CardId };
  traps?: Trap[];
  boxes?: Hex[];
  shopAt?: Hex | null;
  coins?: Record<string, number>;
  ap?: number;
};
const validCard = (id: string): id is CardId => Object.hasOwn(CARDS, id);
const validHex = (at: Hex): boolean => Number.isInteger(at?.q) && Number.isInteger(at?.r) && onBoard(at, CONFIG.radius);
export const DEBUG_SCENARIOS = ['air-defense', 'cannon-chain', 'collision', 'full-hand', 'throne-swap'] as const;
export type DebugScenarioName = typeof DEBUG_SCENARIOS[number];

export function applyDebugPatch(previous: GameState, patch: DebugPatch): GameState {
  if (previous.phase !== 'playing' || previous.pending || previous.boxDecisions.length) throw new Error('调试修改只能在稳定的进行中状态提交');
  const state = structuredClone(previous);
  const ids = new Set(state.players.map(p => p.id));
  if (patch.positions) for (const [id, at] of Object.entries(patch.positions)) {
    if (!ids.has(id) || (at !== null && !validHex(at))) throw new Error('玩家位置无效');
    const player = state.players.find(p => p.id === id)!;
    player.position = at;
    player.outRound = at ? null : state.round;
  }
  const occupied = state.players.filter(p => p.position).map(p => `${p.position!.q},${p.position!.r}`);
  if (new Set(occupied).size !== occupied.length) throw new Error('玩家不能叠在同一格');
  if (patch.hands) for (const [id, cards] of Object.entries(patch.hands)) {
    if (!ids.has(id) || !Array.isArray(cards) || cards.length > CONFIG.handLimit || cards.some(c => !validCard(c))) throw new Error('调试手牌无效');
    state.players.find(p => p.id === id)!.hand = cards.map(cardId => ({ id: cardId, instanceId: `debug${state.nextId++}` }));
  }
  if (patch.market) {
    if (!Array.isArray(patch.market.slots) || patch.market.slots.length !== 4 || patch.market.slots.some(c => !validCard(c)) || !validCard(patch.market.nextCard)) throw new Error('公共4+1配置无效');
    state.market.slots = patch.market.slots.map(id => ({ id, instanceId: `debug${state.nextId++}` })) as GameState['market']['slots'];
    state.market.nextCard = { id: patch.market.nextCard, instanceId: `debug${state.nextId++}` };
  }
  if (patch.traps) {
    if (!Array.isArray(patch.traps) || patch.traps.some(t => !validHex(t.at) || !['spring', 'banana', 'ice', 'launch'].includes(t.kind) || !Number.isInteger(t.direction) || t.direction < 0 || t.direction > 5 || (t.ownerId !== null && !ids.has(t.ownerId)))) throw new Error('机关配置无效');
    if (new Set(patch.traps.map(t => `${t.at.q},${t.at.r}`)).size !== patch.traps.length) throw new Error('同一格不能有多个陷阱');
    state.traps = structuredClone(patch.traps);
  }
  if (patch.boxes) {
    if (!Array.isArray(patch.boxes) || patch.boxes.length > 4 || patch.boxes.some(at => !validHex(at))) throw new Error('盲盒配置无效');
    state.boxes = patch.boxes.map(at => ({ id: `debugbox${state.nextId++}`, at }));
  }
  if (patch.shopAt !== undefined) {
    if (patch.shopAt !== null && !validHex(patch.shopAt)) throw new Error('商店位置无效');
    if (patch.shopAt === null) state.shop = null;
    else if (state.shop) state.shop.at = patch.shopAt;
  }
  if (patch.coins) for (const [id, coins] of Object.entries(patch.coins)) {
    if (!ids.has(id) || !Number.isInteger(coins) || coins < 0 || coins > 12) throw new Error('金币配置无效');
    state.players.find(p => p.id === id)!.coins = coins;
  }
  if (patch.ap !== undefined) {
    if (!Number.isInteger(patch.ap) || patch.ap < 0 || patch.ap > 10) throw new Error('AP配置无效');
    state.ap = patch.ap;
  }
  state.version++;
  state.events.push('本地开发调试场景已更新');
  return state;
}

export function scenarioPatch(game: GameState, name: DebugScenarioName): DebugPatch {
  const casterId = game.roundOrder[game.turnIndex];
  const others = game.players.filter(p => p.id !== casterId);
  const fixed = game.traps.filter(t => t.kind === 'spring');
  if (name === 'air-defense') {
    if (others.length < 3) throw new Error('空气炮多目标场景需要4人房间');
    return { positions: { [casterId]: { q: 0, r: 0 }, [others[0].id]: { q: 0, r: 1 }, [others[1].id]: { q: 1, r: 0 }, [others[2].id]: { q: 1, r: -1 } },
      hands: { [casterId]: ['air_cannon'], [others[0].id]: ['shield'], [others[1].id]: ['mirror'], [others[2].id]: [] }, traps: fixed, boxes: [], shopAt: null, ap: 3 };
  }
  if (name === 'cannon-chain') return { positions: { [casterId]: { q: 0, r: 0 }, [others[0].id]: { q: 1, r: 0 } }, hands: { [casterId]: ['air_cannon'], [others[0].id]: [] },
    traps: [...fixed.filter(t => !equal(t.at, { q: 3, r: 0 })), { id: 'debug-banana', kind: 'banana', at: { q: 2, r: 0 }, direction: 0, ownerId: casterId }, { id: 'debug-spring', kind: 'spring', at: { q: 3, r: 0 }, direction: 0, ownerId: null }], boxes: [], shopAt: null, ap: 3 };
  if (name === 'collision') {
    if (others.length < 2) throw new Error('碰撞场景需要3人房间');
    return { positions: { [casterId]: { q: 0, r: 0 }, [others[0].id]: { q: 1, r: 0 }, [others[1].id]: { q: 2, r: 0 } }, hands: { [casterId]: ['air_cannon'] }, traps: [], boxes: [], shopAt: null, ap: 3 };
  }
  if (name === 'full-hand') return { positions: { [casterId]: { q: 2, r: 0 }, [others[0].id]: { q: -4, r: 0 } }, hands: { [casterId]: ['punch', 'banana', 'shield'] }, boxes: [{ q: 2, r: -1 }], shopAt: { q: 2, r: 1 }, coins: { [casterId]: 12 }, ap: 3 };
  if (name === 'throne-swap') return { positions: { [casterId]: { q: 1, r: 0 }, [others[0].id]: { q: 0, r: 0 } }, hands: { [casterId]: ['swap'], [others[0].id]: [] }, boxes: [], shopAt: null, ap: 3 };
  throw new Error('未知调试场景');
}

export function exportReproduction(state: GameState): string {
  return JSON.stringify({ format: 'bad-friends-replay-v1', seed: state.seed, matchId: state.matchId, state, note: '仅本地开发与赛后使用；包含随机流及所有玩家手牌' }, null, 2);
}
