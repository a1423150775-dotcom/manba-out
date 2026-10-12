import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

process.env.PORT = '3002';
const { server } = await import('../dist/server/index.js');
const url = 'http://localhost:3002';
const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5000);
  const done = value => { clearTimeout(timer); resolve(value); };
  if (payload === undefined) socket.emit(event, done); else socket.emit(event, payload, done);
});
const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('state timeout'); };
async function match(count) {
  const clients = Array.from({ length: count }, () => io(url, { forceNew: true }));
  const states = Array(count).fill(null);
  const stages = [];
  clients.forEach((client, i) => client.on('state', s => { states[i] = s; stages.push(s.stage); }));
  try {
    const identities = [await ack(clients[0], 'create', { name: '浏览器甲' })];
    assert.equal(identities[0].ok, true);
    for (let i = 1; i < count; i++) {
      const joined = await ack(clients[i], 'join', { code: identities[0].code, name: `玩家${i}` });
      assert.equal(joined.ok, true);
      identities.push(joined);
    }
    for (const client of clients) assert.equal((await ack(client, 'ready')).ok, true);
    assert.equal((await ack(clients[0], 'start')).ok, true);
    await wait(() => states.every(s => s?.game));
    assert.ok(states.every(s => s.timedTurns === false && s.deadline === null && s.stage === 'ACTION'));
    assert.ok(states.every(s => s.game.players.every(player => player.hand.every(card => card.id === 'laoda_elbow'))));
    assert.ok(states.every(s => [...s.game.market.slots, s.game.market.nextCard].every(card => card.id === 'laoda_elbow')));
    const actor = states[0].game.roundOrder[0];
    const first = identities.findIndex(x => x.playerId === actor);
    const initial = states[first].game;
    const card = initial.market.slots[1];
    const preview = initial.market.nextCard;
    const request = { requestId: crypto.randomUUID(), matchId: initial.matchId, turnId: initial.turnId, expectedVersion: initial.version, action: { type: 'draw', slot: 1, cardInstanceId: card.instanceId } };
    assert.equal((await ack(clients[first], 'action', request)).ok, true);
    assert.equal((await ack(clients[first], 'action', request)).ok, true);
    await wait(() => states.every(s => s.game.version === initial.version + 1));
    assert.equal(states[0].game.market.slots[1].instanceId, preview.instanceId);
    const replacement = io(url, { forceNew: true });
    replacement.on('state', s => { states[first] = s; });
    assert.equal((await ack(replacement, 'resume', { code: identities[0].code, token: identities[first].token })).ok, true);
    clients[first].disconnect();
    clients[first] = replacement;
    await wait(() => states[first]?.game?.version === initial.version + 1);
    assert.equal((await ack(replacement, 'action', request)).ok, true);
    assert.equal(states[first].game.version, initial.version + 1, 'reconnect replayed the previous draw');
    let turns = 0;
    while (states[0].game.phase === 'playing') {
      const game = states[0].game;
      const i = identities.findIndex(x => x.playerId === game.roundOrder[game.turnIndex]);
      const response = await ack(clients[i], 'action', { requestId: crypto.randomUUID(), matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version, action: { type: 'end' } });
      assert.equal(response.ok, true, response.reason);
      await wait(() => states[0].game.version === game.version + 1);
      turns++;
      if (turns > count * game.maxRounds) throw new Error('too many turns');
    }
    assert.equal(turns, count * initial.maxRounds);
    await wait(() => states.every(s => s.stage === 'GAME_OVER'));
    assert.ok(stages.includes('ROUND_SUMMARY'), 'round summary stage not broadcast');
    assert.ok(stages.includes('GAME_OVER'), 'game over stage not broadcast');
    assert.equal((await ack(clients[0], 'rematch')).ok, true);
    await wait(() => states.every(s => s?.game === null));
    assert.ok(states.every(s => s.seats.every(seat => !seat.ready)));
    for (const client of clients) assert.equal((await ack(client, 'ready')).ok, true);
    assert.equal((await ack(clients[0], 'start')).ok, true);
    await wait(() => states.every(s => s?.game?.matchId && s.game.matchId !== initial.matchId));
    assert.equal(states[0].game.phase, 'playing');
    console.log(`OK ${count} players: ${turns} turns; duplicate draw, reconnect and rematch verified`);
  } finally { clients.forEach(c => c.disconnect()); }
}
try { for (const count of [2, 3, 4, 5, 6]) await match(count); } finally { server.close(); }
