import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const url = process.env.GAME_URL || 'http://127.0.0.1:3000';
const clients = [io(url, { forceNew: true }), io(url, { forceNew: true })];
const ack = (client, event, input) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} 超时`)), 5000);
  const done = result => { clearTimeout(timer); resolve(result); };
  if (input === undefined) client.emit(event, done); else client.emit(event, input, done);
});
try {
  assert.equal((await ack(clients[0], 'create', { name: '限额验证' })).ok, true);
  const second = await ack(clients[1], 'create', { name: '第二房间' });
  assert.equal(second.ok, false);
  assert.match(second.reason, /房间数量/);
  let throttled = false;
  for (let i = 0; i < 85; i++) {
    const result = await ack(clients[0], 'ready');
    if (!result.ok && /频繁/.test(result.reason)) { throttled = true; break; }
  }
  assert.equal(throttled, true);
  console.log('OK 最大房间数量与每会话请求频率限制');
} finally { clients.forEach(client => client.disconnect()); }
