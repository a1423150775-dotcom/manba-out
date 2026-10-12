import { CONFIG } from './config';
import { ACTIVE_CARD_IDS, CARDS, type Card, type CardId } from './cards';
import { DIRS, add, board, clockwiseDirection, distance, equal, getAirCannonCells, getAirCannonKnockbackDirection, key, onBoard, scale, sub, type Hex } from './hex';
import { deriveSeed, nextRandom } from './random';

export type Player = {
  id: string; name: string; color: string; position: Hex | null; spawn: Hex;
  hand: Card[]; score: number; throneStreak: number; coins: number;
  outRound: number | null; bonusAp: number; edgeGuard: boolean; reactionUsed: boolean; controlCount: number; iceNext: boolean;
};
export type Trap = { id: string; kind: 'spring' | 'banana' | 'ice' | 'launch'; at: Hex; direction: number; ownerId: string | null; originalDirection?: number; restoreRound?: number };
export type TimedDevice = { id: string; kind: 'time_bomb' | 'gravity_well'; at: Hex; ownerId: string; triggerRound: number };
export type Shop = { id: string; at: Hex; expiresRound: number; stock: { card: Card; price: number }[]; boughtBy: string[] };
export type GameState = {
  matchId: string; version: number; seed: number; random: { setup: number; market: number; map: number; boxes: number; shop: number; delivery: number };
  nextId: number; players: Player[]; baseOrder: string[]; roundOrder: string[];
  round: number; maxRounds: number; turnIndex: number; turnId: number; ap: number; moveAp: number;
  cardAction: 'none' | 'draw' | 'play'; phase: 'playing' | 'finished';
  market: { slots: [Card, Card, Card, Card]; nextCard: Card };
  traps: Trap[]; discarded: Card[]; events: string[]; startedAt: number; finishedAt: number | null;
  pending: PendingEffect | null;
  boxes: { id: string; at: Hex }[]; shop: Shop | null;
  boxDecisions: { playerId: string; card: Card }[];
  obstacles: { id: string; at: Hex; ownerId: string; expiresRound: number }[];
  timed: TimedDevice[]; timedQueue: TimedDevice[];
};
export type PendingEffect = {
  rootId: number; casterId: string; cardId: 'laoda_elbow' | 'punch' | 'hook' | 'air_cannon' | 'swap' | 'magnet' | 'friend_delivery' | 'quake' | 'swap_storm' | 'tornado' | 'gathering' | 'time_bomb' | 'gravity_well';
  targets: { id: string; at: Hex; direction: number; steps: number }[];
  responses: Record<string, 'shield' | 'mirror' | 'dodge' | 'pass'>;
  eligible: string[];
  center?: Hex;
  attackDirection?: number;
};
export type GameAction =
  | { type: 'move'; direction: number }
  | { type: 'draw'; slot: number; cardInstanceId: string }
  | { type: 'play'; cardInstanceId: string; targetId?: string; secondTargetId?: string; at?: Hex; direction?: number; length?: number; replaceTrapId?: string }
  | { type: 'react'; choice: 'shield' | 'mirror' | 'dodge' | 'pass'; cardInstanceId?: string; dodgeAt?: Hex }
  | { type: 'box'; choice: 'replace' | 'abandon'; replaceInstanceId?: string }
  | { type: 'buy'; cardInstanceId: string; replaceInstanceId?: string }
  | { type: 'end' };
export type ActionResult = { ok: true; state: GameState } | { ok: false; reason: string };

