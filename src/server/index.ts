import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Server, type Socket } from 'socket.io';
import { installRealtime } from './realtime';
import { applyAction, createGame, currentPlayer, expireBoxDecision, expireReactions, finishGameEarly, publicView, type GameAction, type GameState } from '../core/game';
import { CONFIG } from '../core/config';
import { applyDebugPatch, DEBUG_SCENARIOS, exportReproduction, scenarioPatch, type DebugPatch, type DebugScenarioName } from '../core/debug';

type Seat = { id: string; token: string; joinNumber: number; name: string; color: string; ready: boolean; socketId: string | null };
type Stage = 'ACTION' | 'REACTION' | 'RESOLUTION' | 'ROUND_SUMMARY' | 'GAME_OVER';
type EndVote = { id: string; initiatedBy: string; responses: Record<string, 'agree' | 'reject'> };
type Room = { code: string; seats: Seat[]; rounds: number | null; game: GameState | null; timedTurns: boolean; stage: Stage | null; lastAction: { actorId: string; type: GameAction['type'] } | null; deadline: number | null; reactionDeadline: number | null; boxDeadline: number | null; remainingTurnMs: number | null; requestCache: Map<string, unknown>; vote: EndVote | null; voteNotice: string | null; finishReason: 'normal' | 'vote' | null };
const rooms = new Map<string, Room>();
const maxRooms = Number(process.env.GAME_MAX_ROOMS || 100);
const operationLogDir = process.env.GAME_LOG_DIR;
if (operationLogDir) mkdirSync(operationLogDir, { recursive: true });
function logOperation(requestId: string | null, playerId: string | null, action: string, ok: boolean, code: string, reason?: string): void {
  const line = JSON.stringify({ at: new Date().toISOString(), requestId, playerId, action, ok, code, ...(reason ? { reason } : {}) });
  console.log(line);
  if (operationLogDir) try { appendFileSync(join(operationLogDir, 'operations.log'), `${line}\n`, 'utf8'); } catch { /* 仍有控制台日志 */ }
}
const validRequestId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{8,100}$/i.test(value);
const colors = ['#f76c5e', '#56b6c2', '#e7aa38', '#a888ee', '#58aa74', '#e572a6'];
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
const webPath = process.env.GAME_WEB_DIR || join(process.cwd(), 'dist', 'web');
app.use((req, res, next) => { if (req.path === '/' || req.path === '/index.html' || req.path === '/version.json') res.setHeader('Cache-Control', 'no-store, must-revalidate'); next(); });
app.use(express.static(webPath));
app.get('*splat', (_req, res) => { res.setHeader('Cache-Control', 'no-store, must-revalidate'); res.sendFile(join(webPath, 'index.html')); });
const server = createServer(app);
const io = new Server(server, { cors: { origin: process.env.NODE_ENV === 'production' ? false : true }, maxHttpBufferSize: 64 * 1024 });
installRealtime(io);
const port = Number(process.env.PORT || 3001);
const host = process.env.GAME_HOST || '0.0.0.0';
let timedTicker: ReturnType<typeof setInterval> | null = null;

