import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 5000);
  const done = value => { clearTimeout(timer); resolve(value); };
  if (payload === undefined) socket.emit(event, done); else socket.emit(event, payload, done);
});
const wait = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('state timeout');
};

async function phase(mode, port, allowed) {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: mode, DEBUG_SCENARIOS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  child.stdout.on('data', data => output.push(String(data)));
  child.stderr.on('data', data => output.push(String(data)));
  const clients = [io(`http://127.0.0.1:${port}`, { forceNew: true, reconnection: true }), io(`http://127.0.0.1:${port}`, { forceNew: true, reconnection: true })];
  const states = [null, null];
  clients.forEach((client, i) => client.on('state', state => { states[i] = state; }));
  try {
    await wait(() => clients.every(client => client.connected));
    const host = await ack(clients[0], 'create', { name: '<房主>' });
    assert.equal(host.ok, true);
    assert.equal(states[0].seats[0].name, '房主');
    assert.equal((await ack(clients[1], 'join', { code: host.code, name: '访客' })).ok, true);
    for (const client of clients) assert.equal((await ack(client, 'ready')).ok, true);
    assert.equal((await ack(clients[0], 'start')).ok, true);
    await wait(() => states.every(state => state?.game));
    assert.equal('seed' in states[0].game, false);
    assert.equal('random' in states[0].game, false);
    assert.equal((await ack(clients[1], 'debug:export')).ok, false);
    const exportResult = await ack(clients[0], 'debug:export');
    assert.equal(exportResult.ok, allowed);
    if (allowed) {
      assert.equal(typeof JSON.parse(exportResult.json).state.seed, 'number');
      const before = states[0].game.version;
      assert.equal((await ack(clients[0], 'debug:scenario', { expectedVersion: before, name: 'cannon-chain' })).ok, true);
      await wait(() => states[0].game.version > before);
      assert.equal((await ack(clients[0], 'debug:scenario', { expectedVersion: before, name: 'full-hand' })).ok, false);
    } else {
      assert.equal((await ack(clients[0], 'debug:scenario', { expectedVersion: states[0].game.version, name: 'air-defense' })).ok, false);
    }
    console.log(`OK ${mode}: debug ${allowed ? 'host-only, versioned' : 'disabled'}; public state has no seed`);
  } catch (error) {
    throw new Error(`${error.stack}; server output: ${output.join('')}`);
  } finally {
    clients.forEach(client => client.disconnect());
    child.kill();
  }
}

await phase('development', 3003, true);
await phase('production', 3004, false);