type Stream = keyof GameState['random'];
function roll(state: GameState, stream: Stream): number {
  const result = nextRandom(state.random[stream]);
  state.random[stream] = result.seed;
  return result.value;
}
function newCard(state: GameState, stream: Stream, commonOnly = false, rarity?: 'common' | 'rare' | 'legendary'): Card {
  void commonOnly; void rarity;
  const id = ACTIVE_CARD_IDS[Math.floor(roll(state, stream) * ACTIVE_CARD_IDS.length)];
  return { instanceId: `c${state.nextId++}`, id };
}
function shuffle<T>(state: GameState, items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(roll(state, 'setup') * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function currentPlayer(state: GameState): Player {
  return state.players.find(p => p.id === state.roundOrder[state.turnIndex])!;
}
export function createGame(inputs: { id: string; name: string; color: string }[], seed: number, now = Date.now(), matchId = `test-${now.toString(36)}`, maxRounds?: number): GameState {
  if (inputs.length < 2 || inputs.length > 6 || new Set(inputs.map(p => p.id)).size !== inputs.length) throw new Error('需要2～6名不同玩家');
  if (maxRounds !== undefined && (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 99)) throw new Error('总轮数必须是1～99');
  const count = inputs.length;
  const state: GameState = {
    matchId, version: 0, seed, random: { setup: deriveSeed(seed, 1), market: deriveSeed(seed, 2), map: deriveSeed(seed, 3), boxes: deriveSeed(seed, 4), shop: deriveSeed(seed, 5), delivery: deriveSeed(seed, 6) }, nextId: 1,
    players: [], baseOrder: [], roundOrder: [], round: 1, maxRounds: maxRounds ?? CONFIG.rounds[count], turnIndex: 0, turnId: 1,
    ap: CONFIG.baseAp, moveAp: 0, cardAction: 'none', phase: 'playing',
    market: { slots: [] as unknown as [Card, Card, Card, Card], nextCard: { instanceId: '', id: 'laoda_elbow' } },
    traps: DIRS.map((d, i) => ({ id: `spring${i}`, kind: 'spring', at: scale(d, 3), direction: clockwiseDirection((i + 3) % 6), ownerId: null })),
    discarded: [], events: [], startedAt: now, finishedAt: null, pending: null, boxes: [], shop: null, boxDecisions: [], obstacles: [], timed: [], timedQueue: [],
  };
  const seats = shuffle(state, CONFIG.starts[count]);
  state.baseOrder = shuffle(state, inputs.map(p => p.id));
  state.roundOrder = [...state.baseOrder];
  state.players = inputs.map((p, i) => ({ ...p, position: seats[i], spawn: seats[i], hand: [], score: 0, throneStreak: 0, coins: 3, outRound: null, bonusAp: 0, edgeGuard: false, reactionUsed: false, controlCount: 0, iceNext: false }));
  for (const p of state.players) {
    p.reactionUsed = false;
    p.controlCount = 0;
    p.hand.push({ instanceId: `c${state.nextId++}`, id: 'laoda_elbow' });
    p.hand.push(newCard(state, 'setup', true));
    state.events.push(`${p.name} 初始获得 ${p.hand.map(c => CARDS[c.id].name).join('、')}`);
  }
  state.market.slots = [newCard(state, 'market'), newCard(state, 'market'), newCard(state, 'market'), newCard(state, 'market')];
  state.market.nextCard = newCard(state, 'market');
  spawnResources(state);
  state.events.push(`第1大轮开始，${currentPlayer(state).name}先行动`);
  return state;
}
function scoreRound(state: GameState): void {
  for (const p of state.players) {
    if (!p.position) { p.throneStreak = 0; continue; }
    const d = distance(p.position);
    if (d === 0) p.throneStreak++; else p.throneStreak = 0;
    const points = d === 0 ? (p.throneStreak >= 3 ? 1 : 3) : d === 1 ? 2 : d === 2 ? 1 : 0;
    p.score += points;
    if (points) state.events.push(`${p.name} 位于${d === 0 ? '王座' : `${d}环`}，获得${points}分`);
  }
}
function beginRound(state: GameState): void {
  state.round++;
  state.obstacles = state.obstacles.filter(o => o.expiresRound >= state.round);
  for (const trap of state.traps) if (trap.restoreRound !== undefined && state.round > trap.restoreRound) {
    trap.direction = trap.originalDirection ?? trap.direction;
    delete trap.originalDirection; delete trap.restoreRound;
  }
  const offset = (state.round - 1) % state.players.length;
  state.roundOrder = [...state.baseOrder.slice(offset), ...state.baseOrder.slice(0, offset)];
  for (const p of state.players) {
    p.reactionUsed = false;
    p.controlCount = 0;
    if (p.outRound === state.round - 1) {
      const candidates = board().filter(h => distance(h) >= 3 && !state.players.some(x => x.position && equal(x.position, h)))
        .sort((a, b) => distance(a, p.spawn) - distance(b, p.spawn) || a.q - b.q || a.r - b.r);
      p.position = candidates[0] ?? null;
      p.outRound = null;
      p.bonusAp = 1;
      p.edgeGuard = true;
      state.events.push(`${p.name} 在边缘复活`);
    }
  }
  state.timedQueue = state.timed.filter(t => t.triggerRound <= state.round);
  state.timed = state.timed.filter(t => t.triggerRound > state.round);
  state.turnIndex = 0;
  advanceTimed(state);
}
function finishRoundSetup(state: GameState): void {
  for (const p of state.players) p.coins = Math.min(12, p.coins + 2);
  spawnResources(state);
  state.ap = turnAp(currentPlayer(state));
  state.moveAp = 0;
  state.cardAction = 'none';
  state.events.push(`第${state.round}大轮开始，${currentPlayer(state).name}先行动`);
}
function advanceTimed(state: GameState): void {
  const device = state.timedQueue.shift();
  if (!device) { finishRoundSetup(state); return; }
  const owner = state.players.find(p => p.id === device.ownerId)!;
  const targets = state.players.filter(p => p.position && distance(p.position, device.at) <= (device.kind === 'time_bomb' ? 1 : 2)).flatMap(p => {
    let direction = -1;
    if (device.kind === 'time_bomb') {
      direction = DIRS.findIndex(d => equal(add(device.at, d), p.position!));
      if (direction < 0) {
        let best = -1;
        for (let i = 0; i < 6; i++) {
          const score = distance(add(device.at, DIRS[i]));
          if (score > best) { best = score; direction = i; }
        }
      }
    } else {
      const before = distance(p.position!, device.at);
      direction = DIRS.findIndex(d => distance(add(p.position!, d), device.at) < before);
    }
    return direction < 0 ? [] : [{ id: p.id, at: p.position!, direction, steps: 1 }];
  });
  state.events.push(`${owner.name}的${device.kind === 'time_bomb' ? '定时炸弹' : '引力井'}在 ${key(device.at)} 触发`);
  if (!targets.length) { advanceTimed(state); return; }
  const eligible = targets.filter(t => {
    const p = state.players.find(x => x.id === t.id)!;
    return p.id !== owner.id && !p.reactionUsed && p.controlCount < 2 && p.hand.some(c => c.id === 'shield' || c.id === 'dodge');
  }).map(t => t.id);
  state.pending = { rootId: state.version + state.timedQueue.length + 1, casterId: owner.id, cardId: device.kind, targets, responses: {}, eligible, center: device.at };
  if (!eligible.length) resolvePending(state);
}
function freeResourceCells(state: GameState, minDistance: number, maxDistance: number): Hex[] {
  return board().filter(at => {
    const d = distance(at);
    return d >= minDistance && d <= maxDistance
      && !occupant(state, at)
      && !state.traps.some(t => equal(t.at, at))
      && !state.obstacles.some(o => equal(o.at, at))
      && !state.timed.some(t => equal(t.at, at))
      && !state.boxes.some(b => equal(b.at, at))
      && !(state.shop && equal(state.shop.at, at));
  });
}
function spawnResources(state: GameState): void {
  if (state.shop && state.shop.expiresRound < state.round) {
    state.events.push('旧商店收摊'); state.shop = null;
  }
  if ((state.round - 1) % 3 === 0 && !state.shop) {
    const candidates = freeResourceCells(state, 2, 3);
    if (candidates.length) {
      const at = candidates[Math.floor(roll(state, 'map') * candidates.length)];
      state.shop = { id: `shop${state.nextId++}`, at, expiresRound: state.round + 1, boughtBy: [], stock: [
        { card: newCard(state, 'shop', false, 'common'), price: 3 },
        { card: newCard(state, 'shop', false, 'common'), price: 3 },
        { card: newCard(state, 'shop', false, 'rare'), price: 6 },
      ] };
      state.events.push(`商店出现在 ${key(at)}，营业至第${state.shop.expiresRound}大轮结束`);
    }
  }
  const count = Math.min(state.players.length === 2 ? 1 : 2, 4 - state.boxes.length);
  for (let i = 0; i < count; i++) {
    const candidates = freeResourceCells(state, 2, 4);
    if (!candidates.length) break;
    const at = candidates[Math.floor(roll(state, 'map') * candidates.length)];
    state.boxes.push({ id: `box${state.nextId++}`, at });
    state.events.push(`盲盒出现在 ${key(at)}`);
  }
}
function collectBox(state: GameState, player: Player): void {
  if (!player.position) return;
  const box = state.boxes.find(b => equal(b.at, player.position!));
  if (!box) return;
  state.boxes = state.boxes.filter(b => b.id !== box.id);
  const card = newCard(state, 'boxes');
  state.events.push(`${player.name}打开盲盒，获得${CARDS[card.id].name}`);
  if (player.hand.length < CONFIG.handLimit) player.hand.push(card);
  else state.boxDecisions.push({ playerId: player.id, card });
}
function collectStoppedBoxes(state: GameState): void {
  for (const player of state.players) collectBox(state, player);
}
function decideBox(state: GameState, actorId: string, action: Extract<GameAction, { type: 'box' }>): string | null {
  const decision = state.boxDecisions[0];
  if (!decision || decision.playerId !== actorId) return '没有待处理的盲盒';
  const player = state.players.find(p => p.id === actorId)!;
  if (action.choice === 'replace') {
    const old = player.hand.find(c => c.instanceId === action.replaceInstanceId);
    if (!old) return '需指定一张原有手牌';
    player.hand = player.hand.filter(c => c.instanceId !== old.instanceId);
    state.discarded.push(old);
    player.hand.push(decision.card);
    state.events.push(`${player.name}用盲盒奖励替换了${CARDS[old.id].name}`);
  } else if (action.choice === 'abandon') state.events.push(`${player.name}放弃盲盒奖励`);
  else return '无效盲盒选择';
  state.boxDecisions.shift();
  return null;
}
export function expireBoxDecision(previous: GameState): GameState {
  if (!previous.boxDecisions.length) return previous;
  const state = structuredClone(previous);
  const decision = state.boxDecisions.shift()!;
  state.events.push(`${state.players.find(p => p.id === decision.playerId)?.name}未选择，盲盒奖励自动放弃`);
  state.version++;
  return state;
}
function buy(state: GameState, player: Player, action: Extract<GameAction, { type: 'buy' }>): string | null {
  const shop = state.shop;
  if (!shop || !player.position || distance(player.position, shop.at) > 1) return '必须站在商店或相邻格';
  if (state.ap < 1) return 'AP不足';
  if (shop.boughtBy.includes(player.id)) return '本次商店已购买过';
  const entry = shop.stock.find(s => s.card.instanceId === action.cardInstanceId);
  if (!entry) return '商品已售出';
  if (player.coins < entry.price) return '金币不足';
  const old = player.hand.length >= CONFIG.handLimit ? player.hand.find(c => c.instanceId === action.replaceInstanceId) : undefined;
  if (player.hand.length >= CONFIG.handLimit && !old) return '手牌已满，需在购买时指定弃牌';
  if (old) { player.hand = player.hand.filter(c => c.instanceId !== old.instanceId); state.discarded.push(old); }
  player.hand.push(entry.card);
  player.coins -= entry.price; state.ap--;
  shop.stock = shop.stock.filter(s => s.card.instanceId !== entry.card.instanceId);
  shop.boughtBy.push(player.id);
  state.events.push(`${player.name}花${entry.price}金币购买${CARDS[entry.card.id].name}`);
  return null;
}
function endTurn(state: GameState, now: number): void {
  state.events.push(`${currentPlayer(state).name}结束回合`);
  if (state.turnIndex + 1 < state.players.length) {
    state.turnIndex++;
    state.ap = turnAp(currentPlayer(state));
    state.moveAp = 0;
    state.cardAction = 'none';
  } else {
    scoreRound(state);
    if (state.round >= state.maxRounds) {
      state.phase = 'finished'; state.finishedAt = now;
      state.events.push('对局结束');
    } else beginRound(state);
  }
  state.turnId++;
}
function turnAp(player: Player): number {
  const ap = Math.max(1, CONFIG.baseAp - (player.iceNext ? 1 : 0)) + player.bonusAp;
  player.iceNext = false;
  player.bonusAp = 0;
  return ap;
}
type Root = { triggerCount: number; usedSprings: Set<string>; controlled: Set<string>; protected: Set<string>; hostile: boolean; ownerId?: string; elbowKnockout?: boolean };
function occupant(state: GameState, at: Hex): Player | undefined {
  return state.players.find(p => p.position && equal(p.position, at));
}
function pushOne(state: GameState, target: Player, direction: Hex, root: Root, waveMoved: Set<string>, canceled: Set<string>): boolean {
  if (!target.position || waveMoved.has(target.id)) return false;
  const chain: Player[] = [target];
  let tail = target;
  while (tail.position) {
    const next = add(tail.position, direction);
    if (!onBoard(next) && tail.edgeGuard) { tail.edgeGuard = false; state.events.push(`${tail.name}的复活边界保护挡住出界`); return false; }
    if (!onBoard(next)) break;
    const nextPlayer = occupant(state, next);
    if (!nextPlayer) break;
    if (chain.includes(nextPlayer) || waveMoved.has(nextPlayer.id)) return false;
    chain.push(nextPlayer); tail = nextPlayer;
  }
  if (root.hostile && chain.some(p => root.protected.has(p.id) || (p.id !== root.ownerId && p.controlCount >= 2 && !root.controlled.has(p.id)))) {
    state.events.push('受控保护挡住了推挤链'); return false;
  }
  const entries: Player[] = [];
  if (chain.some(p => p.position && state.obstacles.some(o => equal(o.at, add(p.position!, direction))))) return false;
  for (const p of [...chain].reverse()) {
    const from = p.position!;
    const to = add(from, direction);
    if (onBoard(to)) { p.position = to; entries.push(p); state.events.push(`${p.name}被推至 ${key(to)}`); }
    else {
      p.position = null; p.outRound = state.round; state.events.push(`${p.name}被推出边界，进入OUT`);
      if (root.elbowKnockout && root.ownerId && p.id !== root.ownerId) {
        const attacker = state.players.find(candidate => candidate.id === root.ownerId);
        if (attacker) { attacker.score += 2; state.events.push(`${attacker.name}肘击击飞${p.name}，获得2分`); }
      }
    }
    waveMoved.add(p.id);
    if (root.hostile && p.id !== root.ownerId && !root.controlled.has(p.id)) { p.controlCount++; root.controlled.add(p.id); }
  }
  for (const p of entries) resolveEntry(state, p, DIRS.findIndex(d => equal(d, direction)), root, canceled);
  return true;
}
function pushSteps(state: GameState, target: Player, direction: Hex, count: number, root: Root, canceled: Set<string>): void {
  for (let step = 0; step < count && target.position; step++) {
    const moved = pushOne(state, target, direction, root, new Set(), canceled);
    if (!moved || canceled.has(target.id)) break;
  }
}
function resolveEntry(state: GameState, player: Player, enteredDirection: number, root: Root, canceled: Set<string>): void {
  if (!player.position) return;
  const trap = state.traps.find(t => equal(t.at, player.position!));
  if (trap && !(trap.kind === 'spring' && root.usedSprings.has(trap.id)) && !(trap.kind === 'banana' && enteredDirection < 0)) {
    if (root.triggerCount >= 8) state.events.push('机关链达到8次上限，后续机关停止');
    else {
      root.triggerCount++;
      canceled.add(player.id);
      if (trap.kind === 'spring') root.usedSprings.add(trap.id);
      else state.traps = state.traps.filter(t => t.id !== trap.id);
      const direction = trap.kind === 'banana' || trap.kind === 'ice' ? DIRS[enteredDirection] : DIRS[trap.direction];
      const steps = trap.kind === 'launch' ? 3 : 2;
      state.events.push(`${player.name}触发${trap.kind === 'spring' ? '弹簧' : trap.kind === 'banana' ? '香蕉皮' : trap.kind === 'ice' ? '冰冻地板' : '弹射陷阱'}`);
      if (trap.kind === 'ice') player.iceNext = true;
      else pushSteps(state, player, direction, steps, root, new Set());
    }
  }
}
function resolvePending(state: GameState): void {
  const pending = state.pending;
  if (!pending) return;
  const caster = state.players.find(p => p.id === pending.casterId)!;
  const canceled = new Set<string>();
  const ignored = new Set<string>();
  for (const target of pending.targets) {
    const response = pending.responses[target.id];
    if (response === 'shield' || response === 'mirror' || response === 'dodge') {
      ignored.add(target.id);
      state.events.push(`${state.players.find(p => p.id === target.id)?.name}用${response === 'shield' ? '护盾' : response === 'mirror' ? '反弹镜' : '紧急闪避'}抵挡了本次攻击`);
    }
  }
  const root: Root = { triggerCount: 0, usedSprings: new Set(), controlled: new Set(), protected: ignored, hostile: true, ownerId: caster.id, elbowKnockout: pending.cardId === 'laoda_elbow' || pending.cardId === 'punch' };
  if (pending.cardId === 'swap' || pending.cardId === 'swap_storm') {
    const first = pending.cardId === 'swap' ? caster : state.players.find(p => p.id === pending.targets[0].id)!;
    const second = state.players.find(p => p.id === pending.targets[pending.cardId === 'swap' ? 0 : 1].id)!;
    const defenders = pending.cardId === 'swap' ? [second] : [first, second];
    if (!first.position || !second.position || defenders.some(p => ignored.has(p.id) || p.controlCount >= 2)) state.events.push('交换被防御或受控保护取消');
    else {
      const fromFirst = first.position, fromSecond = second.position;
      first.position = fromSecond; second.position = fromFirst;
      for (const p of defenders) p.controlCount++;
      state.events.push(`${first.name}与${second.name}交换位置`);
      resolveEntry(state, first, -1, root, canceled);
      resolveEntry(state, second, -1, root, canceled);
    }
    state.pending = null; return;
  }
  if (pending.cardId === 'tornado') {
    const center = pending.center!;
    const destination = (at: Hex) => {
      const i = DIRS.findIndex(d => equal(add(center, d), at));
      return i < 0 ? at : add(center, DIRS[(i + 5) % 6]);
    };
    let moving = pending.targets.map(t => state.players.find(p => p.id === t.id)!)
      .filter(p => p.position && !ignored.has(p.id) && p.controlCount < 2 && pending.targets.some(t => t.id === p.id && equal(t.at, p.position!)));
    let changed = true;
    while (changed) {
      changed = false;
      const allowed = moving.filter(p => {
        const at = destination(p.position!);
        const blocker = occupant(state, at);
        return onBoard(at) && !state.obstacles.some(o => equal(o.at, at)) && (!blocker || moving.includes(blocker));
      });
      changed = allowed.length !== moving.length; moving = allowed;
    }
    const updates = moving.map(p => ({ p, at: destination(p.position!) }));
    for (const item of updates) { item.p.position = item.at; item.p.controlCount++; state.events.push(`${item.p.name}被龙卷风旋转到 ${key(item.at)}`); }
    for (const id of state.roundOrder) {
      const item = updates.find(u => u.p.id === id);
      if (item) resolveEntry(state, item.p, -1, root, canceled);
    }
    state.pending = null; return;
  }
  if (pending.cardId === 'gathering') {
    const available = board().filter(at => distance(at) <= 1 && !occupant(state, at) && !state.obstacles.some(o => equal(o.at, at)))
      .sort((a, b) => distance(b, caster.position ?? { q: 0, r: 0 }) - distance(a, caster.position ?? { q: 0, r: 0 }) || a.q - b.q || a.r - b.r);
    const updates: { p: Player; at: Hex }[] = [];
    for (const id of state.roundOrder) {
      const p = state.players.find(x => x.id === id)!;
      if (p.id === caster.id || !p.position || !pending.targets.some(t => t.id === id) || ignored.has(id) || p.controlCount >= 2) continue;
      const at = available.shift();
      if (at) updates.push({ p, at });
    }
    for (const item of updates) { item.p.position = item.at; item.p.controlCount++; state.events.push(`${item.p.name}被集合到 ${key(item.at)}`); }
    for (const item of updates) resolveEntry(state, item.p, -1, root, canceled);
    state.pending = null; return;
  }
  if (pending.cardId === 'friend_delivery') {
    const target = state.players.find(p => p.id === pending.targets[0].id)!;
    if (target.position && !ignored.has(target.id) && target.controlCount < 2) {
      const candidates = board().filter(at => distance(at) >= 2 && distance(at) <= 4 && distance(at, pending.targets[0].at) >= 2 && !occupant(state, at) && !state.obstacles.some(o => equal(o.at, at)));
      if (candidates.length) {
        const at = candidates[Math.floor(roll(state, 'delivery') * candidates.length)];
        target.position = at; target.controlCount++;
        state.events.push(`${target.name}被友情快递送到 ${key(at)}`);
        resolveEntry(state, target, -1, root, canceled);
      }
    }
    state.pending = null; return;
  }
  const source = pending.center ?? caster.position ?? { q: 0, r: 0 };
  const ranked = [...pending.targets].sort((a, b) => distance(b.at, source) - distance(a.at, source)
    || state.roundOrder.indexOf(a.id) - state.roundOrder.indexOf(b.id));
  const maxSteps = Math.max(...ranked.map(t => t.steps));
  for (let wave = 0; wave < maxSteps; wave++) {
    const moved = new Set<string>();
    for (const t of ranked) {
      if (wave >= t.steps || ignored.has(t.id) || canceled.has(t.id) || moved.has(t.id)) continue;
      const player = state.players.find(p => p.id === t.id)!;
      if (!player.position) continue;
      pushOne(state, player, DIRS[t.direction], root, moved, canceled);
    }
  }
  for (const t of pending.targets) if (pending.responses[t.id] === 'mirror' && caster.position) {
    const direction = scale(DIRS[t.direction], -1);
    state.events.push(`${state.players.find(p => p.id === t.id)?.name}反弹了${caster.name}`);
    pushSteps(state, caster, direction, 1, { triggerCount: 0, usedSprings: new Set(), controlled: new Set(), protected: new Set(), hostile: true }, new Set());
  }
  state.pending = null;
  if (pending.cardId === 'time_bomb' || pending.cardId === 'gravity_well') advanceTimed(state);
}
export function expireReactions(previous: GameState): GameState {
  if (!previous.pending) return previous;
  const state = structuredClone(previous);
  for (const id of state.pending!.eligible) if (!state.pending!.responses[id]) state.pending!.responses[id] = 'pass';
  state.events.push('反应窗口到期，未回应的玩家默认跳过');
  resolvePending(state); state.version++;
  if (!state.pending) collectStoppedBoxes(state);
  return state;
}
function playCard(state: GameState, player: Player, action: Extract<GameAction, { type: 'play' }>): string | null {
  if (state.cardAction !== 'none') return '本回合已使用卡牌额度';
  const card = player.hand.find(c => c.instanceId === action.cardInstanceId);
  if (!card) return '手牌实例不存在';
  if (CARDS[card.id].reaction) return '反应牌不能主动使用';
  if (!player.position) return 'OUT玩家不能出牌';
  let targets: PendingEffect['targets'] = [];
  let trapToPlace: Trap | null = null;
  let rocket: { direction: number; length: number } | null = null;
  let barrierAt: Hex | null = null;
  let removeAt: Hex | null = null;
  let dash = false;
  let teleportAt: Hex | null = null;
  let center: Hex | undefined;
  let remoteTrap: Trap | null = null;
  let timedToPlace: TimedDevice | null = null;
  if (card.id === 'laoda_elbow' || card.id === 'punch' || card.id === 'hook') {
    const target = state.players.find(p => p.id === action.targetId && p.id !== player.id && p.position);
    if (!target?.position) return '无效目标';
    const span = distance(player.position, target.position);
    if (card.id === 'laoda_elbow' || card.id === 'punch') {
      if (span !== 1) return card.id === 'laoda_elbow' ? '肘击只能攻击相邻玩家' : '拳头只能攻击相邻玩家';
      const direction = DIRS.findIndex(d => equal(add(player.position!, d), target.position!));
      targets = [{ id: target.id, at: target.position, direction, steps: 2 }];
    } else {
      if (span < 2 || span > 3) return '钩锁射程为2～3格';
      const direction = DIRS.findIndex(d => equal(add(player.position!, scale(d, span)), target.position!));
      if (direction < 0) return '钩锁目标必须在同一条六边形直线上';
      for (let step = 1; step < span; step++) {
        const at = add(player.position, scale(DIRS[direction], step));
        if (occupant(state, at)) return '钩锁路径被挡住';
      }
      targets = [{ id: target.id, at: target.position, direction: (direction + 3) % 6, steps: span - 1 }];
    }
  } else if (card.id === 'air_cannon') {
    if (!Number.isInteger(action.direction) || action.direction! < 0 || action.direction! > 5) return '无效方向';
    const cells = getAirCannonCells(player.position, action.direction!, CONFIG.radius);
    targets = state.players.filter(p => p.id !== player.id && p.position && cells.some(c => equal(c, p.position!))).map(p => ({
      id: p.id, at: p.position!, direction: DIRS.findIndex(d => equal(d, getAirCannonKnockbackDirection(player.position!, p.position!, action.direction!))), steps: 2,
    }));
  } else if (card.id === 'swap' || card.id === 'friend_delivery') {
    const target = state.players.find(p => p.id === action.targetId && p.id !== player.id && p.position);
    if (!target?.position || distance(player.position, target.position) > 3) return '目标不在3格内';
    if (card.id === 'friend_delivery' && !board().some(at => distance(at) >= 2 && distance(at) <= 4 && distance(at, target.position!) >= 2 && !occupant(state, at) && !state.obstacles.some(o => equal(o.at, at)))) return '没有合法快递落点';
    targets = [{ id: target.id, at: target.position, direction: 0, steps: 0 }];
  } else if (card.id === 'magnet') {
    targets = state.players.filter(p => p.id !== player.id && p.position && distance(player.position!, p.position) <= 2).flatMap(p => {
      const before = distance(p.position!, player.position!);
      const direction = DIRS.findIndex(d => {
        const at = add(p.position!, d);
        return !equal(at, player.position!) && distance(at, player.position!) < before;
      });
      return direction < 0 ? [] : [{ id: p.id, at: p.position!, direction, steps: 1 }];
    });
  } else if (card.id === 'quake') {
    center = action.at;
    if (!center || !onBoard(center) || distance(player.position, center) > 3) return '地震中心必须在3格内';
    targets = state.players.filter(p => p.position && distance(p.position, center!) <= 1).map(p => {
      let direction = DIRS.findIndex(d => equal(add(center!, d), p.position!));
      if (direction < 0) {
        let best = -1;
        for (let i = 0; i < 6; i++) {
          const score = distance(add(center!, DIRS[i]));
          if (score > best) { best = score; direction = i; }
        }
      }
      return { id: p.id, at: p.position!, direction, steps: 2 };
    });
  } else if (card.id === 'teleport') {
    if (!action.at || !onBoard(action.at) || (occupant(state, action.at) && !equal(action.at, player.position)) || state.obstacles.some(o => equal(o.at, action.at!))) return '传送终点不合法';
    teleportAt = action.at;
  } else if (card.id === 'swap_storm') {
    if (state.players.length < 3) return '2人局不能使用交换风暴';
    const a = state.players.find(p => p.id === action.targetId && p.id !== player.id && p.position);
    const b = state.players.find(p => p.id === action.secondTargetId && p.id !== player.id && p.id !== a?.id && p.position);
    if (!a?.position || !b?.position) return '必须指定两名不同的其他在场玩家';
    targets = [a, b].map(p => ({ id: p.id, at: p.position!, direction: 0, steps: 0 }));
  } else if (card.id === 'tornado') {
    center = action.at;
    if (!center || !onBoard(center) || distance(player.position, center) > 2) return '龙卷风中心必须在2格内';
    targets = state.players.filter(p => p.position && distance(p.position, center!) === 1)
      .map(p => ({ id: p.id, at: p.position!, direction: 0, steps: 0 }));
  } else if (card.id === 'gathering') {
    targets = state.players.filter(p => p.id !== player.id && p.position)
      .map(p => ({ id: p.id, at: p.position!, direction: 0, steps: 0 }));
  } else if (card.id === 'remote') {
    if (!action.at || distance(player.position, action.at) > 3 || !Number.isInteger(action.direction) || action.direction! < 0 || action.direction! > 5) return '遥控器需要3格内机关和合法方向';
    remoteTrap = state.traps.find(t => equal(t.at, action.at!) && (t.kind === 'spring' || t.kind === 'launch')) ?? null;
    if (!remoteTrap) return '目标不是有方向的弹簧或弹射陷阱';
  } else if (card.id === 'time_bomb' || card.id === 'gravity_well') {
    const at = action.at;
    if (!at || !onBoard(at) || distance(player.position, at) > 2 || occupant(state, at) || state.traps.some(t => equal(t.at, at)) || state.obstacles.some(o => equal(o.at, at)) || state.timed.some(t => equal(t.at, at)) || state.boxes.some(b => equal(b.at, at)) || (state.shop && equal(state.shop.at, at))) return '只能在2格内无玩家的合法空格放置定时机关';
    const owned = [...state.traps.filter(t => t.ownerId === player.id), ...state.obstacles.filter(o => o.ownerId === player.id), ...state.timed.filter(t => t.ownerId === player.id)];
    if (owned.length >= 2 && !owned.some(t => t.id === action.replaceTrapId)) return '已有2个机关，请指定替换的机关';
    timedToPlace = { id: `timed${state.nextId++}`, kind: card.id, at, ownerId: player.id, triggerRound: state.round + 1 };
    if (owned.length >= 2) {
      state.traps = state.traps.filter(t => t.id !== action.replaceTrapId);
      state.obstacles = state.obstacles.filter(o => o.id !== action.replaceTrapId);
      state.timed = state.timed.filter(t => t.id !== action.replaceTrapId);
    }
  } else if (card.id === 'banana' || card.id === 'ice' || card.id === 'launch_trap') {
    const at = action.at;
    if (!at || !onBoard(at) || distance(player.position, at) !== 1 || occupant(state, at) || state.traps.some(t => equal(t.at, at)) || state.obstacles.some(o => equal(o.at, at)) || (state.shop && equal(state.shop.at, at))) return '只能在相邻空格放置陷阱';
    if (card.id === 'launch_trap' && (!Number.isInteger(action.direction) || action.direction! < 0 || action.direction! > 5)) return '弹射陷阱需要合法方向';
    const owned = [...state.traps.filter(t => t.ownerId === player.id), ...state.obstacles.filter(o => o.ownerId === player.id), ...state.timed.filter(t => t.ownerId === player.id)];
    if (owned.length >= 2 && !owned.some(t => t.id === action.replaceTrapId)) return '已有2个机关，请指定替换的机关';
    trapToPlace = { id: `trap${state.nextId++}`, kind: card.id === 'banana' ? 'banana' : card.id === 'ice' ? 'ice' : 'launch', at, direction: action.direction ?? 0, ownerId: player.id };
    if (owned.length >= 2) { state.traps = state.traps.filter(t => t.id !== action.replaceTrapId); state.obstacles = state.obstacles.filter(o => o.id !== action.replaceTrapId); state.timed = state.timed.filter(t => t.id !== action.replaceTrapId); }
  } else if (card.id === 'rocket_boots') {
    if (!Number.isInteger(action.direction) || action.direction! < 0 || action.direction! > 5 || !Number.isInteger(action.length) || action.length! < 1 || action.length! > 4) return '火箭鞋需要方向和1～4格长度';
    rocket = { direction: action.direction!, length: action.length! };
  } else if (card.id === 'supply_dash') dash = true;
  else if (card.id === 'dismantle') {
    if (!action.at || distance(player.position, action.at) > 3 || !onBoard(action.at) || !(
      state.traps.some(t => t.kind !== 'spring' && equal(t.at, action.at!)) || state.obstacles.some(o => equal(o.at, action.at!)) || state.timed.some(t => equal(t.at, action.at!)))) return '3格内没有可拆除的临时机关';
    removeAt = action.at;
  } else if (card.id === 'barricade') {
    const at = action.at;
    if (!at || distance(player.position, at) !== 1 || !onBoard(at) || distance(at) === 0 || CONFIG.starts[state.players.length].some(s => equal(s, at))
      || occupant(state, at) || state.traps.some(t => equal(t.at, at)) || state.obstacles.some(o => equal(o.at, at)) || state.timed.some(t => equal(t.at, at)) || state.boxes.some(b => equal(b.at, at)) || (state.shop && equal(state.shop.at, at))) return '此处不能放置路障';
    const owned = [...state.traps.filter(t => t.ownerId === player.id), ...state.obstacles.filter(o => o.ownerId === player.id), ...state.timed.filter(t => t.ownerId === player.id)];
    if (owned.length >= 2 && !owned.some(t => t.id === action.replaceTrapId)) return '已有2个机关，请指定替换的机关';
    const blocked = new Set(state.obstacles.filter(o => o.id !== action.replaceTrapId).map(o => key(o.at)));
    blocked.add(key(at));
    const passable = board().filter(h => !blocked.has(key(h)));
    const seen = new Set<string>([key(passable[0])]);
    const queue = [passable[0]];
    while (queue.length) {
      const here = queue.shift()!;
      for (const d of DIRS) {
        const next = add(here, d);
        if (onBoard(next) && !blocked.has(key(next)) && !seen.has(key(next))) { seen.add(key(next)); queue.push(next); }
      }
    }
    if (seen.size !== passable.length) return '路障会切断可通行区域';
    barrierAt = at;
  } else return '卡牌尚未实现';
  player.hand = player.hand.filter(c => c.instanceId !== card.instanceId);
  state.discarded.push(card);
  state.cardAction = 'play';
  state.events.push(`${player.name}使用${CARDS[card.id].name}`);
  if (trapToPlace) { state.traps.push(trapToPlace); return null; }
  if (timedToPlace) { state.timed.push(timedToPlace); return null; }
  if (barrierAt) {
    state.traps = state.traps.filter(t => t.id !== action.replaceTrapId);
    state.obstacles = state.obstacles.filter(o => o.id !== action.replaceTrapId);
    state.timed = state.timed.filter(t => t.id !== action.replaceTrapId);
    state.obstacles.push({ id: `wall${state.nextId++}`, at: barrierAt, ownerId: player.id, expiresRound: state.round + 1 });
    return null;
  }
  if (removeAt) {
    state.traps = state.traps.filter(t => t.kind === 'spring' || !equal(t.at, removeAt!));
    state.obstacles = state.obstacles.filter(o => !equal(o.at, removeAt!));
    state.timed = state.timed.filter(t => !equal(t.at, removeAt!));
    return null;
  }
  if (dash) { state.moveAp += 2; return null; }
  if (remoteTrap) {
    remoteTrap.originalDirection ??= remoteTrap.direction;
    remoteTrap.direction = action.direction!;
    remoteTrap.restoreRound = state.round + 1;
    state.events.push(`${player.name}将机关方向改为${action.direction}`);
    return null;
  }
  if (teleportAt) {
    player.position = teleportAt;
    state.events.push(`${player.name}传送至 ${key(teleportAt)}`);
    resolveEntry(state, player, -1, { triggerCount: 0, usedSprings: new Set(), controlled: new Set(), protected: new Set(), hostile: false }, new Set());
    return null;
  }
  if (rocket) {
    const { direction, length } = rocket;
    const root: Root = { triggerCount: 0, usedSprings: new Set(), controlled: new Set(), protected: new Set(), hostile: false };
    for (let i = 0; i < length && player.position; i++) {
      const at = add(player.position, DIRS[direction]);
      if (!onBoard(at) || occupant(state, at) || state.obstacles.some(o => equal(o.at, at))) break;
      player.position = at;
      const canceled = new Set<string>();
      resolveEntry(state, player, direction, root, canceled);
      if (canceled.has(player.id)) break;
    }
    return null;
  }
  if (targets.length === 0) { state.events.push('范围内没有可位移目标'); return null; }
  const eligible = targets.filter(t => {
    const defender = state.players.find(p => p.id === t.id)!;
    return defender.id !== player.id && !defender.reactionUsed && defender.controlCount < 2 && defender.hand.some(c => c.id === 'shield' || c.id === 'dodge' || (['laoda_elbow', 'punch', 'hook', 'air_cannon'].includes(card.id) && c.id === 'mirror'));
  }).map(t => t.id);
  state.pending = { rootId: state.version + 1, casterId: player.id, cardId: card.id as PendingEffect['cardId'], targets, responses: {}, eligible, center, attackDirection: card.id === 'air_cannon' ? action.direction : undefined };
  if (eligible.length === 0) resolvePending(state);
  return null;
}
function react(state: GameState, actorId: string, action: Extract<GameAction, { type: 'react' }>): string | null {
  const pending = state.pending!;
  const defender = state.players.find(p => p.id === actorId)!;
  if (action.choice !== 'pass') {
    if (defender.reactionUsed) return '本大轮反应额度已用';
    if (action.choice === 'mirror' && !['laoda_elbow', 'punch', 'hook', 'air_cannon'].includes(pending.cardId)) return '反弹镜不能反制这张卡';
    const card = defender.hand.find(c => c.instanceId === action.cardInstanceId && c.id === action.choice);
    if (!card) return '没有指定的反应牌';
    if (action.choice === 'dodge') {
      const at = action.dodgeAt;
      if (!at || !defender.position || distance(at, defender.position) !== 1 || !onBoard(at) || occupant(state, at) || state.obstacles.some(o => equal(o.at, at))) return '闪避目标不是相邻合法空格';
      const direction = DIRS.findIndex(d => equal(add(defender.position!, d), at));
      defender.position = at;
      resolveEntry(state, defender, direction, { triggerCount: 0, usedSprings: new Set(), controlled: new Set(), protected: new Set(), hostile: false }, new Set());
    }
    defender.hand = defender.hand.filter(c => c.instanceId !== card.instanceId);
    state.discarded.push(card);
    defender.reactionUsed = true;
  }
  pending.responses[actorId] = action.choice;
  if (pending.eligible.every(id => pending.responses[id])) resolvePending(state);
  return null;
}
export function applyAction(previous: GameState, actorId: string, action: GameAction, now = Date.now()): ActionResult {
  if (previous.phase !== 'playing') return { ok: false, reason: '对局已结束' };
  if (action.type === 'react') {
    if (!previous.pending || !previous.pending.eligible.includes(actorId) || previous.pending.responses[actorId]) return { ok: false, reason: '现在不能反应' };
  } else if (action.type === 'box') {
    if (previous.pending || previous.boxDecisions[0]?.playerId !== actorId) return { ok: false, reason: '现在不能选择盲盒奖励' };
  } else {
    if (previous.pending) return { ok: false, reason: '等待防守方反应' };
    if (previous.boxDecisions.length) return { ok: false, reason: '等待盲盒奖励选择' };
    if (currentPlayer(previous).id !== actorId) return { ok: false, reason: '还没轮到你' };
  }
  const state = structuredClone(previous);
  const player = currentPlayer(state);
  if (action.type === 'move') {
    if (state.ap + state.moveAp < 1) return { ok: false, reason: 'AP不足' };
    if (!Number.isInteger(action.direction) || action.direction < 0 || action.direction > 5) return { ok: false, reason: '方向错误' };
    if (!player.position) return { ok: false, reason: 'OUT玩家不能移动' };
    const to = add(player.position, DIRS[action.direction]);
    if (!onBoard(to)) return { ok: false, reason: '不能主动走出地图' };
    if (state.obstacles.some(o => equal(o.at, to))) return { ok: false, reason: '目标格有路障' };
    if (state.players.some(p => p.id !== player.id && p.position && equal(p.position, to))) return { ok: false, reason: '目标格有人' };
    player.position = to; if (state.moveAp > 0) state.moveAp--; else state.ap--;
    state.events.push(`${player.name}移动至 ${key(to)}`);
    resolveEntry(state, player, action.direction, { triggerCount: 0, usedSprings: new Set(), controlled: new Set(), protected: new Set(), hostile: false }, new Set());
  } else if (action.type === 'draw') {
    if (!player.position) return { ok: false, reason: 'OUT玩家不能抽牌' };
    if (state.cardAction !== 'none') return { ok: false, reason: '本回合已使用卡牌额度' };
    if (player.hand.length >= CONFIG.handLimit) return { ok: false, reason: '手牌已满' };
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot > 3) return { ok: false, reason: '卡位错误' };
    if (state.market.slots[action.slot].instanceId !== action.cardInstanceId) return { ok: false, reason: '卡位已变化' };
    const selected = state.market.slots[action.slot];
    const preview = state.market.nextCard;
    player.hand.push(selected);
    state.market.slots[action.slot] = preview;
    state.market.nextCard = newCard(state, 'market');
    state.cardAction = 'draw';
    state.events.push(`${player.name}从公共卡位${action.slot + 1}抽取${CARDS[selected.id].name}，预览牌补入该位`);
  } else if (action.type === 'play') {
    const failure = playCard(state, player, action);
    if (failure) return { ok: false, reason: failure };
  } else if (action.type === 'react') {
    const failure = react(state, actorId, action);
    if (failure) return { ok: false, reason: failure };
  } else if (action.type === 'box') {
    const failure = decideBox(state, actorId, action);
    if (failure) return { ok: false, reason: failure };
  } else if (action.type === 'buy') {
    const failure = buy(state, player, action);
    if (failure) return { ok: false, reason: failure };
  } else if (action.type === 'end') endTurn(state, now);
  else return { ok: false, reason: '未知操作' };
  if (!state.pending) collectStoppedBoxes(state);
  state.version++;
  return { ok: true, state };
}
export function publicView(state: GameState, playerId: string) {
  const { seed: _seed, random: _random, ...safe } = state;
  void _seed; void _random;
  return { ...safe, players: safe.players.map(p => ({ ...p, hand: p.id === playerId ? p.hand : [], handCount: p.hand.length })) };
}

export function finishGameEarly(previous: GameState, now = Date.now()): GameState {
  if (previous.phase !== 'playing') throw new Error('对局已经结束');
  const state = structuredClone(previous);
  state.phase = 'finished';
  state.finishedAt = now;
  state.pending = null;
  state.boxDecisions = [];
  state.events.push('全体玩家同意提前结束本局，按当前累计积分结算');
  state.version++;
  return state;
}
