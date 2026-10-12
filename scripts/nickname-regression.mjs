import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

process.env.PORT = '3004';
const { server } = await import('../dist/server/index.js');
const url = 'http://localhost:3004';
const connect = () => io(url, { forceNew: true });
const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5000);
  socket.emit(event, ...(payload === undefined ? [] : [payload]), response => { clearTimeout(timer); resolve(response); });
});
const wait = async predicate => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('state timeout');
};
const clients = Array.from({ length: 7 }, connect);
const states = Array(7).fill(null);
clients.forEach((client, index) => client.on('state', state => { states[index] = state; }));
try {
  const host = await ack(clients[0], 'create', {});
  assert.equal(host.ok, true);
  await wait(() => states[0]?.seats?.length === 1);
  assert.equal(states[0].seats[0].name, '神秘牢大1');
  const identities = [host];
  for (let index = 1; index < 6; index++) {
    const joined = await ack(clients[index], 'join', { code: host.code, name: '' });
    assert.equal(joined.ok, true, joined.reason);
    identities.push(joined);
    await wait(() => states[0]?.seats?.length === index + 1);
    assert.equal(states[0].seats[index].name, `神秘牢大${index + 1}`);
  }
  assert.equal((await ack(clients[6], 'join', { code: host.code, name: '' })).ok, false, 'seventh seat was accepted');
  assert.equal((await ack(clients[2], 'room:leave')).ok, true);
  await wait(() => states[0].seats.length === 5);
  const duplicate = await ack(clients[6], 'join', { code: host.code, name: '神秘牢大1' });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, 'DUPLICATE_NAME');
  const replacement = await ack(clients[6], 'join', { code: host.code, name: '' });
  assert.equal(replacement.ok, true);
  identities[2] = replacement;
  await wait(() => states[0].seats.length === 6);
  assert.equal(states[0].seats.at(-1).name, '神秘牢大3');
  const resumed = connect();
  resumed.on('state', state => { states[4] = state; });
  assert.equal((await ack(resumed, 'resume', { code: host.code, token: identities[4].token })).ok, true);
  clients[4].disconnect(); clients[4] = resumed;
  await wait(() => states[4]?.you === identities[4].playerId);
  assert.equal(states[4].seats.find(seat => seat.id === identities[4].playerId).name, '神秘牢大5');
  assert.equal((await ack(clients[1], 'settings:rounds', { rounds: 2 })).ok, false, 'non-host changed rounds');
  assert.equal((await ack(clients[0], 'settings:rounds', { rounds: 2 })).ok, true);
  await wait(() => states[0]?.rounds === 2);
  for (const index of [0, 1, 3, 4, 5, 6]) assert.equal((await ack(clients[index], 'ready')).ok, true);
  assert.equal((await ack(clients[0], 'start')).ok, true);
  await wait(() => states[0]?.game?.maxRounds === 2);
  const names = states[0].game.players.map(player => player.name).sort();
  assert.deepEqual(names, Array.from({ length: 6 }, (_, index) => `神秘牢大${index + 1}`));
  while (states[0].game.phase === 'playing') {
    const game = states[0].game;
    const actorId = game.roundOrder[game.turnIndex];
    const clientIndex = identities.findIndex(identity => identity?.playerId === actorId);
    const result = await ack(clients[clientIndex === 2 ? 6 : clientIndex], 'action', {
      requestId: crypto.randomUUID(), matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version, action: { type: 'end' },
    });
    assert.equal(result.ok, true, result.reason);
    await wait(() => states[0].game.version === game.version + 1);
  }
  assert.equal((await ack(clients[0], 'rematch')).ok, true);
  await wait(() => states[0]?.game === null);
  assert.deepEqual(states[0].seats.map(seat => seat.name).sort(), names);
  const customHost = connect(), customGuest = connect();
  try {
    const custom = await ack(customHost, 'create', { name: '自定义玩家' });
    assert.equal(custom.ok, true);
    const repeated = await ack(customGuest, 'join', { code: custom.code, name: '自定义玩家' });
    assert.equal(repeated.ok, false);
    assert.equal(repeated.code, 'DUPLICATE_NAME');
    const unique = await ack(customGuest, 'join', { code: custom.code, name: '另一位玩家' });
    assert.equal(unique.ok, true);
  } finally { customHost.disconnect(); customGuest.disconnect(); }
  console.log('OK: six default nicknames, duplicate rejection, smallest-number reuse, reconnect, host rounds, finish, rematch');
} finally {
  clients.forEach(client => client.disconnect());
  server.close();
}
