import { useEffect, useState } from 'react';
import { useBoardViewport } from './useBoardViewport';
import { board, DIRS, add, distance, equal, getAirCannonCells, getAirCannonKnockbackDirection, key, onBoard, scale, type Hex } from '../core/hex';
import type { CardId } from '../core/cards';
import type { GameAction, GameState } from '../core/game';
import { Glyph } from './icons';

export type VisiblePlayer = GameState['players'][number] & { handCount: number };
export type VisibleGame = Omit<GameState, 'players' | 'seed' | 'random'> & { players: VisiblePlayer[] };
export type Motion = { id: string; from: Hex | null; to: Hex | null; points: Hex[]; kind: 'move' | 'push' | 'teleport' | 'out' | 'respawn' };
export type Feedback = { id: number; kind: 'move' | 'push' | 'teleport' | 'out' | 'respawn' | 'score' | 'box' | 'buy' | 'play' | 'draw'; icon: CardId | 'gift' | 'shop' | 'out' | 'crown' | 'move' | 'spring'; text: string };
export const xy = (h: Hex) => ({ x: 470 + 46 * Math.sqrt(3) * (h.q + h.r / 2), y: 340 + 69 * h.r });
export const springArrowRotation = (direction: number) => 90 - direction * 60;
const points = (h: Hex) => { const p = xy(h); return Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${p.x + 43 * Math.cos(a)},${p.y + 43 * Math.sin(a)}`; }).join(' '); };
const directions = ['东', '东北', '西北', '西', '西南', '东南'];
export { directions };

type Props = {
  game: VisibleGame; you?: VisiblePlayer; yourTurn: boolean; selected?: CardId; direction: number;
  firstSwapTarget: string | null; dodgeCardId: string | null; reacting: boolean; motions: Motion[]; feedback: Feedback | null;
  onAction: (action: GameAction) => void; onTarget: (playerId: string) => void;
  onInvalid: (reason: string) => void; cardInstanceId?: string; replaceTrapId?: string;
};

function deviceAt(game: VisibleGame, cell: Hex) {
  const trap = game.traps.find(item => equal(item.at, cell));
  const timed = game.timed.find(item => equal(item.at, cell));
  const obstacle = game.obstacles.find(item => equal(item.at, cell));
  return { trap, timed, obstacle };
}

export function Board({ game, you, yourTurn, selected, direction, firstSwapTarget, dodgeCardId, reacting, motions, feedback, onAction, onTarget, onInvalid, cardInstanceId, replaceTrapId }: Props) {
  const [inspected, setInspected] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  useEffect(() => { setConfirmTarget(null); }, [game.version, cardInstanceId]);
  const playable = yourTurn && !game.pending && !game.boxDecisions.length && game.phase === 'playing';
  const preview = selected === 'air_cannon' && you?.position ? getAirCannonCells(you.position, direction, 4) : [];
  const caster = game.pending && game.players.find(p => p.id === game.pending!.casterId);
  const incoming = game.pending?.cardId === 'air_cannon' && caster?.position && game.pending.attackDirection !== undefined
    ? getAirCannonCells(caster.position, game.pending.attackDirection, 4)
    : [];
  const ownImpact = game.pending?.targets.find(t => t.id === you?.id);
  const impactPath = ownImpact && ownImpact.steps > 0 && ownImpact.direction >= 0 && ownImpact.direction < 6
    ? Array.from({ length: ownImpact.steps + 1 }, (_, i) => add(ownImpact.at, scale(DIRS[ownImpact.direction], i))).filter(onBoard) : [];
  const selectedPosition = you?.position;
  const owned = you ? [...game.traps, ...game.obstacles, ...game.timed].filter(item => item.ownerId === you.id) : [];
  const cellInfo = board().map(cell => {
    const d = distance(cell), occupant = game.players.find(p => p.position && equal(p.position, cell));
    const { trap, timed, obstacle } = deviceAt(game, cell);
    const box = game.boxes.find(item => equal(item.at, cell));
    const shop = game.shop && equal(game.shop.at, cell);
    const adjacent = selectedPosition ? DIRS.findIndex(v => equal(add(selectedPosition, v), cell)) : -1;
    const span = selectedPosition ? distance(selectedPosition, cell) : 99;
    const empty = !occupant && !obstacle;
    let legal = false;
    if (reacting && dodgeCardId) legal = adjacent >= 0 && empty;
    else if (playable && selected && cardInstanceId) {
      if (selected === 'laoda_elbow' || selected === 'punch') legal = !!occupant && occupant.id !== you?.id && span === 1;
      else if (selected === 'hook') {
        const aligned = DIRS.findIndex(v => selectedPosition && equal(add(selectedPosition, scale(v, span)), cell));
        legal = !!occupant && occupant.id !== you?.id && span >= 2 && span <= 3 && aligned >= 0
          && Array.from({ length: span - 1 }, (_, i) => add(selectedPosition!, scale(DIRS[aligned], i + 1))).every(at => !game.players.some(p => p.position && equal(p.position, at)));
      } else if (['swap', 'friend_delivery'].includes(selected)) legal = !!occupant && occupant.id !== you?.id && span <= 3;
      else if (selected === 'swap_storm') legal = !!occupant && occupant.id !== you?.id && occupant.id !== firstSwapTarget;
      else if (['banana', 'ice', 'launch_trap'].includes(selected)) legal = adjacent >= 0 && empty && !trap && !shop;
      else if (selected === 'barricade') legal = adjacent >= 0 && empty && !trap && !timed && !box && !shop && d !== 0 && !game.players.some(p => equal(p.spawn, cell));
      else if (['time_bomb', 'gravity_well'].includes(selected)) legal = span <= 2 && empty && !trap && !timed && !box && !shop;
      else if (selected === 'dismantle') legal = span <= 3 && (!!obstacle || !!timed || (!!trap && trap.kind !== 'spring'));
      else if (selected === 'remote') legal = span <= 3 && !!trap && ['spring', 'launch'].includes(trap.kind);
      else if (selected === 'teleport') legal = empty || occupant?.id === you?.id;
      else if (selected === 'quake') legal = span <= 3;
      else if (selected === 'tornado') legal = span <= 2;
      if (owned.length >= 2 && ['banana', 'ice', 'launch_trap', 'barricade', 'time_bomb', 'gravity_well'].includes(selected) && !replaceTrapId) legal = false;
    } else if (playable && !selected) legal = game.ap + game.moveAp > 0 && adjacent >= 0 && empty && !!selectedPosition;
    const blast = preview.some(h => equal(h, cell));
    const threatened = incoming.some(h => equal(h, cell)) || !!game.pending?.targets.some(t => equal(t.at, cell));
    return { cell, d, occupant, trap, timed, obstacle, box, shop, adjacent, legal, blast, threatened };
  });

  const activate = (info: typeof cellInfo[number]) => {
    setInspected(key(info.cell));
    if (!info.legal && (info.trap || info.shop || info.box || info.occupant)) return;
    if (!info.legal) { if (playable || reacting) onInvalid(selected ? '这个位置不是当前卡牌的合法目标。请点击高亮格，或查看卡牌效果。' : '只能移动到相邻、无人且没有路障的格子；也请检查剩余AP。'); return; }
    if (reacting && dodgeCardId) return onAction({ type: 'react', choice: 'dodge', cardInstanceId: dodgeCardId, dodgeAt: info.cell });
    if (!selected || !cardInstanceId) return onAction({ type: 'move', direction: info.adjacent });
    if (selected === 'swap_storm' && !firstSwapTarget) return onTarget(info.occupant!.id);
    if (selected === 'laoda_elbow') { setConfirmTarget(info.occupant!.id); return; }
    if (['punch', 'hook', 'swap', 'friend_delivery', 'swap_storm'].includes(selected)) return onAction({ type: 'play', cardInstanceId, targetId: firstSwapTarget || info.occupant!.id, secondTargetId: firstSwapTarget ? info.occupant!.id : undefined });
    onAction({ type: 'play', cardInstanceId, at: info.cell, direction, replaceTrapId });
  };

  const viewport = useBoardViewport(cell => { const info = cellInfo.find(item => key(item.cell) === cell); if (info) activate(info); });
  const inspection = cellInfo.find(item => key(item.cell) === inspected);
  const target = cellInfo.find(item => item.occupant?.id === confirmTarget && item.legal);
  return <div className="board-frame" data-tour="board"><div className="board-tools"><span>拖动平移 · 双指缩放</span><button onClick={viewport.zoomIn} aria-label="放大棋盘">放大</button><button onClick={viewport.reset}>重置视角</button><output aria-label="棋盘缩放">{Math.round(viewport.camera.zoom * 100)}%</output></div><svg {...viewport.handlers} className="board-svg" viewBox="0 0 940 680" role="img" aria-label="六边形竞技场，绿色虚线表示可移动或可选目标，红色区域表示空气炮范围"><defs><marker id="blast-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1 1 7 4 1 7" fill="none" stroke="#b53f3c" strokeWidth="2"/></marker></defs><g className="board-camera" transform={viewport.transform}>
    <g className="layer layer-terrain">{cellInfo.map(({ cell, d }) => <polygon key={key(cell)} points={points(cell)} className={`hex-terrain zone-${Math.min(d, 3)}`} />)}</g>
    <g className="layer layer-control">{cellInfo.filter(x => x.d === 0).map(({ cell }) => { const p = xy(cell); return <g key={key(cell)} transform={`translate(${p.x - 18} ${p.y - 18})`} className="throne-mark"><Glyph name="crown" size={36} /></g>; })}</g>
    <g className="layer layer-devices">{cellInfo.map(({ cell, trap, timed, obstacle }) => {
      const item = obstacle ? 'wall' : timed?.kind || (trap?.kind === 'launch' ? 'launch_trap' : trap?.kind);
      if (!item) return null;
      const p = xy(cell), orient = trap && ['spring', 'launch'].includes(trap.kind) ? trap.direction : null;
      return <g key={key(cell)} className={`map-object object-${item}`} transform={`translate(${p.x - 23} ${p.y - 25})`}><circle cx="23" cy="23" r="23" className="object-disc"/><g transform="translate(6 6)"><Glyph name={item as 'wall' | 'spring' | 'banana' | 'ice' | 'launch_trap' | 'time_bomb' | 'gravity_well'} size={34}/></g>{orient !== null && <g transform={`translate(23 23) rotate(${springArrowRotation(orient)}) translate(-23 -23)`}><path d="M23 0 17 9h12z" className="direction-tip"/></g>}</g>;
    })}</g>
    <g className="layer layer-resources">{cellInfo.map(({ cell, box, shop }) => {
      if (!box && !shop) return null;
      const p = xy(cell), name = box ? 'gift' : 'shop';
      return <g key={key(cell)} className={`map-resource resource-${name}`} transform={`translate(${p.x - 24} ${p.y - 25})`}><circle cx="24" cy="24" r="24" className="resource-disc"/><g transform="translate(6 6)"><Glyph name={name} size={36}/></g></g>;
    })}</g>
    <g className="layer layer-effects">{motions.map(m => <g key={`${m.id}-${m.points.map(key).join('-')}`}>{m.points.length > 1 && <polyline points={m.points.map(at => { const p = xy(at); return `${p.x},${p.y}`; }).join(' ')} className={`motion-trail motion-${m.kind}`} />}{m.to && ['teleport', 'respawn'].includes(m.kind) && (() => { const p = xy(m.to); return <circle cx={p.x} cy={p.y} r="16" className={`motion-ring motion-ring-${m.kind}`}/>; })()}{m.kind === 'out' && m.from && (() => { const p = xy(m.from); return <circle cx={p.x} cy={p.y} r="16" className="motion-ring motion-ring-out"/>; })()}</g>)}{impactPath.length > 1 && <polyline points={impactPath.map(at => { const p = xy(at); return `${p.x},${p.y}`; }).join(' ')} className="incoming-path"/>}</g>
    <g className="layer layer-hitboxes">{cellInfo.map(info => {
      const p = xy(info.cell);
      return <g key={key(info.cell)} className={`cell-hit ${info.legal ? 'is-legal' : ''} ${info.blast ? 'is-blast' : ''} ${info.threatened ? 'is-threatened' : ''}`} data-cell={key(info.cell)} role="button" tabIndex={0} aria-label={`${key(info.cell)}，${info.d === 0 ? '王座3分' : info.d === 1 ? '内环2分' : info.d === 2 ? '第二环1分' : '外围0分'}${info.legal ? '，可选择' : ''}${info.threatened ? '，受攻击范围' : ''}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(info); } }}><polygon points={points(info.cell)} className="cell-overlay" />{info.legal && <circle cx={p.x} cy={p.y} r="6" className="legal-dot"/>}{info.blast && selectedPosition && (() => { const step = getAirCannonKnockbackDirection(selectedPosition, info.cell, direction), tip = xy(add(info.cell, step)); return <path d={`M${p.x - 12} ${p.y + 21} L${p.x - 12 + (tip.x - p.x) * .25} ${p.y + 21 + (tip.y - p.y) * .25}`} className="blast-arrow"/>; })()}</g>;
    })}</g>
    <g className="layer layer-players">{game.players.filter(p => p.position).map(player => { const pos = xy(player.position!), own = player.id === you?.id, active = player.id === game.roundOrder[game.turnIndex]; return <g key={player.id} className={`player-piece ${own ? 'player-own' : ''} ${active ? 'player-active' : ''} ${firstSwapTarget === player.id ? 'player-first-target' : ''}`} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}><circle r="27" fill={player.color} className="player-body"/><circle r="19" fill="rgba(255,255,255,.20)"/><path d="M-8 7q8-10 16 0M-8-7h1m14 0h1" className="player-face"/><rect x="-34" y="28" width="68" height="20" rx="9" className="player-nameplate"/><text y="42" textAnchor="middle" className="player-label">{player.name.slice(0, 5)}</text>{active && <path d="M0-43-8-53H8z" className="active-marker"/>}{own && <circle r="31" className="own-ring"/>}</g>; })}</g>
  </g></svg>{feedback && <div key={feedback.id} className={`feedback-burst kind-${feedback.kind}`} role="status"><Glyph name={feedback.icon} size={24}/><span>{feedback.text}</span></div>}{inspection && <div className="cell-inspection" role="status"><span><b>格子 {inspected}</b> · {inspection.d === 0 ? '王座：3分' : inspection.d === 1 ? '内环：2分' : inspection.d === 2 ? '第二环：1分' : '外围：0分'}{inspection.occupant && ' · ' + inspection.occupant.name}{inspection.trap && (inspection.trap.kind === 'spring' || inspection.trap.kind === 'launch' ? ' · 弹簧向' + directions[inspection.trap.direction] + '弹射2格，可能连锁或出界' : ' · ' + (inspection.trap.kind === 'banana' ? '香蕉：踩中继续滑动' : '冰面：滑行机关'))}{inspection.box && ' · 盲盒：停在此格领取卡牌'}{inspection.shop && ' · 商店：到本格或相邻格，用金币和1 AP购买'}{inspection.obstacle && ' · 路障：阻挡移动'}</span><button onClick={() => setInspected(null)} aria-label="关闭格子说明">×</button></div>}{target && <div className="target-confirm" role="dialog" aria-label="确认肘击目标"><p>对<b>{target.occupant!.name}</b>使用牢大肘击？沿相邻方向击退2格，机关可能改变结果。</p><div><button onClick={() => setConfirmTarget(null)}>取消目标</button><button className="primary" onClick={() => { setConfirmTarget(null); onAction({ type: 'play', cardInstanceId: cardInstanceId!, targetId: target.occupant!.id }); }}>确认肘击</button></div></div>}<div className="board-key"><span><i className="key-legal"/>高亮格可点击</span><span><i className="key-blast"/>技能范围</span><span><i className="key-own"/>你的棋子</span></div></div>;
}
