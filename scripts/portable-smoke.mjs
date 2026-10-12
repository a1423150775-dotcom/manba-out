import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = process.env.GAME_URL || 'http://127.0.0.1:3000';
const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} 响应超时`)), 5000);
  const done = result => { clearTimeout(timer); resolve(result); };
  if (payload === undefined) socket.emit(event, done); else socket.emit(event, payload, done);
});
const wait = async predicate => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('状态广播超时');
};
const neighbors = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
const nearby = at => neighbors.map(d => ({ q: at.q + d.q, r: at.r + d.r }));
const distance = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
const playCandidates = (card, player, game) => {
  const base = { type: 'play', cardInstanceId: card.instanceId };
  if (['supply_dash', 'air_cannon', 'magnet', 'gathering', 'tornado', 'quake', 'teleport'].includes(card.id)) {
    if (card.id === 'air_cannon') return [{ ...base, direction: 0 }];
    if (['tornado', 'quake', 'teleport'].includes(card.id)) return [{ ...base, at: player.position }];
    return [base];
  }
  if (['banana', 'ice', 'barricade', 'launch_trap', 'time_bomb', 'gravity_well'].includes(card.id))
    return nearby(player.position).map(at => ({ ...base, at, direction: 0 }));
  if (card.id === 'rocket_boots') return neighbors.map((_, direction) => ({ ...base, direction, length: 1 }));
  if (['laoda_elbow', 'punch', 'hook', 'swap', 'friend_delivery'].includes(card.id))
    return game.players.filter(p => p.id !== player.id && p.position).map(p => ({ ...base, targetId: p.id }));
  return [];
};

async function match(count) {
  const clients = Array.from({ length: count }, () => io(url, { forceNew: true, reconnection: false }));
  const states = Array(count).fill(null);
  clients.forEach((client, index) => client.on('state', state => { states[index] = state; }));
  let movedByGuest = false, drew = false, playedByGuest = false, turns = 0;
  try {
    const identities = [await ack(clients[0], 'create', { name: '便携房主' })];
    assert.equal(identities[0].ok, true, identities[0].reason);
    for (let i = 1; i < count; i++) {
      const joined = await ack(clients[i], 'join', { code: identities[0].code, name: `便携玩家${i}` });
      assert.equal(joined.ok, true, joined.reason);
      identities.push(joined);
    }
    for (const client of clients) assert.equal((await ack(client, 'ready')).ok, true);
    assert.equal((await ack(clients[0], 'start')).ok, true);
    await wait(() => states.every(state => state?.game));
    assert.ok(states.every(state => !state.timedTurns && state.stage === 'ACTION'));

    async function act(index, action) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const game = states[index].game;
        const result = await ack(clients[index], 'action', {
          requestId: randomUUID(), matchId: game.matchId, turnId: game.turnId,
          expectedVersion: game.version, action,
        });
        if (!result.ok && /请求过于频繁/.test(result.reason || '')) {
          await new Promise(resolve => setTimeout(resolve, 10_100));
          continue;
        }
        if (result.ok) await wait(() => states.every(state => state.game.version > game.version));
        return result;
      }
      throw new Error('限速等待后仍未能提交操作');
    }

    while (states[0].game.phase === 'playing') {
      let game = states[0].game;
      if (game.pending) {
        const defender = game.pending.eligible.find(id => !game.pending.responses[id]);
        assert.ok(defender, '反应阶段没有待回应玩家');
        const index = identities.findIndex(x => x.playerId === defender);
        assert.equal((await act(index, { type: 'react', choice: 'pass' })).ok, true);
        continue;
      }
      if (game.boxDecisions.length) {
        const index = identities.findIndex(x => x.playerId === game.boxDecisions[0].playerId);
        assert.equal((await act(index, { type: 'box', choice: 'abandon' })).ok, true);
        continue;
      }
      const index = identities.findIndex(x => x.playerId === game.roundOrder[game.turnIndex]);
      assert.ok(index >= 0);
      if (index > 0 && (!movedByGuest || !playedByGuest) && game.ap > 0) {
        for (let step = 0; step < 3; step++) {
          game = states[index].game;
          const mover = game.players.find(p => p.id === identities[index].playerId);
          if (!mover.position || game.ap + game.moveAp === 0 || game.pending || game.boxDecisions.length) break;
          const opponents = game.players.filter(p => p.id !== mover.id && p.position);
          if (!opponents.length) break;
          const nearest = Math.min(...opponents.map(p => distance(mover.position, p.position)));
          if (movedByGuest && nearest <= 1) break;
          const order = neighbors.map((offset, direction) => ({
            direction,
            score: Math.min(...opponents.map(p => distance({ q: mover.position.q + offset.q, r: mover.position.r + offset.r }, p.position))),
          })).sort((a, b) => a.score - b.score);
          let moved = false;
          for (const candidate of order) {
            if (movedByGuest && candidate.score >= nearest) continue;
            if ((await act(index, { type: 'move', direction: candidate.direction })).ok) { moved = true; movedByGuest = true; break; }
          }
          if (!moved) break;
        }
        assert.ok(movedByGuest, '非房主未能合法移动');
      }
      game = states[index].game;
      if (game.pending || game.boxDecisions.length) continue;
      const player = game.players.find(p => p.id === identities[index].playerId);
      if (!playedByGuest && index > 0 && game.cardAction === 'none' && player.position) {
        outer: for (const card of player.hand) for (const candidate of playCandidates(card, player, game)) {
          if ((await act(index, candidate)).ok) { playedByGuest = true; break outer; }
        }
      }
      game = states[index].game;
      if (game.pending || game.boxDecisions.length) continue;
      if (!drew && game.cardAction === 'none' && player.position && player.hand.length < 3) {
        const card = game.market.slots[0];
        const preview = game.market.nextCard;
        assert.equal((await act(index, { type: 'draw', slot: 0, cardInstanceId: card.instanceId })).ok, true);
        assert.equal(states[index].game.market.slots[0].instanceId, preview.instanceId);
        drew = true;
      }
      game = states[index].game;
      const ended = await act(index, { type: 'end' });
      assert.equal(ended.ok, true, ended.reason);
      turns++;
      assert.ok(turns <= count * game.maxRounds, '对局回合数过多');
    }
    assert.equal(turns, count * states[0].game.maxRounds);
    assert.ok(movedByGuest && drew, '非房主移动或抽牌未完成');
    assert.equal((await ack(clients[0], 'rematch')).ok, true);
    await wait(() => states.every(state => state.game === null));
    console.log(`OK ${count}人：${turns}回合；非房主移动、抽牌、终局及再来一局通过；非房主出牌=${playedByGuest}`);
    return playedByGuest;
  } finally { clients.forEach(client => client.disconnect()); }
}

let playedByGuest = false;
for (const count of [2, 3, 4]) playedByGuest = await match(count) || playedByGuest;
for (let retry = 0; !playedByGuest && retry < 5; retry++) playedByGuest = await match(2);
assert.ok(playedByGuest, '重复多局后仍未能验证非房主主动出牌');
