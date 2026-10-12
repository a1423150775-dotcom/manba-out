import {MapEditor} from './MapEditor';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { io } from 'socket.io-client';
import { ACTIVE_CARD_IDS, CARDS, type CardId } from '../core/cards';
import { distance, equal, type Hex } from '../core/hex';
import type { GameAction } from '../core/game';
import { Board, directions, type Feedback, type Motion, type VisibleGame } from './Board';
import { CARD_HELP } from './card-help';
import { CardTile } from './CardTile';
import { Guide } from './Guide';
import { VictoryGoal } from './VictoryGoal';
import { turnGuidance } from './turn-guidance';
import { nextRequestId } from './request-id';
import { Diagnostics } from './Diagnostics';
import { ResultDialog } from './ResultDialog';
import { Glyph, MAP_LEGEND } from './icons';
import './style.css';
import './mobile.css';
import { RealtimeApp } from './RealtimeApp';

declare const __APP_BUILD_ID__: string;

const isEditor = new URLSearchParams(location.search).get('mode') === 'editor';
const isRealtime = new URLSearchParams(location.search).get('mode') === 'realtime';
const socket = io({ autoConnect: !isRealtime && !isEditor });
type Stage = 'ACTION' | 'REACTION' | 'RESOLUTION' | 'ROUND_SUMMARY' | 'GAME_OVER';
type Vote = { id: string; initiatedBy: string; responses: Record<string, 'agree' | 'reject'> };
type View = { code: string; you: string; seats: { id: string; name: string; color: string; ready: boolean; online: boolean }[]; rounds: number; game: VisibleGame | null; timedTurns: boolean; stage: Stage | null; lastAction: { actorId: string; type: GameAction['type'] } | null; deadline: number | null; reactionDeadline: number | null; boxDeadline: number | null; vote: Vote | null; voteNotice: string | null; finishReason: 'normal' | 'vote' | null };
type Reply = { ok: boolean; reason?: string; code?: string; token?: string; requestId?: string; version?: number };
type SeatMemory = { code: string; token: string };
let volatileSeat: SeatMemory | null = null;
const stored = (): SeatMemory | null => { try { const value = sessionStorage.getItem('bad-friends-seat-v2') || localStorage.getItem('bad-friends-seat'); if (value && !sessionStorage.getItem('bad-friends-seat-v2')) { sessionStorage.setItem('bad-friends-seat-v2', value); localStorage.removeItem('bad-friends-seat'); } return value ? JSON.parse(value) as SeatMemory : volatileSeat; } catch { return volatileSeat; } };
const saveSeat = (seat: SeatMemory) => { volatileSeat = seat; try { sessionStorage.setItem('bad-friends-seat-v2', JSON.stringify(seat)); } catch { /* 当前页面仍能使用身份 */ } };
const clearSeat = () => { volatileSeat = null; try { sessionStorage.removeItem('bad-friends-seat-v2'); localStorage.removeItem('bad-friends-seat'); } catch { /* 私密模式可能禁用存储 */ } };
const coord = (h: Hex | null) => h ? `${h.q},${h.r}` : '场外';
const same = (a: Hex | null, b: Hex | null) => a && b ? equal(a, b) : a === b;

function motionSince(before: VisibleGame, after: VisibleGame): Motion[] {
  const fresh = after.events.slice(before.events.length);
  return after.players.flatMap(player => {
    const old = before.players.find(p => p.id === player.id);
    if (!old || same(old.position, player.position)) return [];
    const lines = fresh.filter(line => line.startsWith(player.name));
    const stepPoints = lines.flatMap(line => {
      const found = line.match(/(?:被推至|移动至|传送至|旋转到|集合到|送到)\s*(-?\d+),(-?\d+)/);
      return found ? [{ q: Number(found[1]), r: Number(found[2]) }] : [];
    });
    const kind: Motion['kind'] = !player.position ? 'out' : !old.position ? 'respawn' : lines.some(line => line.includes('传送') || line.includes('快递') || line.includes('集合') || line.includes('交换')) ? 'teleport' : lines.some(line => line.includes('被推') || line.includes('触发')) ? 'push' : 'move';
    const points = [...(old.position ? [old.position] : []), ...stepPoints];
    if (player.position && (!points.length || !equal(points[points.length - 1], player.position))) points.push(player.position);
    return [{ id: player.id, from: old.position, to: player.position, points, kind }];
  });
}

function feedbackSince(lines: string[], version: number): Feedback | null {
  for (const line of [...lines].reverse()) {
    if (line.includes('被推出边界')) return { id: version, kind: 'out', icon: 'out', text: line };
    if (line.includes('在边缘复活')) return { id: version, kind: 'respawn', icon: 'crown', text: line };
    if (line.includes('打开盲盒')) return { id: version, kind: 'box', icon: 'gift', text: line };
    if (line.includes('购买')) return { id: version, kind: 'buy', icon: 'shop', text: line };
    if (line.includes('获得') && line.includes('分')) return { id: version, kind: 'score', icon: 'crown', text: line };
    if (line.includes('从公共卡位')) return { id: version, kind: 'draw', icon: 'gift', text: line };
    if (line.includes('使用')) {
      const cardId = (Object.keys(CARDS) as CardId[]).find(id => line.includes(CARDS[id].name));
      if (cardId) return { id: version, kind: 'play', icon: cardId, text: line };
    }
    if (line.includes('被推至') || line.includes('触发')) return { id: version, kind: 'push', icon: 'spring', text: line };
    if (line.includes('传送至') || line.includes('送到') || line.includes('交换位置')) return { id: version, kind: 'teleport', icon: 'teleport', text: line };
    if (line.includes('移动至')) return { id: version, kind: 'move', icon: 'move', text: line };
  }
  return null;
}

