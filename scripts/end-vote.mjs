import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import { io } from 'socket.io-client';

process.env.PORT = '3012';
process.env.GAME_HOST = '0.0.0.0';
const { server, io: serverIo } = await import('../dist/server/index.js');
const lan = Object.values(networkInterfaces()).flatMap(items => items || []).find(item => item.family === 'IPv4' && !item.internal)?.address;
const endpoints = ['http://127.0.0.1:3012', ...(lan ? [`http://${lan}:3012`] : [])];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async predicate => { for (let i = 0; i < 500; i++) { if (predicate()) return; await pause(10); } throw new Error('状态同步超时'); };
const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${event} ACK 超时`)), 5000);
  const done = value => { clearTimeout(timeout); resolve(value); };
  if (payload === undefined) socket.emit(event, done); else socket.emit(event, payload, done);
});
const request = (socket, game, action, requestId = crypto.randomUUID()) => ack(socket, 'action', { requestId, matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version, action });
const vote = (socket, choice, requestId = crypto.randomUUID()) => ack(socket, 'finish:vote', { requestId, choice });
const clients = [];

async function run(count, endpoint) {
  const states = Array(count).fill(null);
  const closed = Array(count).fill(false);
  const sockets = Array.from({ length: count }, (_, i) => {
    const client = io(endpoint, { forceNew: true, timeout: 5000, reconnection: false });
    clients.push(client);
    client.on('state', state => { states[i] = state; });
    client.on('room:closed', () => { closed[i] = true; });
    return client;
  });
  const identity = [await ack(sockets[0], 'create', { name: '本机房主' })];
  assert.equal(identity[0].ok, true);
  for (let i = 1; i < count; i++) identity.push(await ack(sockets[i], 'join', { code: identity[0].code, name: `局域网访客${i}` }));
  assert.ok(identity.every(value => value.ok));
  await wait(() => states.every(state => state?.seats.length === count));
  for (const socket of sockets) assert.equal((await ack(socket, 'ready')).ok, true);
  assert.equal((await ack(sockets[0], 'start')).ok, true);
  await wait(() => states.every(state => state?.game?.phase === 'playing'));

  // Both host and guest use their own identity; normal actions remain turn-gated.
  const first = states[0].game;
  const firstIndex = identity.findIndex(item => item.playerId === first.roundOrder[first.turnIndex]);
  const invalid = await request(sockets[(firstIndex + 1) % count], states[(firstIndex + 1) % count].game, { type: 'end' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'RULE_REJECTED');
  assert.ok(invalid.reason);
  assert.equal((await request(sockets[firstIndex], first, { type: 'end' })).ok, true);
  await wait(() => states.every(state => state.game.version > first.version));

  const beforeDraw = states[0].game;
  const actorIndex = identity.findIndex(item => item.playerId === beforeDraw.roundOrder[beforeDraw.turnIndex]);
  // Draw while the starting hand has space. Moving may legitimately collect a
  // random box; the old fixture mistook that full-hand rejection for a failure.
  const card = beforeDraw.market.slots[0];
  assert.equal((await request(sockets[actorIndex], beforeDraw, { type: 'draw', slot: 0, cardInstanceId: card.instanceId })).ok, true);
  await wait(() => states.every(state => state.game.version > beforeDraw.version));
  const current = states[0].game;
  const actor = states[actorIndex].game.players.find(player => player.id === identity[actorIndex].playerId);
  const dirs = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
  const occupied = new Set(states[actorIndex].game.players.filter(player => player.position).map(player => `${player.position.q},${player.position.r}`));
  const direction = dirs.findIndex(dir => {
    const q = actor.position.q + dir.q, r = actor.position.r + dir.r;
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4 && !occupied.has(`${q},${r}`)
      && !current.obstacles.some(item => item.at.q === q && item.at.r === r)
      && !current.traps.some(item => item.at.q === q && item.at.r === r);
  });
  assert.ok(direction >= 0);
  const moved = await request(sockets[actorIndex], current, { type: 'move', direction });
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(moved.requestId.length > 0, true);
  await wait(() => states.every(state => state.game.version > current.version));
  const afterMove = states[actorIndex].game;
  if (afterMove.boxDecisions.length) {
    assert.equal((await request(sockets[actorIndex], afterMove, { type: 'box', choice: 'abandon' })).ok, true);
    await wait(() => states.every(state => state.game.version > afterMove.version));
  }
  const beforeEnd = states[actorIndex].game;
  assert.equal((await request(sockets[actorIndex], beforeEnd, { type: 'end' })).ok, true);
  await wait(() => states.every(state => state.game.version > beforeEnd.version));

  // Any participant can initiate; a vote never prevents ordinary turn actions.
  const initiator = count - 1;
  const startId = crypto.randomUUID();
  assert.equal((await vote(sockets[initiator], 'start', startId)).ok, true);
  assert.equal((await vote(sockets[initiator], 'start', startId)).ok, true);
  await wait(() => states.every(state => state.vote?.initiatedBy === identity[initiator].playerId));
  const during = states[0].game;
  const duringIndex = identity.findIndex(item => item.playerId === during.roundOrder[during.turnIndex]);
  assert.equal((await request(sockets[duringIndex], during, { type: 'end' })).ok, true);
  await wait(() => states.every(state => state.game.version > during.version));
  assert.ok(states[0].vote);
  assert.equal((await vote(sockets[initiator], 'cancel')).ok, true);
  await wait(() => states.every(state => state.vote === null));

  const rejecter = initiator === 0 ? 1 : 0;
  assert.equal((await vote(sockets[initiator], 'start')).ok, true);
  assert.equal((await vote(sockets[rejecter], 'reject')).ok, true);
  await wait(() => states.every(state => state.vote === null && state.game.phase === 'playing'));

  assert.equal((await vote(sockets[initiator], 'start')).ok, true);
  await wait(() => states.every(state => state.vote));
  const offlineIndex = rejecter;
  sockets[offlineIndex].disconnect();
  await wait(() => states[initiator].seats[offlineIndex].online === false);
  assert.equal(states[initiator].vote.responses[identity[offlineIndex].playerId], undefined);
  await pause(200);
  assert.equal(states[initiator].game.phase, 'playing');
  const replacement = io(endpoint, { forceNew: true, timeout: 5000, reconnection: false });
  clients.push(replacement);
  replacement.on('state', state => { states[offlineIndex] = state; });
  replacement.on('room:closed', () => { closed[offlineIndex] = true; });
  assert.equal((await ack(replacement, 'resume', { code: identity[0].code, token: identity[offlineIndex].token })).ok, true);
  sockets[offlineIndex] = replacement;
  await wait(() => states.every(state => state.seats[offlineIndex].online));
  const score = states[0].game.players.map(player => player.score);
  const round = states[0].game.round;
  let finalVoteId = '';
  let finalVoter = -1;
  for (let i = 0; i < count; i++) if (i !== initiator) {
    finalVoteId = crypto.randomUUID(); finalVoter = i;
    assert.equal((await vote(sockets[i], 'agree', finalVoteId)).ok, true);
  }
  await wait(() => states.every(state => state.game.phase === 'finished' && state.stage === 'GAME_OVER'));
  assert.equal(states[0].finishReason, 'vote');
  assert.deepEqual(states[0].game.players.map(player => player.score), score);
  assert.equal(states[0].game.round, round);
  assert.equal((await vote(sockets[finalVoter], 'agree', finalVoteId)).ok, true, '重复最终同意请求应命中 ACK 缓存');
  assert.equal(states[0].game.version, states[1].game.version);
  assert.equal((await request(sockets[0], states[0].game, { type: 'end' })).code, 'GAME_OVER');
  assert.equal((await ack(sockets[0], 'rematch')).ok, true);
  await wait(() => states.every(state => state.game === null));
  for (const socket of sockets) assert.equal((await ack(socket, 'ready')).ok, true);
  assert.equal((await ack(sockets[0], 'start')).ok, true);
  await wait(() => states.every(state => state.game?.phase === 'playing'));
  assert.equal((await ack(sockets[0], 'room:close')).ok, true);
  await wait(() => closed.every(Boolean));
  assert.equal((await ack(sockets[1], 'ready')).ok, false);
  console.log(`OK ${count} players via ${endpoint}: identity, ACK, move/draw/end, vote, offline seat, rematch, close`);
}

try {
  await wait(() => server.listening);
  for (const count of [2, 3, 4]) await run(count, endpoints[Math.min(1, endpoints.length - 1)]);
  console.log(`LAN interface discovered: ${lan || 'none; localhost only'}`);
} finally {
  clients.forEach(client => client.disconnect());
  await new Promise(resolve => serverIo.close(resolve));
}
