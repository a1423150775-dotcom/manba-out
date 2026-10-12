import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { server } from '../dist/server/index.js';

const url = process.env.GAME_URL || 'http://localhost:3001';
const clients = [io(url, { forceNew: true }), io(url, { forceNew: true })];
const states = [null, null];
clients.forEach((client, i) => client.on('state', state => { states[i] = state; }));
const ack = (client, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 5000);
  const done = result => { clearTimeout(timer); resolve(result); };
  if (payload === undefined) client.emit(event, done); else client.emit(event, payload, done);
});
const wait = async test => { for (let i = 0; i < 100; i++) { if (test()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error('state timeout'); };
try {
  const created = await ack(clients[0], 'create', { name: '甲' });
  assert.equal(created.ok, true);
  const joined = await ack(clients[1], 'join', { code: created.code, name: '乙' });
  assert.equal(joined.ok, true);
  assert.equal((await ack(clients[0], 'ready')).ok, true);
  assert.equal((await ack(clients[1], 'ready')).ok, true);
  assert.equal((await ack(clients[0], 'start')).ok, true);
  await wait(() => states.every(s => s?.game));
  const first = states[0].game.roundOrder[0] === created.playerId ? 0 : 1;
  const game = states[first].game;
  const selected = game.market.slots[0];
  const preview = game.market.nextCard;
  const request = { requestId: crypto.randomUUID(), matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version, action: { type: 'draw', slot: 0, cardInstanceId: selected.instanceId } };
  assert.equal((await ack(clients[first], 'action', request)).ok, true);
  const duplicate = await ack(clients[first], 'action', request);
  assert.equal(duplicate.ok, true);
  await wait(() => states[first].game.version === game.version + 1);
  assert.equal(states[first].game.market.slots[0].instanceId, preview.instanceId);
  assert.equal(states[first].game.players.find(p => p.id === states[first].you).handCount, 3);
  const oldToken = first === 0 ? created.token : joined.token;
  const replacement = io(url, { forceNew: true });
  let resumed = null;
  replacement.on('state', v => { resumed = v; });
  assert.equal((await ack(replacement, 'resume', { code: created.code, token: oldToken })).ok, true);
  await wait(() => resumed?.game?.version === states[first].game.version);
  assert.equal(resumed.game.players.find(p => p.id === resumed.you).handCount, 3);
  const activeClients = [...clients]; activeClients[first] = replacement;
  replacement.on('state', v => { resumed = v; });
  const getState = i => i === first ? resumed : states[i];
  clients[first].disconnect();
  let turns = 0;
  while (getState(0).game.phase === 'playing') {
    const state = getState(0).game;
    const who = state.roundOrder[state.turnIndex] === created.playerId ? 0 : 1;
    const actionRequest = { requestId: crypto.randomUUID(), matchId: state.matchId, turnId: state.turnId, expectedVersion: state.version, action: { type: 'end' } };
    const reply = await ack(activeClients[who], 'action', actionRequest);
    assert.equal(reply.ok, true, reply.reason);
    await wait(() => getState(0).game.version === state.version + 1);
    turns++;
    if (turns > 40) throw new Error('match did not finish');
  }
  assert.equal(turns, 36);
  assert.equal(getState(0).game.phase, 'finished');
  console.log(`OK: 2 independent socket sessions, duplicate draw, reconnect, ${turns} turns, final result`);
  replacement.disconnect();
} finally { clients.forEach(c => c.disconnect()); server.close(); }