function App() {
  const [view, setView] = useState<View | null>(null);
  const previous = useRef<View | null>(null);
  const [name, setName] = useState('');
  const [roundDraft, setRoundDraft] = useState('18');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(socket.connected ? '已连接' : '连接中');
  const [transport, setTransport] = useState('待协商');
  const [lastOperation, setLastOperation] = useState('');
  const [lastAck, setLastAck] = useState<{ action: string; requestId: string; ok: boolean; code: string; reason?: string } | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState('');
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [inspectCard, setInspectCard] = useState<CardId | null>(null);
  const [showGuide, setShowGuide] = useState(() => { try { return localStorage.getItem('bad-friends-guide-v1') !== 'done'; } catch { return true; } });
  const [showRules, setShowRules] = useState(false);
  const [showAtlas, setShowAtlas] = useState(false);
  const [mobileCardsOpen, setMobileCardsOpen] = useState(false);
  const [cardTab, setCardTab] = useState<'market' | 'hand'>('market');
  const [mobilePanel, setMobilePanel] = useState<'ranking' | 'shop' | 'events' | 'vote' | null>(null);
  const [direction, setDirection] = useState(0);
  const [shopReplace, setShopReplace] = useState('');
  const [length, setLength] = useState(2);
  const [dodgeCardId, setDodgeCardId] = useState<string | null>(null);
  const [firstSwapTarget, setFirstSwapTarget] = useState<string | null>(null);
  const [replaceTrapId, setReplaceTrapId] = useState('');
  const [debugJson, setDebugJson] = useState('{}');
  const [motions, setMotions] = useState<Motion[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [flashSlot, setFlashSlot] = useState<number | null>(null);
  const [activity, setActivity] = useState('');
  useEffect(() => { if (view?.rounds) setRoundDraft(String(view.rounds)); }, [view?.rounds]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    let visualTimer: ReturnType<typeof setTimeout> | null = null;
    const onState = (next: View) => {
      const old = previous.current;
      if (old?.game && next.game && old.game.matchId === next.game.matchId && next.game.version > old.game.version) {
        const paths = motionSince(old.game, next.game);
        if (paths.length) setMotions(paths);
        const replaced = next.game.market.slots.findIndex((c, i) => c.instanceId !== old.game!.market.slots[i].instanceId);
        if (replaced >= 0) setFlashSlot(replaced);
        const lines = next.game.events.slice(old.game.events.length);
        if (lines.length) setActivity(lines[lines.length - 1]);
        setFeedback(feedbackSince(lines, next.game.version));
        if (visualTimer) clearTimeout(visualTimer);
        visualTimer = setTimeout(() => { setMotions([]); setFlashSlot(null); setFeedback(null); }, 1500);
      }
      previous.current = next;
      setView(next);
    };
    const resume = () => {
      setConnection('已连接'); setError('');
      setTransport(socket.io.engine.transport.name);
      const seat = stored();
      if (seat) socket.timeout(8000).emit('resume', seat, (err: Error | null, r: Reply) => {
        if (err) { setLastErrorCode('RESUME_TIMEOUT'); setError('重连没有收到服务器回应，请检查网络后重试。'); }
        else if (!r?.ok) { clearSeat(); setView(null); setLastErrorCode(r?.code || 'RESUME_REJECTED'); setError(r?.reason || '重连失败'); }
      });
    };
    const disconnected = (reason: string) => { setConnection('已断开'); setLastErrorCode('DISCONNECTED'); setError(`与服务器连接已断开（${reason}）。正在尝试重连。`); };
    const connectError = (reason: Error) => { setConnection('连接失败'); setLastErrorCode('CONNECT_ERROR'); setError(`无法连接游戏服务器：${reason.message}`); };
    const roomClosed = (notice: { reason?: string }) => { clearSeat(); previous.current = null; setView(null); setSelectedCard(null); setCloseConfirm(false); setError(notice.reason || '房间已关闭'); };
    socket.on('state', onState); socket.on('connect', resume); socket.on('disconnect', disconnected); socket.on('connect_error', connectError); socket.on('room:closed', roomClosed);
    const recover = () => { if (document.visibilityState !== 'hidden') { if (!socket.connected) socket.connect(); else resume(); } };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('pageshow', recover);
    window.addEventListener('online', recover);
    if (socket.connected) resume();
    return () => { document.removeEventListener('visibilitychange', recover); window.removeEventListener('pageshow', recover); window.removeEventListener('online', recover); clearInterval(ticker); if (visualTimer) clearTimeout(visualTimer); socket.off('state', onState); socket.off('connect', resume); socket.off('disconnect', disconnected); socket.off('connect_error', connectError); socket.off('room:closed', roomClosed); };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const checkVersion = async () => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        if (response.ok && response.headers.get('content-type')?.includes('json')) {
          const value = await response.json() as { buildId?: string };
          if (value.buildId && value.buildId !== __APP_BUILD_ID__) setUpdateAvailable(true);
        }
      } catch { /* 离线提示由 Socket.IO 连接状态提供 */ }
    };
    void checkVersion();
    const timer = setInterval(checkVersion, 30_000);
    return () => clearInterval(timer);
  }, []);

  const sendCommand = (event: string, payload?: object, onSuccess?: (reply: Reply) => void, requestId = nextRequestId()) => {
    setLastOperation(`${event === 'action' ? `action:${(payload as { action?: GameAction })?.action?.type || 'unknown'}` : event} · ${requestId}`);
    if (!socket.connected) {
      const reason = '尚未连接游戏服务器，请等待连接恢复后重试。';
      setLastAck({ action: event, requestId, ok: false, code: 'OFFLINE', reason });
      setLastErrorCode('OFFLINE'); setError(reason);
      return;
    }
    const completed = (err: Error | null, reply: Reply | undefined) => {
      const code = err ? 'ACK_TIMEOUT' : reply?.ok && (event === 'create' || event === 'join') ? 'OK' : reply?.code || (reply?.ok ? 'OK' : 'REJECTED');
      const reason = err ? '服务器没有回应操作，请检查网络；不要连续重复点击。' : reply?.reason;
      const ok = !err && !!reply?.ok;
      setLastAck({ action: event, requestId: reply?.requestId || requestId, ok, code, reason });
      if (!ok) { setLastErrorCode(code); setError(reason || '操作失败'); }
      else { setLastErrorCode(''); setError(''); onSuccess?.(reply!); }
    };
    if (payload === undefined) socket.timeout(8000).emit(event, completed);
    else socket.timeout(8000).emit(event, payload, completed);
  };
  const enter = (event: 'create' | 'join', payload: object) => sendCommand(event, payload, reply => {
    if (reply.code && reply.token) saveSeat({ code: reply.code, token: reply.token });
  });
  const simple = (event: 'ready' | 'start' | 'rematch') => sendCommand(event);
  const action = (input: GameAction) => {
    if (!view?.game) { setLastErrorCode('NO_GAME_STATE'); setError('尚未收到当前比赛状态，请等待同步后重试。'); return; }
    const game = view.game;
    const requestId = nextRequestId();
    sendCommand('action', { requestId, matchId: game.matchId, turnId: game.turnId, expectedVersion: game.version, action: input }, () => {
      if (input.type === 'play') { setSelectedCard(null); setFirstSwapTarget(null); }
      if (input.type === 'draw') { setCardTab('hand'); }
      if (input.type === 'react') setDodgeCardId(null);
    }, requestId);
  };
  const vote = (choice: 'start' | 'agree' | 'reject' | 'cancel') => { const requestId = nextRequestId(); sendCommand('finish:vote', { requestId, choice }, undefined, requestId); };
  const leaveRoom = () => sendCommand('room:leave', undefined, () => { clearSeat(); previous.current = null; setView(null); setSelectedCard(null); });
  const closeRoom = () => sendCommand('room:close', undefined, () => setCloseConfirm(false));
  const closeGuide = () => { try { localStorage.setItem('bad-friends-guide-v1', 'done'); } catch { /* 私密模式 */ } setShowGuide(false); };
  useEffect(() => { setSelectedCard(null); setFirstSwapTarget(null); }, [view?.game?.turnId, view?.game?.matchId]);
  useEffect(() => {
    setMobilePanel(null); setMobileCardsOpen(false); setMotions([]); setFeedback(null); setFlashSlot(null); setActivity('');
  }, [view?.code, view?.game?.matchId]);
  useEffect(() => {
    const bar = document.querySelector('.mobile-action-bar');
    if (!bar) return;
    const measure = () => {
      const height = bar.getBoundingClientRect().height;
      if (height) document.documentElement.style.setProperty('--mobile-bar', `${height}px`);
    };
    const observer = new ResizeObserver(measure); observer.observe(bar); measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--mobile-bar'); };
  }, [!!view?.game]);
  useEffect(() => {
    const media = matchMedia('(max-width:900px)');
    const update = () => { const legend = document.querySelector<HTMLDetailsElement>('.legend'); if (legend) legend.open = !media.matches; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [!!view?.game]);
  useEffect(() => {
    const overlay = showRules || showAtlas || !!inspectCard || showGuide || !!mobilePanel || mobileCardsOpen;
    if (!overlay) return;
    // A local history entry makes the phone Back gesture dismiss panels without leaving the room.
    const marker = nextRequestId();
    history.pushState({ mobileOverlay: marker }, '');
    const dismiss = () => { setShowRules(false); setShowAtlas(false); setInspectCard(null); setShowGuide(false); setMobilePanel(null); setMobileCardsOpen(false); };
    window.addEventListener('popstate', dismiss);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('popstate', dismiss); window.removeEventListener('keydown', escape); if (history.state?.mobileOverlay === marker) history.back(); };
  }, [!!(showRules || showAtlas || inspectCard || showGuide || mobilePanel || mobileCardsOpen)]);
  const game = view?.game;
  const you = game?.players.find(p => p.id === view?.you);
  const activeId = game?.roundOrder[game.turnIndex];
  const diagnosticsEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
  const voteAgreed = view?.vote ? Object.values(view.vote.responses).filter(choice => choice === 'agree').length : 0;
  const voteRejected = view?.vote ? Object.values(view.vote.responses).filter(choice => choice === 'reject').length : 0;
  const voteWaiting = view?.vote ? view.seats.length - voteAgreed - voteRejected : 0;
  const activePlayer = game?.players.find(p => p.id === activeId);
  const yourTurn = game?.phase === 'playing' && activeId === view?.you;
  const pendingDecision = !!game?.pending || !!game?.boxDecisions.length;
  const cardReady = !!yourTurn && !pendingDecision && game?.cardAction === 'none';
  const selected = you?.hand.find(c => c.instanceId === selectedCard);
  const reacting = !!game?.pending?.eligible.includes(view?.you || '') && !game.pending.responses[view?.you || ''];
  const boxDecision = game?.boxDecisions[0]?.playerId === view?.you ? game?.boxDecisions[0] : null;
  const remaining = view?.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : 0;
  const reactionSeconds = view?.reactionDeadline ? Math.max(0, Math.ceil((view.reactionDeadline - now) / 1000)) : 0;
  const boxSeconds = view?.boxDeadline ? Math.max(0, Math.ceil((view.boxDeadline - now) / 1000)) : 0;
  const stageName = ({ ACTION: '行动中', REACTION: '等待反应', RESOLUTION: '效果结算', ROUND_SUMMARY: '大轮结算', GAME_OVER: '比赛结束' } as Record<Stage, string>)[view?.stage || 'ACTION'];
  const attacker = game?.pending && game.players.find(p => p.id === game.pending!.casterId);
  const impact = game?.pending?.targets.find(t => t.id === view?.you);
  const waitingDefenders = game?.pending?.eligible.filter(id => !game.pending!.responses[id]).map(id => game.players.find(p => p.id === id)?.name).filter(Boolean) || [];
  const lastActor = view?.lastAction && game?.players.find(p => p.id === view.lastAction!.actorId);
  const operationName: Record<GameAction['type'], string> = { move: '移动', draw: '抽牌', play: '出牌', react: '反应', box: '盲盒选择', buy: '购买', end: '结束回合' };
  const marketReason = !yourTurn ? '现在不是你的回合' : pendingDecision ? game?.pending ? '等待防守方反应' : '等待盲盒选择' : game?.cardAction !== 'none' ? '本回合卡牌操作已完成' : (you?.hand.length || 0) >= 3 ? '手牌已满' : undefined;
  const handReason = !yourTurn ? '现在不是你的回合' : pendingDecision ? '等待当前效果结算' : game?.cardAction !== 'none' ? '本回合卡牌操作已完成' : undefined;
  const elbowTargetAvailable = !!you?.position && !!game?.players.some(p => p.id !== you.id && p.position && distance(you.position!, p.position) === 1);
  const shopNear = !!(game?.shop && you?.position && distance(game.shop.at, you.position) <= 1);
  const ownedDevices = game ? [...game.traps, ...game.obstacles, ...game.timed].filter(t => t.ownerId === view?.you) : [];
  const standings = game ? [...game.players].sort((a, b) => b.score - a.score || distance(a.position || { q: 99, r: 99 }) - distance(b.position || { q: 99, r: 99 }) || b.coins - a.coins) : [];
  const shopDisabledReason = (price: number) => !yourTurn ? '现在不是你的回合' : pendingDecision ? '等待当前效果结算' : !shopNear ? '尚未靠近商店' : game!.ap < 1 ? '行动力不足' : game!.shop!.boughtBy.includes(view!.you) ? '本次商店已购买' : (you?.coins || 0) < price ? '金币不足' : you?.hand.length === 3 && !shopReplace ? '手牌已满，请选替换牌' : undefined;

  let prompt = '等待其他玩家加入。';
  if (game?.phase === 'finished') prompt = '本局结束。查看排名，房主可以发起再来一局。';
  else if (boxDecision) prompt = '盲盒奖励待选择：手牌已满，请替换一张或放弃。';
  else if (reacting) prompt = `${attacker?.name || '对手'}对你使用了${CARDS[game!.pending!.cardId].name}！选择反应卡，或放弃反应。`;
  else if (game?.pending) prompt = `等待 ${waitingDefenders.join('、') || '受击玩家'} 选择反应；你仍可查看地图与卡牌。`;
  else if (game && !yourTurn) prompt = `等待${activePlayer?.name || '当前玩家'}行动${lastActor ? `；${lastActor.name}刚刚${operationName[view!.lastAction!.type]}` : ''}。`;
  else if (game && selected) prompt = `正在使用「${CARDS[selected.id].name}」：${selected.id === 'air_cannon' ? '选方向后查看红色扇形，再发射。' : ['rocket_boots', 'supply_dash', 'magnet', 'gathering'].includes(selected.id) ? '在目标栏确认操作。' : '点击棋盘上高亮的合法目标。'}`;
  else if (game) prompt = turnGuidance({ ap: game.ap, moveAp: game.moveAp, cardAction: game.cardAction, handCount: you?.hand.length || 0 });

  return <div className="app">
    <header className="site-header"><div className="brand"><span className="brand-seal"><Glyph name="crown" size={32}/></span><div><small>ELBOW MAYHEM</small><h1>肘击大乱斗</h1></div></div><nav><button onClick={() => setShowGuide(true)}><Glyph name="star" size={19}/>新手教学</button><button className="nav-primary" onClick={() => setShowRules(true)}><Glyph name="rules" size={19}/>游戏规则</button></nav></header>

    {!view && <main className="welcome"><section className="welcome-main"><span className="pill">2—6 人 · 回合制 · 中心争夺</span><h2>和好友开一局，<br/><em>把王座抢过来。</em></h2><p>走位、抽牌、打出肘击。会玩的朋友先看棋盘，不会玩的朋友也能跟着高亮格行动。</p><div className="rt-entry-buttons"><a className="primary" href="/?mode=realtime&amp;quick=solo">单人测试</a><a className="secondary" href="/?mode=realtime&amp;quick=spectate">Bot观战模式</a><a className="secondary" href="/?mode=realtime">实时多人 2.0</a></div><div className="entry-card"><label>你的昵称<input maxLength={16} value={name} onChange={e => setName(e.target.value)} placeholder="留空由服务器分配神秘牢大序号"/></label><div className="entry-actions"><button className="primary" onClick={() => enter('create', { name })}>创建房间 <span>→</span></button><div className="join-inline"><input value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="六位房间码" aria-label="六位房间码"/><button onClick={() => enter('join', { code, name })}>加入房间</button></div></div></div></section><aside className="welcome-art" aria-hidden="true"><div className="art-hex art-one"><Glyph name="crown" size={74}/><span>中心 +3</span></div><div className="art-hex art-two"><Glyph name="laoda_elbow" size={72}/><span>牢大肘击</span></div><div className="art-hex art-three"><Glyph name="gift" size={66}/><span>地图盲盒</span></div></aside></main>}

    {view && !game && <main className="room-shell"><section className="room-card"><div className="eyebrow">组队准备</div><h2>房间 <span>{view.code}</span></h2><p>把房间码发给朋友。所有人准备后，房主开始比赛。</p><div className="seat-list">{view.seats.map((s, i) => <div className="seat" key={s.id}><span className="seat-avatar" style={{ backgroundColor: s.color }}>{s.name.slice(0, 1)}</span><div><strong>{s.name}</strong><small>{s.id === view.you ? '你' : `玩家 ${i + 1}`}</small></div><b className={s.ready ? 'ready' : ''}>{s.online ? s.ready ? '已准备' : '待准备' : '离线'}</b></div>)}</div><div className="room-mode"><strong>回合模式</strong><span>{view.timedTurns ? '限时 40 秒 · 反应 5 秒' : '无限时 · 所有人主动操作'}</span>{view.seats[0]?.id === view.you && <button onClick={() => sendCommand('settings:timed', { enabled: !view.timedTurns })}>{view.timedTurns ? '关闭限时' : '开启限时'}</button>}</div><div className="room-mode"><strong>比赛轮数</strong><span>本局 {view.rounds} 大轮</span>{view.seats[0]?.id === view.you && <><input type="number" min={1} max={99} value={roundDraft} onChange={e => setRoundDraft(e.target.value)} aria-label="总轮数"/><button onClick={() => sendCommand('settings:rounds', { rounds: Number(roundDraft) })}>保存轮数</button></>}</div><div className="room-actions"><button className="primary" onClick={() => simple('ready')}>{view.seats.find(s => s.id === view.you)?.ready ? '取消准备' : '我准备好了'}</button>{view.seats[0]?.id === view.you && <button className="secondary" onClick={() => simple('start')}>开始比赛 →</button>}<button className="secondary" onClick={leaveRoom}>返回大厅</button>{view.seats[0]?.id === view.you && <button className="text-button" onClick={() => setCloseConfirm(true)}>关闭房间</button>}</div></section></main>}

    {game && <main className={`game-shell mobile-panel-${mobilePanel || 'none'}`} >
      <section className="match-bar"><div className="round-label"><small>比赛进度</small><strong>第 {game.round} <span>/ {game.maxRounds} 大轮</span></strong></div><div className="turn-label"><span className="turn-avatar" style={{ backgroundColor: activePlayer?.color }} /> <div><small>当前行动玩家</small><strong>{game.phase === 'finished' ? '比赛结束' : `${activePlayer?.name}的回合`}</strong></div></div><div className="phase-label"><small>当前阶段</small><strong>{stageName}</strong><span>剩余行动力 {game.ap + game.moveAp} AP</span></div>{view.timedTurns && <div className="timer-label"><Glyph name="clock" size={23}/><div><small>{game.pending ? '反应倒计时' : '回合倒计时'}</small><strong>{game.pending ? reactionSeconds : remaining}<span> 秒</span></strong></div></div>}<div className="match-state"><span className={reacting || boxDecision || yourTurn && !pendingDecision ? 'live' : ''}>{game.pending ? reacting ? '需要你反应' : '等待防守方反应' : boxDecision ? '需要你选择盲盒奖励' : game.boxDecisions.length ? '等待盲盒选择' : yourTurn ? '轮到你了！' : `等待${activePlayer?.name}行动…`}</span><small>房间 {view.code}</small></div><div className="my-stats">我的积分 {you?.score || 0} · 金币 {you?.coins || 0}{!you?.position && ' · 出界，等待复活'}</div><VictoryGoal maxRounds={game.maxRounds}/></section>

      <aside className="left-rail"><button className="mobile-panel-close" onClick={() => setMobilePanel(null)}>关闭排行榜</button><section className="rail-panel scoreboard"><div className="panel-title"><span>玩家排名</span><small>分数 / 金币</small></div>{standings.map((p, i) => <div className={`rank-row ${p.id === view.you ? 'rank-you' : ''}`} key={p.id}><span className="rank-number">{i + 1}</span><span className="rank-avatar" style={{ backgroundColor: p.color }}>{p.name.slice(0, 1)}</span><div className="rank-name"><b>{p.name}{p.id === view.you ? ' · 你' : ''}</b><small>{p.position ? distance(p.position) === 0 ? '站在王座' : `距中心 ${distance(p.position)} 格` : '已出界 · 下轮复活'}</small></div><div className="rank-score"><b key={p.score}>{p.score}</b><small><Glyph name="coin" size={13}/>{p.coins}</small></div></div>)}</section><section className="rail-panel objective"><div className="panel-title">占点得分</div><div className="score-key"><span className="swatch swatch-center"/>中心王座<strong>3分</strong></div><div className="score-key"><span className="swatch swatch-inner"/>第一圈<strong>2分</strong></div><div className="score-key"><span className="swatch swatch-mid"/>第二圈<strong>1分</strong></div><div className="score-key"><span className="swatch swatch-outer"/>外围<strong>0分</strong></div><p>每大轮结束统一结算。王座连续占据从第3次起每轮只得1分。</p></section></aside>

      <section className="board-column"><div className="board-heading"><div><span className="eyebrow">竞技场 · 地图总览</span><h2>抢占中心，别被推下去</h2></div><span className="board-coordinate">轴坐标地图 · 61 格</span></div><Board game={game} you={you} yourTurn={!!yourTurn} selected={selected?.id} direction={direction} cardInstanceId={selected?.instanceId} firstSwapTarget={firstSwapTarget} dodgeCardId={dodgeCardId} reacting={reacting} replaceTrapId={replaceTrapId || undefined} motions={motions} feedback={feedback} onAction={action} onTarget={setFirstSwapTarget} onInvalid={setError}/><details className="legend"><summary>地图图例 · 看懂每个图案</summary><div className="legend-grid">{MAP_LEGEND.map(item => <div className="legend-item" key={item.name}><Glyph name={item.name} size={26}/><span>{item.label}</span></div>)}</div></details></section>

      <aside className="right-rail"><button className="mobile-panel-close" onClick={() => setMobilePanel(null)}>关闭面板</button><section className={`rail-panel action-panel ${reacting ? 'needs-reaction' : ''}`} data-tour="action"><div className="panel-title">下一步做什么？</div><p className="action-prompt" aria-live="polite">{prompt}</p><div className="action-facts"><div><Glyph name="move" size={22}/><span>可用 AP</span><strong>{game.ap}{game.moveAp ? ` +${game.moveAp}` : ''}</strong></div><div><Glyph name="target" size={22}/><span>卡牌操作</span><strong>{game.cardAction === 'none' ? '可用' : '本回合卡牌操作已完成'}</strong></div></div>{yourTurn && !pendingDecision && game.phase === 'playing' && <ol className="turn-steps"><li><b>移动</b><span>{game.ap + game.moveAp > 0 ? '点击棋盘高亮的相邻格；每格 1 AP。' : '行动力已用完，仍可进行合法的零 AP 操作。'}</span></li><li><b>卡牌二选一</b><span>{game.cardAction === 'none' ? '从公共四张抽一张，或使用一张主动手牌；顺序不限。' : '本回合卡牌操作已完成。'}</span></li><li><b>结束回合</b><span>操作完成后由你主动点击结束。</span></li></ol>}{game.phase === 'playing' && <><button className="end-turn" disabled={!yourTurn || pendingDecision} title={!yourTurn ? '现在不是你的回合' : pendingDecision ? '等待当前效果结算' : undefined} onClick={() => action({ type: 'end' })}>结束我的回合 <span>→</span></button>{(!yourTurn || pendingDecision) && <small className="disabled-explanation">{!yourTurn ? '现在不是你的回合' : '等待当前效果结算'}</small>}</>}{game.pending && <div className="reaction-context"><strong>{attacker?.name || '对手'}使用了{CARDS[game.pending.cardId].name}</strong><span>攻击来源：{attacker?.name || '机关'} · {coord(attacker?.position || null)}</span><span>攻击范围：棋盘红色高亮区域</span>{impact && impact.steps > 0 && impact.direction >= 0 && impact.direction < 6 && <span>预计击退：从 {coord(impact.at)} 沿方向 {directions[impact.direction]} 最多 {impact.steps} 格；碰撞或机关可能改变结果。</span>}</div>}{reacting && <div className="reaction-actions"><strong>需要你选择防守反应{view.timedTurns ? ` · ${reactionSeconds} 秒` : ' · 无倒计时'}</strong>{you?.hand.filter(c => ['shield', 'dodge'].includes(c.id) || c.id === 'mirror' && ['laoda_elbow', 'punch', 'hook', 'air_cannon'].includes(game.pending!.cardId)).map(c => <button key={c.instanceId} onClick={() => c.id === 'dodge' ? setDodgeCardId(c.instanceId) : action({ type: 'react', choice: c.id as 'shield' | 'mirror', cardInstanceId: c.instanceId })}><Glyph name={c.id} size={25}/>{CARDS[c.id].name}</button>)}{dodgeCardId && <p>点击棋盘上高亮的相邻空格闪避。</p>}<button onClick={() => action({ type: 'react', choice: 'pass' })}>放弃反应</button></div>}</section>
        {game.phase === 'playing' && <section className={`rail-panel finish-panel ${view.vote ? 'has-vote' : ''}`}><div className="panel-title">结束本局</div>{view.vote ? <><p>结束投票进行中。发起者：{view.seats.find(seat => seat.id === view.vote?.initiatedBy)?.name}</p><p>已同意 {voteAgreed} · 已拒绝 {voteRejected} · 未投票 {voteWaiting}</p>{!view.vote.responses[view.you] && <div className="finish-actions"><button className="primary" onClick={() => vote('agree')}>同意结束本局</button><button className="secondary" onClick={() => vote('reject')}>拒绝</button></div>}{view.vote.initiatedBy === view.you && <button className="text-button" onClick={() => vote('cancel')}>取消本次投票</button>}</> : <button className="secondary full" onClick={() => vote('start')}>发起结束本局投票</button>}{view.voteNotice && <small>{view.voteNotice}</small>}<p>投票不阻塞当前回合；只有全体参赛玩家同意才会提前结算。</p>{view.seats[0]?.id === view.you && <button className="text-button" onClick={() => setCloseConfirm(true)}>房主关闭房间</button>}</section>}
        {selected && cardReady && <section className="rail-panel aim-panel"><div className="panel-title">正在瞄准 <b>{CARDS[selected.id].name}</b></div><p>{CARD_HELP[selected.id]}</p>{['air_cannon', 'launch_trap', 'rocket_boots', 'remote'].includes(selected.id) && <div className="direction-picker"><small>选择方向</small><div>{directions.map((label, i) => <button className={i === direction ? 'is-active' : ''} key={i} onClick={() => setDirection(i)} aria-label={`朝${label}`} title={`朝${label}`}>{label}</button>)}</div></div>}{selected.id === 'rocket_boots' && <label className="inline-field">冲刺长度<select value={length} onChange={e => setLength(Number(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}格</option>)}</select></label>}{['banana', 'ice', 'launch_trap', 'barricade', 'time_bomb', 'gravity_well'].includes(selected.id) && ownedDevices.length >= 2 && <label className="inline-field">替换旧机关<select value={replaceTrapId} onChange={e => setReplaceTrapId(e.target.value)}><option value="">先选一个旧机关</option>{ownedDevices.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}</select></label>}{selected.id === 'air_cannon' && <button className="primary full" onClick={() => action({ type: 'play', cardInstanceId: selected.instanceId, direction })}>确认发射</button>}{selected.id === 'rocket_boots' && <button className="primary full" onClick={() => action({ type: 'play', cardInstanceId: selected.instanceId, direction, length })}>确认冲刺</button>}{['supply_dash', 'magnet', 'gathering'].includes(selected.id) && <button className="primary full" onClick={() => action({ type: 'play', cardInstanceId: selected.instanceId })}>确认使用</button>}<button className="text-button" onClick={() => { setSelectedCard(null); setFirstSwapTarget(null); }}>取消选牌</button></section>}
        {game.shop && <section className="rail-panel shop-panel"><div className="panel-title"><span><Glyph name="shop" size={20}/> 地图商店</span><small>至第 {game.shop.expiresRound} 轮</small></div><p>位置 {coord(game.shop.at)} · 你有 {you?.coins} 金币</p><p className="shop-hint">{shopNear ? '已靠近商店：每件花1 AP，可购买一次。' : '走到商店格或相邻格才能购买。'}</p>{game.shop.stock.map(item => <div className="shop-item" key={item.card.instanceId}><div className={`shop-icon rarity-${CARDS[item.card.id].rarity}`}><Glyph name={item.card.id} size={30}/></div><div><strong>{CARDS[item.card.id].name}</strong><small>{CARDS[item.card.id].detail}</small></div><button disabled={!!shopDisabledReason(item.price)} title={shopDisabledReason(item.price)} onClick={() => action({ type: 'buy', cardInstanceId: item.card.instanceId, replaceInstanceId: shopReplace || undefined })}>{item.price} 金币</button>{shopDisabledReason(item.price) && <small className="shop-disabled-reason">{shopDisabledReason(item.price)}</small>}</div>)}{you?.hand.length === 3 && <label className="inline-field">手牌满了，请选择被替换的牌<select value={shopReplace} onChange={e => setShopReplace(e.target.value)}><option value="">选择旧牌</option>{you.hand.map(c => <option key={c.instanceId} value={c.instanceId}>{CARDS[c.id].name}</option>)}</select></label>}</section>}
        <section className="rail-panel event-panel"><div className="panel-title">当前事件</div><p className="activity" aria-live="polite">{activity || game.events[game.events.length - 1] || '比赛刚刚开始'}</p><div className="mini-log">{game.events.slice(-6).reverse().map((line, i) => <p key={`${game.version}-${i}`}>{line}</p>)}</div></section>
      </aside>

      <section className={`card-dock tab-${cardTab} ${mobileCardsOpen ? 'mobile-open' : ''}`} data-tour="cards"><div className="dock-heading"><div><span className="eyebrow">卡牌与补给</span><h2>本回合选一项：抽牌或出牌</h2></div><button className="mobile-card-toggle" onClick={() => setMobileCardsOpen(!mobileCardsOpen)}>{mobileCardsOpen ? '收起卡牌' : '展开卡牌'}</button></div><div className="mobile-card-tabs" role="tablist" aria-label="卡牌区域"><button role="tab" aria-selected={cardTab === 'market'} onClick={() => setCardTab('market')}>公共卡池 · 4+1</button><button role="tab" aria-selected={cardTab === 'hand'} onClick={() => setCardTab('hand')}>我的手牌 · {you?.hand.length || 0}/3</button></div><div className={`dock-content ${mobileCardsOpen ? 'is-open' : ''}`}><div className="market-section"><div className="section-heading"><div><strong>公共卡池</strong><small>4 张可选 · 所有人共享</small></div><span>抽哪格，预览牌补哪格</span></div><div className="market-cards">{game.market.slots.map((card, i) => <div key={i} className={flashSlot === i ? 'card-arrived' : ''}><CardTile card={card} eyebrow={`公共卡位 ${i + 1}`} disabled={!cardReady || (you?.hand.length || 0) >= 3} disabledReason={marketReason} onAction={() => action({ type: 'draw', slot: i, cardInstanceId: card.instanceId })} onInspect={setInspectCard}/></div>)}<div className="next-card"><CardTile card={game.market.nextCard} eyebrow="下一张 · 只预览" preview disabled disabledReason="预览牌不可直接抽取" onInspect={setInspectCard}/></div></div></div><div className="hand-section"><div className="section-heading"><div><strong>我的手牌</strong><small>{you?.hand.length || 0} / 3 张 · 反应卡受击时使用</small></div></div><div className="hand-cards">{you?.hand.map(card => <CardTile key={card.instanceId} card={card} selected={selectedCard === card.instanceId} disabled={!cardReady || CARDS[card.id].reaction || card.id === 'laoda_elbow' && !elbowTargetAvailable} disabledReason={CARDS[card.id].reaction ? '受到攻击时在反应面板使用' : handReason || (card.id === 'laoda_elbow' && !elbowTargetAvailable ? '没有合法目标：先移动到对手相邻格' : undefined)} onAction={() => { setSelectedCard(selectedCard === card.instanceId ? null : card.instanceId); setFirstSwapTarget(null); setMobileCardsOpen(false); }} onInspect={setInspectCard}/>)}{!you?.hand.length && <p className="empty-hand">暂无手牌。你仍可移动或直接结束回合；想获得卡牌时再从公共卡池抽一张。</p>}</div></div></div></section>

      <div className="mobile-tools" aria-label="比赛信息"><button onClick={() => setMobilePanel('ranking')}>排行榜</button><button onClick={() => setMobilePanel('shop')}>商店</button><button onClick={() => setMobilePanel('events')}>战报</button><button onClick={() => setMobilePanel('vote')}>{view.vote ? '投票待处理' : '结束本局'}</button></div>
      {mobilePanel === 'shop' && !game.shop && <div className="mobile-no-shop">地图商店尚未出现。<button onClick={() => setMobilePanel(null)}>关闭</button></div>}
      {mobilePanel && <button className="mobile-shade" aria-label="关闭信息面板" onClick={() => setMobilePanel(null)}/>}
      {mobileCardsOpen && <button className="mobile-shade card-shade" aria-label="关闭卡牌面板" onClick={() => setMobileCardsOpen(false)}/>}
      <div className="mobile-action-bar"><div className="mobile-prompt" role="status"><b>{reacting ? '需要你反应' : yourTurn ? '轮到你了！' : '等待' + activePlayer?.name + '行动…'}</b><span>{connection !== '已连接' ? '连接中，恢复后再操作' : selected ? '请选择牢大肘击的攻击目标。' : yourTurn ? game.cardAction !== 'none' ? '本回合卡牌操作已完成，仍可移动。' : '点击绿色格子移动；可抽1张或使用1张牌。' : stageName + ' · 可以查看地图、卡牌和战报'}</span></div><div className="mobile-primary-actions"><button onClick={() => { setCardTab('market'); setMobileCardsOpen(true); }}>公共卡池</button><button onClick={() => { setCardTab('hand'); setMobileCardsOpen(true); }}>我的手牌 {you?.hand.length || 0}/3</button><button className="end-turn" disabled={!yourTurn || pendingDecision || connection !== '已连接' || game.phase !== 'playing'} onClick={() => action({ type: 'end' })}>结束回合</button></div>{selected && <button className="mobile-cancel" onClick={() => { setSelectedCard(null); setFirstSwapTarget(null); }}>取消选牌</button>}{(!yourTurn || pendingDecision) && <small>{!yourTurn ? '现在不是你的回合' : '等待当前效果结算'}</small>}</div>
      {import.meta.env.DEV && view.seats[0]?.id === view.you && <details className="debug-panel"><summary>本地开发调试 · 房主专用</summary><p>设置站位、卡牌、机关、金币和AP；导出包含随机种子及所有手牌。</p><div>{['air-defense', 'cannon-chain', 'collision', 'full-hand', 'throne-swap'].map(scene => <button key={scene} onClick={() => socket.emit('debug:scenario', { expectedVersion: game.version, name: scene }, (r: Reply) => { if (!r.ok) setError(r.reason || '场景失败'); })}>{scene}</button>)}</div><textarea value={debugJson} onChange={e => setDebugJson(e.target.value)} rows={4} aria-label="调试补丁 JSON"/><div><button onClick={() => { try { socket.emit('debug:patch', { expectedVersion: game.version, patch: JSON.parse(debugJson) }, (r: Reply) => { if (!r.ok) setError(r.reason || '调试修改失败'); }); } catch { setError('JSON 格式错误'); } }}>应用补丁</button><button onClick={() => socket.emit('debug:export', (r: Reply & { json?: string }) => { if (!r.ok || !r.json) return setError(r.reason || '导出失败'); const url = URL.createObjectURL(new Blob([r.json], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `elbow-mayhem-${game.matchId}.json`; link.click(); URL.revokeObjectURL(url); })}>导出复现</button></div></details>}
    </main>}

    {game?.phase === 'finished' && <ResultDialog standings={standings} startedAt={game.startedAt} finishedAt={game.finishedAt} reason={view?.finishReason || null} isHost={view?.seats[0]?.id === view?.you} onRematch={() => simple('rematch')} onReturn={leaveRoom} onCloseRoom={() => setCloseConfirm(true)}/>}
    {boxDecision && <div className="modal-backdrop"><section className="decision-dialog" role="dialog" aria-modal="true"><Glyph name="gift" size={58}/><h2>你打开了盲盒</h2><p>获得「{CARDS[boxDecision.card.id].name}」。手牌已满，{view?.timedTurns ? `请在 ${boxSeconds} 秒内` : '请'}替换一张或放弃。</p><div className="replacement-cards">{you?.hand.map(c => <button key={c.instanceId} onClick={() => action({ type: 'box', choice: 'replace', replaceInstanceId: c.instanceId })}><Glyph name={c.id} size={28}/>替换 {CARDS[c.id].name}</button>)}</div><button className="text-button" onClick={() => action({ type: 'box', choice: 'abandon' })}>放弃奖励</button></section></div>}
    {inspectCard && <div className="modal-backdrop card-detail-backdrop" onMouseDown={() => setInspectCard(null)}><section className="card-detail-dialog" role="dialog" aria-modal="true" aria-label={`${CARDS[inspectCard].name}完整效果`} onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setInspectCard(null)} aria-label="关闭">×</button><div className={`detail-icon rarity-${CARDS[inspectCard].rarity}`}><Glyph name={inspectCard} size={96}/></div><span className="eyebrow">{CARDS[inspectCard].rarity === 'common' ? '普通' : CARDS[inspectCard].rarity === 'rare' ? '稀有' : '传奇'} · {CARDS[inspectCard].reaction ? '反应牌' : '主动牌'}</span><h2>{CARDS[inspectCard].name}</h2><p>{CARD_HELP[inspectCard]}</p><small>点击卡牌本体执行抽牌或选牌；“效果详情”只查看说明。</small></section></div>}
    {showRules && <div className="modal-backdrop" onMouseDown={() => setShowRules(false)}><section className="rules-dialog" role="dialog" aria-modal="true" aria-label="游戏规则" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowRules(false)} aria-label="关闭">×</button><div className="eyebrow">随时可以回来查看</div><h2>游戏规则</h2><div className="rules-grid"><article><Glyph name="crown" size={30}/><h3>抢占中心</h3><p>全员完成行动后结算位置分：中心3、内环2、第二环1。王座连续占据从第三次起每轮1分。</p></article><article><Glyph name="move" size={30}/><h3>移动与回合</h3><p>每回合3基础AP，普通相邻移动花1AP。每个个人回合只能抽一张公共牌或主动使用一张手牌。</p></article><article><Glyph name="gift" size={30}/><h3>公共 4 + 1</h3><p>四张牌可抽，一张下一张预览。抽走哪个卡位，原预览就补入哪个卡位；其他卡位不动。</p></article><article><Glyph name="shop" size={30}/><h3>地图资源</h3><p>礼盒要停在格上才领。商店要站在本格或相邻格，花1AP和金币购买。</p></article></div><h3>地图图例</h3><div className="rules-legend">{MAP_LEGEND.map(item => <div key={item.name}><Glyph name={item.name} size={27}/>{item.label}</div>)}</div><div className="rules-actions"><button className="secondary" onClick={() => { setShowRules(false); setShowGuide(true); }}>重看新手教学</button><button className="primary" onClick={() => { setShowRules(false); setShowAtlas(true); }}>查看当前卡牌</button></div></section></div>}
    {showAtlas && <div className="modal-backdrop" onMouseDown={() => setShowAtlas(false)}><section className="atlas-dialog" role="dialog" aria-modal="true" aria-label="正式卡牌图鉴" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowAtlas(false)} aria-label="关闭">×</button><div className="eyebrow">完整卡牌图鉴</div><h2>当前正式卡牌：牢大肘击</h2><div className="atlas-grid">{ACTIVE_CARD_IDS.map(id => <CardTile key={id} card={{ id, instanceId: `atlas-${id}` }} onInspect={setInspectCard}/>)}</div></section></div>}
    {showGuide && <Guide onClose={closeGuide}/>}
    {closeConfirm && <div className="modal-backdrop"><section className="decision-dialog" role="dialog" aria-modal="true" aria-label="确认关闭房间"><h2>确认关闭房间</h2><p>关闭房间将结束所有玩家的当前游戏，且不会产生比赛胜负，确定关闭吗？</p><div className="finish-actions"><button className="secondary" onClick={() => setCloseConfirm(false)}>取消</button><button className="primary" onClick={closeRoom}>确定关闭房间</button></div></section></div>}
    {diagnosticsEnabled && <Diagnostics connection={connection} transport={transport} serverAddress={window.location.origin} playerId={view?.you} actorId={activeId} phase={view?.stage || undefined} lastOperation={lastOperation} lastAck={lastAck} lastErrorCode={lastErrorCode}/>}
    {updateAvailable && <div className="version-banner" role="alert">检测到游戏新版本。请刷新页面，避免新旧规则或界面混用。<button onClick={() => window.location.reload()}>刷新游戏</button></div>}
    {error && <div className="toast" role="alert" onClick={() => setError('')}><strong>操作未完成</strong><span>{error}</span><button aria-label="关闭提示">×</button></div>}
  </div>;
}

declare global { interface Window { badFriendsRoot?: Root } }
window.badFriendsRoot ??= createRoot(document.getElementById('root')!);
window.badFriendsRoot.render(<React.StrictMode>{isEditor ? <MapEditor/> : isRealtime ? <RealtimeApp/> : <App />}</React.StrictMode>);







