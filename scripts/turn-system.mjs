import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

process.env.PORT = '3003';
process.env.NODE_ENV = 'development';
process.env.DEBUG_SCENARIOS = '1';
const { server } = await import('../dist/server/index.js');
const url = process.env.GAME_TEST_URL || 'http://127.0.0.1:3003';
const hostUrl = process.env.GAME_HOST_TEST_URL || url;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async predicate => { for (let i = 0; i < 300; i++) { if (predicate()) return; await pause(10); } throw new Error('state timeout'); };
const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 5000);
  const done = value => { clearTimeout(timer); resolve(value); };
  if (payload === undefined) socket.emit(event, done); else socket.emit(event, payload, done);
});
const request = (socket, game, action) => ack(socket, 'action', { requestId: crypto.randomUUID(), matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version, action });
const makeClient = (states, stages, index) => {
  const client = io(index === 0 ? hostUrl : url, { forceNew: true });
  client.on('state', state => { states[index] = state; stages.push(state.stage); });
  return client;
};
const states = [null, null], stages = [], clients = [makeClient(states, stages, 0), makeClient(states, stages, 1)];
try {
  const host = await ack(clients[0], 'create', { name: '房主' });
  const guest = await ack(clients[1], 'join', { code: host.code, name: '非房主' });
  const advanceTo = async playerId => {
    for (let guard = 0; guard < 4 && states[0].game.roundOrder[states[0].game.turnIndex] !== playerId; guard++) {
      const game = states[0].game;
      const actor = game.roundOrder[game.turnIndex];
      const client = clients[actor === host.playerId ? 0 : 1];
      const result = await request(client, game, { type: 'end' });
      assert.equal(result.ok, true, result.reason);
      await wait(() => states[0].game.version > game.version);
    }
    assert.equal(states[0].game.roundOrder[states[0].game.turnIndex], playerId);
  };
  assert.equal(host.ok && guest.ok, true);
  assert.equal(states[0].timedTurns, false);
  assert.equal((await ack(clients[1], 'settings:timed', { enabled: true })).ok, false);
  for (const client of clients) assert.equal((await ack(client, 'ready')).ok, true);
  assert.equal((await ack(clients[0], 'start')).ok, true);
  await wait(() => states.every(s => s?.game));
  assert.equal(states[0].stage, 'ACTION');
  assert.equal(states[0].deadline, null);
  const initialTurn = states[0].game.turnId;
  const initialVersion = states[0].game.version;
  if (!process.argv.includes('--skip-long-wait')) await pause(41500);
  assert.equal(states[0].game.turnId, initialTurn, 'unlimited turn changed during 40s wait');
  assert.equal(states[0].game.version, initialVersion, 'unlimited game advanced during 40s wait');
  if (!process.argv.includes('--skip-long-wait')) console.log('OK unlimited ACTION remains unchanged after 41.5s');

  if (states[0].game.roundOrder[states[0].game.turnIndex] === host.playerId) {
    const game = states[0].game;
    assert.equal((await request(clients[0], game, { type: 'end' })).ok, true);
    await wait(() => states[0].game.turnId !== game.turnId);
  }
  assert.equal(states[0].game.roundOrder[states[0].game.turnIndex], guest.playerId);
  const guestGame = states[1].game;
  assert.equal((await request(clients[0], guestGame, { type: 'end' })).ok, false);
  clients[0].disconnect();
  await wait(() => states[1].seats[0].online === false);
  const dirs = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
  const at = states[1].game.players.find(p => p.id === guest.playerId).position;
  const occupied = states[1].game.players.filter(p => p.position).map(p => `${p.position.q},${p.position.r}`);
  const direction = dirs.findIndex(d => { const q = at.q + d.q, r = at.r + d.r; return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4 && !occupied.includes(`${q},${r}`) && !states[1].game.obstacles.some(o => o.at.q === q && o.at.r === r) && !states[1].game.boxes.some(b => b.at.q === q && b.at.r === r); });
  assert.ok(direction >= 0);
  assert.equal((await request(clients[1], states[1].game, { type: 'move', direction })).ok, true);
  await wait(() => states[1].game.version > guestGame.version);
  const drawGame = states[1].game;
  const card = drawGame.market.slots[0];
  assert.equal((await request(clients[1], drawGame, { type: 'draw', slot: 0, cardInstanceId: card.instanceId })).ok, true);
  await wait(() => states[1].game.version > drawGame.version);
  assert.equal(states[1].game.cardAction, 'draw');
  assert.equal((await request(clients[1], states[1].game, { type: 'play', cardInstanceId: states[1].game.players.find(p => p.id === guest.playerId).hand[0].instanceId })).ok, false);
  const beforeGuestEnd = states[1].game;
  assert.equal((await request(clients[1], beforeGuestEnd, { type: 'end' })).ok, true);
  await wait(() => states[1].game.version > beforeGuestEnd.version);
  console.log('OK non-host move, draw, end while host offline; ordinary action rejected for waiting player');

  clients[0] = makeClient(states, stages, 0);
  assert.equal((await ack(clients[0], 'resume', { code: host.code, token: host.token })).ok, true);
  await wait(() => states[0]?.game?.version === states[1].game.version);
  assert.equal(states[0].stage, 'ACTION');
  await advanceTo(guest.playerId);

  const patch = (hands) => ({ positions: { [guest.playerId]: { q: 0, r: 0 }, [host.playerId]: { q: 1, r: 0 } }, hands, traps: [], boxes: [], shopAt: null, ap: 3 });
  assert.equal((await ack(clients[0], 'debug:patch', { expectedVersion: states[0].game.version, patch: patch({ [guest.playerId]: ['air_cannon'], [host.playerId]: ['shield'] }) })).ok, true);
  await wait(() => states[1].game.players.find(p => p.id === guest.playerId).hand[0]?.id === 'air_cannon');
  const cannon = states[1].game.players.find(p => p.id === guest.playerId).hand[0];
  assert.equal((await request(clients[1], states[1].game, { type: 'play', cardInstanceId: cannon.instanceId, direction: 0 })).ok, true);
  await wait(() => states[0].stage === 'REACTION');
  assert.equal(states[0].reactionDeadline, null);
  assert.equal(states[0].game.pending.attackDirection, 0);
  const reactionVersion = states[0].game.version;
  await pause(6200);
  assert.equal(states[0].stage, 'REACTION');
  assert.equal(states[0].game.version, reactionVersion);
  const shield = states[0].game.players.find(p => p.id === host.playerId).hand[0];
  assert.equal((await request(clients[0], states[0].game, { type: 'react', choice: 'shield', cardInstanceId: shield.instanceId })).ok, true);
  await wait(() => !states[0].game.pending && states[0].stage === 'ACTION');
  assert.ok(stages.includes('RESOLUTION'));
  console.log('OK non-host play, opponent reaction, and unlimited REACTION wait');

  await advanceTo(host.playerId);
  assert.equal((await ack(clients[0], 'debug:patch', { expectedVersion: states[0].game.version, patch: { positions: { [host.playerId]: { q: 0, r: 0 }, [guest.playerId]: { q: 1, r: 0 } }, hands: { [host.playerId]: ['air_cannon'], [guest.playerId]: ['shield'] }, traps: [], boxes: [], shopAt: null, ap: 3 } })).ok, true);
  await wait(() => states[0].game.players.find(p => p.id === host.playerId).hand[0]?.id === 'air_cannon');
  const hostCannon = states[0].game.players.find(p => p.id === host.playerId).hand[0];
  assert.equal((await request(clients[0], states[0].game, { type: 'play', cardInstanceId: hostCannon.instanceId, direction: 0 })).ok, true);
  await wait(() => states[1].stage === 'REACTION');
  clients[1].disconnect();
  await pause(500);
  assert.equal(states[0].stage, 'REACTION');
  clients[1] = makeClient(states, stages, 1);
  assert.equal((await ack(clients[1], 'resume', { code: host.code, token: guest.token })).ok, true);
  await wait(() => states[1].stage === 'REACTION');
  const guestShield = states[1].game.players.find(p => p.id === guest.playerId).hand[0];
  assert.equal((await request(clients[1], states[1].game, { type: 'react', choice: 'shield', cardInstanceId: guestShield.instanceId })).ok, true);
  await wait(() => states[1].stage === 'ACTION' && !states[1].game.pending);
  console.log('OK non-host reaction after reconnect; host identity does not govern reaction permission');

  const timed = await ack(clients[0], 'create', { name: '限时房主' });
  const timedGuest = await ack(clients[1], 'join', { code: timed.code, name: '限时客人' });
  assert.equal(timedGuest.ok, true);
  assert.equal((await ack(clients[0], 'settings:timed', { enabled: true })).ok, true);
  await wait(() => states[1].timedTurns);
  for (const client of clients) assert.equal((await ack(client, 'ready')).ok, true);
  assert.equal((await ack(clients[0], 'start')).ok, true);
  await wait(() => states[0].game?.matchId && states[0].code === timed.code);
  assert.ok(states[0].deadline > Date.now());
  console.log('OK host opt-in timed mode creates an action deadline');
} finally {
  clients.forEach(client => client.disconnect());
  await new Promise(resolve => server.close(resolve));
}