function cleanName(value: unknown): string {
  return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16);
}
function nextJoinNumber(room: Pick<Room, 'seats'>): number {
  let number = 1;
  while (room.seats.some(seat => seat.joinNumber === number || seat.name === `神秘牢大${number}`)) number++;
  return number;
}
function newCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do { code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (rooms.has(code));
  return code;
}
function roomView(room: Room, seat: Seat) {
  return { code: room.code, you: seat.id, seats: room.seats.map(s => ({ id: s.id, name: s.name, color: s.color, ready: s.ready, online: !!s.socketId })), rounds: room.rounds ?? CONFIG.rounds[Math.max(2, room.seats.length)], game: room.game ? publicView(room.game, seat.id) : null, timedTurns: room.timedTurns, stage: room.stage, lastAction: room.lastAction, deadline: room.deadline, reactionDeadline: room.reactionDeadline, boxDeadline: room.boxDeadline, vote: room.vote, voteNotice: room.voteNotice, finishReason: room.finishReason };
}
function broadcast(room: Room) {
  for (const seat of room.seats) if (seat.socketId) io.to(seat.socketId).emit('state', roomView(room, seat));
}
function bind(socket: Socket, room: Room, seat: Seat) {
  const previous = getOwnRoom(socket);
  if (previous && previous.seat !== seat) { previous.seat.socketId = null; broadcast(previous.room); }
  if (seat.socketId && seat.socketId !== socket.id) io.sockets.sockets.get(seat.socketId)?.disconnect(true);
  seat.socketId = socket.id;
  socket.data.roomCode = room.code;
  socket.data.playerId = seat.id;
  broadcast(room);
}
function getOwnRoom(socket: Socket): { room: Room; seat: Seat } | null {
  const room = rooms.get(socket.data.roomCode as string);
  const seat = room?.seats.find(s => s.id === socket.data.playerId);
  return room && seat && seat.socketId === socket.id ? { room, seat } : null;
}
function canDebug(socket: Socket): { room: Room; seat: Seat } | null {
  if (process.env.NODE_ENV === 'production' || process.env.DEBUG_SCENARIOS !== '1') return null;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.handshake.address)) return null;
  const own = getOwnRoom(socket);
  return own && own.room.seats[0].id === own.seat.id && own.room.game ? own : null;
}
function syncDeadlines(room: Room, before: GameState, now: number): void {
  if (!room.timedTurns) {
    room.deadline = null; room.reactionDeadline = null; room.boxDeadline = null; room.remainingTurnMs = null;
    return;
  }
  const after = room.game!;
  const wasWaiting = !!before.pending || before.boxDecisions.length > 0;
  const isWaiting = !!after.pending || after.boxDecisions.length > 0;
  if (!wasWaiting && isWaiting) {
    room.remainingTurnMs = Math.max(0, (room.deadline ?? now) - now);
    room.deadline = null;
  }
  if (after.pending) {
    if (!before.pending || before.pending.rootId !== after.pending.rootId) room.reactionDeadline = now + 5000;
    room.boxDeadline = null;
  } else if (after.boxDecisions.length) {
    room.reactionDeadline = null;
    if (before.pending || before.boxDecisions[0]?.playerId !== after.boxDecisions[0].playerId || !room.boxDeadline) room.boxDeadline = now + 10000;
  } else if (wasWaiting) {
    room.reactionDeadline = null; room.boxDeadline = null;
    room.deadline = after.phase === 'playing' ? now + (room.remainingTurnMs ?? 0) : null;
    room.remainingTurnMs = null;
  }
  if (before.turnId !== after.turnId) {
    if (isWaiting) { room.remainingTurnMs = CONFIG.turnSeconds * 1000; room.deadline = null; }
    else room.deadline = after.phase === 'playing' ? now + CONFIG.turnSeconds * 1000 : null;
  }
}
function passOfflineReactions(room: Room): void {
  if (!room.timedTurns) return;
  for (let guard = 0; guard < 16 && room.game?.pending; guard++) {
    const id = room.game.pending.eligible.find(playerId => !room.game!.pending!.responses[playerId]
      && !room.seats.find(s => s.id === playerId)?.socketId);
    if (!id) break;
    const passed = applyAction(room.game, id, { type: 'react', choice: 'pass' });
    if (!passed.ok) break;
    room.game = passed.state;
  }
}
function stageFor(game: GameState): Stage {
  return game.phase === 'finished' ? 'GAME_OVER' : game.pending ? 'REACTION' : 'ACTION';
}
function refreshTimedTicker(): void {
  const active = [...rooms.values()].some(room => room.timedTurns && room.game?.phase === 'playing');
  if (active && !timedTicker) timedTicker = setInterval(tickTimedRooms, 250).unref();
  else if (!active && timedTicker) { clearInterval(timedTicker); timedTicker = null; }
}
function publishTransition(room: Room, before: GameState, action: GameAction, actorId: string): void {
  const after = room.game!;
  if (after.phase === 'finished' && before.phase !== 'finished') { room.finishReason = 'normal'; room.vote = null; }
  room.lastAction = { actorId, type: action.type };
  const roundEnded = before.round !== after.round || after.phase === 'finished' && before.phase !== 'finished';
  const resolved = !!before.pending && !after.pending || action.type === 'play' && !after.pending;
  room.stage = roundEnded ? 'ROUND_SUMMARY' : resolved ? 'RESOLUTION' : stageFor(after);
  broadcast(room);
  refreshTimedTicker();
  if (roundEnded || resolved) queueMicrotask(() => {
    if (room.game !== after) return;
    room.stage = stageFor(after);
    broadcast(room);
  });
}
io.on('connection', socket => {
  let rateWindow = Date.now();
  let rateCount = 0;
  socket.use((packet, next) => {
    if (typeof packet[packet.length - 1] !== 'function') return;
    const now = Date.now();
    if (now - rateWindow >= 10_000) { rateWindow = now; rateCount = 0; }
    if (++rateCount > 80) {
      const callback = packet[packet.length - 1];
      if (typeof callback === 'function') callback({ ok: false, reason: '请求过于频繁，请稍后重试' });
      return;
    }
    next();
  });
  socket.on('debug:patch', (input: { expectedVersion?: number; patch?: DebugPatch }, reply: (r: unknown) => void) => {
    const own = canDebug(socket);
    if (!own?.room.game || input?.expectedVersion !== own.room.game.version || !input.patch) return reply({ ok: false, reason: '开发调试不可用或状态已过期' });
    try { own.room.game = applyDebugPatch(own.room.game, input.patch); own.room.stage = stageFor(own.room.game); broadcast(own.room); reply({ ok: true }); }
    catch (error) { reply({ ok: false, reason: error instanceof Error ? error.message : '调试参数错误' }); }
  });
  socket.on('debug:scenario', (input: { expectedVersion?: number; name?: string }, reply: (r: unknown) => void) => {
    const own = canDebug(socket);
    if (!own?.room.game || input?.expectedVersion !== own.room.game.version || !DEBUG_SCENARIOS.includes(input.name as DebugScenarioName)) return reply({ ok: false, reason: '开发调试不可用、状态过期或场景无效' });
    try { own.room.game = applyDebugPatch(own.room.game, scenarioPatch(own.room.game, input.name as DebugScenarioName)); own.room.stage = stageFor(own.room.game); broadcast(own.room); reply({ ok: true }); }
    catch (error) { reply({ ok: false, reason: error instanceof Error ? error.message : '场景配置错误' }); }
  });
  socket.on('debug:export', (reply: (r: unknown) => void) => {
    const own = canDebug(socket);
    reply(own?.room.game ? { ok: true, json: exportReproduction(own.room.game) } : { ok: false, reason: '开发调试不可用' });
  });
  socket.on('create', (input: { name?: string }, reply: (r: unknown) => void) => {
    if (rooms.size >= maxRooms) return reply({ ok: false, reason: '房间数量已达服务器上限' });
    const code = newCode();
    const seat: Seat = { id: randomBytes(12).toString('hex'), token: randomBytes(32).toString('hex'), joinNumber: 1, name: cleanName(input?.name) || '神秘牢大1', color: colors[0], ready: false, socketId: null };
    const room: Room = { code, seats: [seat], rounds: null, game: null, timedTurns: false, stage: null, lastAction: null, deadline: null, reactionDeadline: null, boxDeadline: null, remainingTurnMs: null, requestCache: new Map(), vote: null, voteNotice: null, finishReason: null };
    rooms.set(code, room); bind(socket, room, seat);
    reply({ ok: true, code, token: seat.token, playerId: seat.id });
  });
  socket.on('join', (input: { code?: string; name?: string }, reply: (r: unknown) => void) => {
    const room = rooms.get(String(input?.code || '').toUpperCase());
    if (!room || room.game || room.seats.length >= 6) return reply({ ok: false, reason: '房间不存在、已开局或已满' });
    const joinNumber = nextJoinNumber(room);
    const name = cleanName(input?.name) || `神秘牢大${joinNumber}`;
    if (room.seats.some(seat => seat.name === name)) return reply({ ok: false, code: 'DUPLICATE_NAME', reason: '昵称已被使用，请修改后重试' });
    const seat: Seat = { id: randomBytes(12).toString('hex'), token: randomBytes(32).toString('hex'), joinNumber, name, color: colors[(joinNumber - 1) % colors.length], ready: false, socketId: null };
    room.seats.push(seat); bind(socket, room, seat);
    reply({ ok: true, code: room.code, token: seat.token, playerId: seat.id });
  });
  socket.on('resume', (input: { code?: string; token?: string }, reply: (r: unknown) => void) => {
    const room = rooms.get(String(input?.code || '').toUpperCase());
    const seat = room?.seats.find(s => s.token === input?.token);
    if (!room || !seat) return reply({ ok: false, reason: '无法恢复身份；服务器重启后内存对局会结束' });
    bind(socket, room, seat);
    reply({ ok: true, code: room.code, token: seat.token, playerId: seat.id });
  });
  socket.on('ready', (reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.game) return reply({ ok: false, reason: '当前不可准备' });
    own.seat.ready = !own.seat.ready; broadcast(own.room); reply({ ok: true });
  });
  socket.on('settings:timed', (input: { enabled?: boolean }, reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.game || own.room.seats[0].id !== own.seat.id || typeof input?.enabled !== 'boolean') return reply({ ok: false, reason: '只有开局前的房主可以设置限时模式' });
    own.room.timedTurns = input.enabled;
    broadcast(own.room); reply({ ok: true });
  });
  socket.on('settings:rounds', (input: { rounds?: number }, reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.game || own.room.seats[0].id !== own.seat.id) return reply({ ok: false, reason: '只有开局前的房主可以设置总轮数' });
    if (!Number.isInteger(input?.rounds) || input.rounds! < 1 || input.rounds! > 99) return reply({ ok: false, reason: '总轮数必须是1～99' });
    own.room.rounds = input.rounds!;
    broadcast(own.room); reply({ ok: true });
  });
  socket.on('start', (reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.game || own.room.seats[0].id !== own.seat.id || own.room.seats.length < 2 || !own.room.seats.every(s => s.ready)) return reply({ ok: false, reason: '需要房主和2～6名已准备玩家' });
    const room = own.room;
    room.game = createGame(room.seats.map(s => ({ id: s.id, name: s.name, color: s.color })), randomInt(0x100000000), Date.now(), randomBytes(16).toString('hex'), room.rounds ?? undefined);
    room.stage = stageFor(room.game);
    room.lastAction = null;
    room.vote = null; room.voteNotice = null; room.finishReason = null;
    room.deadline = room.timedTurns ? Date.now() + CONFIG.turnSeconds * 1000 : null;
    refreshTimedTicker();
    broadcast(room); reply({ ok: true });
  });
  socket.on('rematch', (reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.seats[0].id !== own.seat.id || own.room.game?.phase !== 'finished') return reply({ ok: false, reason: '只有已结束对局的房主可以开启再来一局' });
    own.room.game = null;
    own.room.stage = null; own.room.lastAction = null;
    own.room.vote = null; own.room.voteNotice = null; own.room.finishReason = null;
    own.room.deadline = null; own.room.reactionDeadline = null; own.room.boxDeadline = null; own.room.remainingTurnMs = null;
    own.room.requestCache.clear();
    refreshTimedTicker();
    for (const seat of own.room.seats) seat.ready = false;
    broadcast(own.room); reply({ ok: true });
  });
  socket.on('finish:vote', (input: { requestId?: string; choice?: 'start' | 'agree' | 'reject' | 'cancel' }, reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || !validRequestId(input?.requestId)) {
      logOperation(validRequestId(input?.requestId) ? input.requestId : null, own?.seat.id || null, 'finish:vote', false, 'INVALID_IDENTITY_OR_REQUEST');
      return reply({ ok: false, code: 'INVALID_IDENTITY_OR_REQUEST', reason: '无效请求或身份' });
    }
    const { room, seat } = own;
    const key = `${seat.id}:vote:${input.requestId}`;
    if (room.requestCache.has(key)) return reply(room.requestCache.get(key));
    if (!room.game || room.game.phase !== 'playing') {
      logOperation(input.requestId, seat.id, 'finish:vote', false, 'GAME_NOT_ACTIVE');
      return reply({ ok: false, code: 'GAME_NOT_ACTIVE', requestId: input.requestId, reason: '当前没有进行中的比赛' });
    }
    const respond = (ok: boolean, code: string, reason?: string) => {
      const response = { ok, code, requestId: input.requestId, ...(reason ? { reason } : {}) };
      room.requestCache.set(key, response);
      logOperation(input.requestId!, seat.id, `finish:vote:${input.choice || 'invalid'}`, ok, code, reason);
      reply(response);
    };
    if (input.choice === 'start') {
      if (room.vote) return respond(false, 'VOTE_EXISTS', '已有进行中的结束投票');
      room.vote = { id: randomBytes(8).toString('hex'), initiatedBy: seat.id, responses: { [seat.id]: 'agree' } };
      room.voteNotice = `${seat.name}发起了结束本局投票`;
      broadcast(room);
      return respond(true, 'OK');
    }
    if (!room.vote) return respond(false, 'NO_VOTE', '当前没有进行中的结束投票');
    if (input.choice === 'cancel') {
      if (room.vote.initiatedBy !== seat.id) return respond(false, 'NOT_INITIATOR', '只有发起者可以取消投票');
      room.vote = null; room.voteNotice = `${seat.name}取消了结束本局投票`;
      broadcast(room);
      return respond(true, 'OK');
    }
    if (input.choice !== 'agree' && input.choice !== 'reject') return respond(false, 'INVALID_CHOICE', '投票选项无效');
    if (room.vote.responses[seat.id]) return respond(false, 'ALREADY_VOTED', '你已经投过票');
    room.vote.responses[seat.id] = input.choice;
    if (input.choice === 'reject') {
      room.vote = null; room.voteNotice = `${seat.name}拒绝了结束本局，比赛继续`;
    } else if (room.seats.every(participant => room.vote!.responses[participant.id] === 'agree')) {
      room.game = finishGameEarly(room.game!, Date.now());
      room.finishReason = 'vote'; room.stage = 'GAME_OVER'; room.vote = null;
      room.voteNotice = '全体玩家同意，比赛已提前结束';
      room.deadline = null; room.reactionDeadline = null; room.boxDeadline = null; room.remainingTurnMs = null;
      refreshTimedTicker();
    }
    broadcast(room);
    return respond(true, 'OK');
  });
  socket.on('room:close', (reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.seats[0].id !== own.seat.id) return reply({ ok: false, code: 'NOT_HOST', reason: '只有房主可以关闭房间' });
    const room = own.room;
    rooms.delete(room.code);
    refreshTimedTicker();
    for (const participant of room.seats) if (participant.socketId) {
      const peer = io.sockets.sockets.get(participant.socketId);
      if (peer) { delete peer.data.roomCode; delete peer.data.playerId; peer.emit('room:closed', { reason: '房主已关闭房间，本局不产生比赛结果' }); }
    }
    room.vote = null; room.game = null; room.requestCache.clear();
    logOperation(null, own.seat.id, 'room:close', true, 'OK');
    reply({ ok: true, code: 'OK' });
  });
  socket.on('room:leave', (reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    if (!own || own.room.game?.phase === 'playing') return reply({ ok: false, code: 'GAME_ACTIVE', reason: '进行中的比赛请先结束本局或由房主关闭房间' });
    const room = own.room;
    room.seats = room.seats.filter(participant => participant.id !== own.seat.id);
    delete socket.data.roomCode; delete socket.data.playerId;
    if (!room.seats.length) rooms.delete(room.code); else broadcast(room);
    reply({ ok: true, code: 'OK' });
  });
  socket.on('action', (input: { requestId?: string; matchId?: string; turnId?: number; expectedVersion?: number; action?: GameAction }, reply: (r: unknown) => void) => {
    const own = getOwnRoom(socket);
    const requestId = validRequestId(input?.requestId) ? input.requestId : null;
    const operation = typeof input?.action?.type === 'string' ? input.action.type : 'unknown';
    const respond = (ok: boolean, code: string, reason?: string, version?: number) => {
      const response = { ok, code, requestId, ...(reason ? { reason } : {}), ...(version !== undefined ? { version } : {}) };
      logOperation(requestId, own?.seat.id || null, operation, ok, code, reason);
      reply(response);
      return response;
    };
    if (!own?.room.game || !requestId) return respond(false, 'INVALID_IDENTITY_OR_REQUEST', '无效请求或身份');
    const { room, seat } = own;
    const cacheKey = `${seat.id}:action:${requestId}`;
    if (room.requestCache.has(cacheKey)) {
      logOperation(requestId, seat.id, operation, true, 'DUPLICATE');
      return reply(room.requestCache.get(cacheKey));
    }
    const game = room.game!;
    if (game.phase === 'finished') return respond(false, 'GAME_OVER', '本局已经结束');
    if (input.matchId !== game.matchId || input.turnId !== game.turnId || input.expectedVersion !== game.version) return respond(false, 'STALE_STATE', '状态已过期，请同步后重试');
    if (room.deadline !== null && Date.now() >= room.deadline) return respond(false, 'TURN_TIMEOUT', '回合已超时');
    if (!input.action || !['move', 'draw', 'play', 'react', 'box', 'buy', 'end'].includes(input.action.type)) return respond(false, 'INVALID_ACTION', '操作内容无效');
    const result = applyAction(game, seat.id, input.action);
    if (!result.ok) return respond(false, 'RULE_REJECTED', result.reason);
    room.game = result.state;
    passOfflineReactions(room);
    syncDeadlines(room, game, Date.now());
    publishTransition(room, game, input.action, seat.id);
    const response = respond(true, 'OK', undefined, result.state.version);
    room.requestCache.set(cacheKey, response);
  });
  socket.on('disconnect', () => {
    const own = getOwnRoom(socket);
    if (own) { own.seat.socketId = null; broadcast(own.room); }
  });
});
function tickTimedRooms(): void {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.timedTurns) continue;
    if (room.game?.pending && room.reactionDeadline !== null && now >= room.reactionDeadline) {
      const before = room.game;
      room.game = expireReactions(before);
      passOfflineReactions(room);
      syncDeadlines(room, before, now);
      publishTransition(room, before, { type: 'react', choice: 'pass' }, before.pending?.eligible[0] || before.pending?.casterId || 'system');
    }
    if (room.game?.boxDecisions.length && room.boxDeadline !== null && now >= room.boxDeadline) {
      const before = room.game;
      room.game = expireBoxDecision(before);
      syncDeadlines(room, before, now);
      publishTransition(room, before, { type: 'box', choice: 'abandon' }, before.boxDecisions[0]?.playerId || 'system');
    }
    if (!room.game || room.game.phase !== 'playing' || room.deadline === null || now < room.deadline) continue;
    const before = room.game;
    const actorId = currentPlayer(before).id;
    const result = applyAction(before, actorId, { type: 'end' }, now);
    if (result.ok) {
      result.state.events.push('服务端计时到期，自动结束回合');
      room.game = result.state;
      room.deadline = result.state.phase === 'playing' ? now + CONFIG.turnSeconds * 1000 : null;
      publishTransition(room, before, { type: 'end' }, actorId);
    }
  }
  refreshTimedTicker();
}
server.on('error', error => {
  console.error(`服务器监听失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`肘击大乱斗服务端运行于 ${host}:${port}`));

export { server, io, rooms };
