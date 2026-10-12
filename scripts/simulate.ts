import { applyAction, createGame, currentPlayer, expireBoxDecision, expireReactions, type GameAction, type GameState } from '../src/core/game';
import { CARDS, type CardId } from '../src/core/cards';
import { add, board, DIRS, distance, equal, onBoard, type Hex } from '../src/core/hex';

const total = Number(process.argv[2] || 1000);
const summary = { games: 0, byPlayers: { 2: 0, 3: 0, 4: 0 }, actions: 0, cards: {} as Record<CardId, number>, draws: 0, boxes: 0, buys: 0, reactions: 0, outs: 0, controlProtection: 0, spawnWins: {} as Record<string, number>, seatWins: {} as Record<string, number>, failedSeeds: [] as number[] };
function random(seed: number) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }
function pick<T>(items: T[], rnd: () => number): T | undefined { return items[Math.floor(rnd() * items.length)]; }
function legalSpace(game: GameState, at: Hex) { return onBoard(at) && !game.players.some(p => p.position && equal(p.position, at)) && !game.obstacles.some(o => equal(o.at, at)); }
function cardAction(game: GameState, rnd: () => number): GameAction | null {
  const player = currentPlayer(game);
  if (!player.position) return null;
  const hand = player.hand.filter(c => !CARDS[c.id].reaction);
  const card = pick(hand, rnd);
  if (!card) return null;
  const others = game.players.filter(p => p.id !== player.id && p.position);
  const nearby = others.filter(p => distance(player.position!, p.position!) <= 3);
  const neighbor = DIRS.map(d => add(player.position!, d)).filter(at => legalSpace(game, at) && !game.traps.some(t => equal(t.at, at)) && !game.timed.some(t => equal(t.at, at)));
  const within2 = board().filter(at => distance(at, player.position!) <= 2 && legalSpace(game, at) && !game.traps.some(t => equal(t.at, at)) && !game.timed.some(t => equal(t.at, at)));
  const base = { type: 'play' as const, cardInstanceId: card.instanceId };
  const owned = [...game.traps, ...game.obstacles, ...game.timed].filter(t => t.ownerId === player.id);
  const replaceTrapId = owned.length >= 2 ? owned[0].id : undefined;
  switch (card.id) {
    case 'laoda_elbow': case 'punch': { const target = pick(others.filter(p => distance(p.position!, player.position!) === 1), rnd); return target ? { ...base, targetId: target.id } : null; }
    case 'hook': { const target = pick(others.filter(p => distance(p.position!, player.position!) >= 2 && distance(p.position!, player.position!) <= 3), rnd); return target ? { ...base, targetId: target.id } : null; }
    case 'swap': case 'friend_delivery': { const target = pick(nearby, rnd); return target ? { ...base, targetId: target.id } : null; }
    case 'swap_storm': return others.length >= 2 ? { ...base, targetId: others[0].id, secondTargetId: others[1].id } : null;
    case 'banana': case 'ice': case 'launch_trap': case 'barricade': { const at = pick(neighbor, rnd); return at ? { ...base, at, direction: Math.floor(rnd() * 6), replaceTrapId } : null; }
    case 'time_bomb': case 'gravity_well': { const at = pick(within2, rnd); return at ? { ...base, at, replaceTrapId } : null; }
    case 'dismantle': { const item = pick([...game.traps.filter(t => t.kind !== 'spring'), ...game.obstacles, ...game.timed].filter(t => distance(t.at, player.position!) <= 3), rnd); return item ? { ...base, at: item.at } : null; }
    case 'remote': { const item = pick(game.traps.filter(t => (t.kind === 'spring' || t.kind === 'launch') && distance(t.at, player.position!) <= 3), rnd); return item ? { ...base, at: item.at, direction: Math.floor(rnd() * 6) } : null; }
    case 'rocket_boots': return { ...base, direction: Math.floor(rnd() * 6), length: 1 + Math.floor(rnd() * 4) };
    case 'air_cannon': return { ...base, direction: Math.floor(rnd() * 6) };
    case 'teleport': { const at = pick(board().filter(h => legalSpace(game, h)), rnd); return at ? { ...base, at } : null; }
    case 'tornado': { const at = pick(board().filter(h => distance(h, player.position!) <= 2), rnd); return at ? { ...base, at } : null; }
    case 'quake': { const at = pick(board().filter(h => distance(h, player.position!) <= 3), rnd); return at ? { ...base, at } : null; }
    default: return base;
  }
}
function verify(game: GameState) {
  const locations = game.players.filter(p => p.position).map(p => `${p.position!.q},${p.position!.r}`);
  if (new Set(locations).size !== locations.length) throw new Error('players overlap');
  if (game.players.some(p => p.position && !onBoard(p.position))) throw new Error('player off board without OUT');
  if (game.players.some(p => p.hand.length > 3)) throw new Error('hand exceeds three');
  if (game.market.slots.length !== 4 || !game.market.nextCard) throw new Error('market shape');
  if (game.boxes.length > 4) throw new Error('too many boxes');
}
for (let seed = 1; seed <= total; seed++) {
  const count = 2 + (seed % 3) as 2 | 3 | 4;
  const rnd = random(seed ^ 0x654321);
  let game = createGame(Array.from({ length: count }, (_, i) => ({ id: `player${i}`, name: `玩家${i}`, color: '#fff' })), seed, 1000 + seed);
  try {
    for (let step = 0; step < 2000 && game.phase === 'playing'; step++) {
      verify(game);
      let actor: string;
      let action: GameAction;
      if (game.pending) {
        const id = game.pending.eligible.find(id => !game.pending!.responses[id]);
        if (!id) { game = expireReactions(game); continue; }
        actor = id;
        const hand = game.players.find(p => p.id === id)!.hand;
        const reaction = pick(hand.filter(c => c.id === 'shield' || c.id === 'mirror'), rnd);
        action = reaction && rnd() < 0.5 ? { type: 'react', choice: reaction.id as 'shield' | 'mirror', cardInstanceId: reaction.instanceId } : { type: 'react', choice: 'pass' };
      } else if (game.boxDecisions.length) {
        actor = game.boxDecisions[0].playerId;
        action = rnd() < 0.5 ? { type: 'box', choice: 'replace', replaceInstanceId: game.players.find(p => p.id === actor)!.hand[0].instanceId } : { type: 'box', choice: 'abandon' };
      } else {
        const player = currentPlayer(game); actor = player.id;
        const purchasable = game.shop && player.position && distance(player.position, game.shop.at) <= 1 && !game.shop.boughtBy.includes(player.id) && game.ap > 0
          ? game.shop.stock.filter(item => item.price <= player.coins) : [];
        if (purchasable.length && rnd() < 0.5) {
          const item = pick(purchasable, rnd)!;
          action = { type: 'buy', cardInstanceId: item.card.instanceId, replaceInstanceId: player.hand.length === 3 ? player.hand[0].instanceId : undefined };
        } else if (game.cardAction === 'none' && rnd() < 0.4 && player.hand.length < 3) action = { type: 'draw', slot: Math.floor(rnd() * 4), cardInstanceId: '' };
        else if (game.cardAction === 'none' && rnd() < 0.6) action = cardAction(game, rnd) ?? { type: 'end' };
        else if (player.position && game.ap + game.moveAp > 0 && rnd() < 0.65) {
          const dirs = DIRS.map((d, i) => ({ i, at: add(player.position!, d) })).filter(x => legalSpace(game, x.at));
          dirs.sort((a, b) => distance(a.at) - distance(b.at));
          action = dirs.length ? { type: 'move', direction: rnd() < 0.8 ? dirs[0].i : pick(dirs, rnd)!.i } : { type: 'end' };
        } else action = { type: 'end' };
      }
      if (action.type === 'draw') action.cardInstanceId = game.market.slots[action.slot].instanceId;
      const beforeMarket = JSON.stringify(game.market);
      let result = applyAction(game, actor, action, 1000 + seed + step);
      if (!result.ok) {
        if (game.pending) { action = { type: 'react', choice: 'pass' }; result = applyAction(game, actor, action, 1000 + seed + step); }
        else if (game.boxDecisions.length) { game = expireBoxDecision(game); continue; }
        else { action = { type: 'end' }; result = applyAction(game, actor, action, 1000 + seed + step); }
      }
      if (!result.ok) throw new Error(`action fallback failed: ${result.reason}`);
      game = result.state;
      if (action.type !== 'draw' && JSON.stringify(game.market) !== beforeMarket) throw new Error('market changed without draw');
      summary.actions++;
      if (action.type === 'draw') summary.draws++;
      if (action.type === 'play') summary.cards[game.discarded.at(-1)!.id] = (summary.cards[game.discarded.at(-1)!.id] || 0) + 1;
      if (action.type === 'react') summary.reactions++;
      if (action.type === 'buy') summary.buys++;
    }
    verify(game);
    if (game.phase !== 'finished') throw new Error('match did not finish');
    summary.games++; summary.byPlayers[count]++;
    summary.outs += game.events.filter(e => e.includes('进入OUT')).length;
    summary.controlProtection += game.events.filter(e => e.includes('受控保护')).length;
    summary.boxes += game.events.filter(e => e.includes('打开盲盒')).length;
    const winner = [...game.players].sort((a, b) => b.score - a.score || distance(a.position ?? { q: 99, r: 99 }) - distance(b.position ?? { q: 99, r: 99 }) || b.coins - a.coins)[0];
    const spawn = `${winner.spawn.q},${winner.spawn.r}`;
    const seat = String(game.baseOrder.indexOf(winner.id));
    summary.spawnWins[spawn] = (summary.spawnWins[spawn] || 0) + 1;
    summary.seatWins[seat] = (summary.seatWins[seat] || 0) + 1;
  } catch (error) {
    summary.failedSeeds.push(seed);
    console.error(`seed=${seed}, players=${count}, round=${game.round}, turn=${game.turnId}:`, error);
    if (summary.failedSeeds.length >= 5) break;
  }
}
console.log(JSON.stringify(summary, null, 2));
if (summary.failedSeeds.length || summary.games !== total) process.exitCode = 1;
