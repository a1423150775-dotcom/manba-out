import { io } from 'socket.io-client';

const code = process.argv[2];
if (!code) throw new Error('usage: node scripts/ui-partner.mjs ROOMCODE');
const socket = io('http://localhost:3001', { forceNew: true });
let identity = null;
let lastTurn = -1;
socket.on('connect', () => socket.emit('join', { code, name: '自动玩家乙' }, response => {
  if (!response.ok) throw new Error(response.reason);
  identity = response.playerId;
  console.log(`joined ${response.code} as ${identity}`);
  socket.emit('ready', result => console.log('ready', result));
}));
socket.on('state', state => {
  const game = state.game;
  if (!game || !identity || game.phase !== 'playing' || game.pending || game.boxDecisions.length) return;
  if (game.roundOrder[game.turnIndex] !== identity || game.turnId === lastTurn) return;
  lastTurn = game.turnId;
  socket.emit('action', {
    requestId: crypto.randomUUID(), matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version,
    action: { type: 'end' },
  }, result => console.log(`turn ${game.turnId}`, result));
});
