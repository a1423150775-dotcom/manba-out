import type { VisiblePlayer } from './Board';
import { Glyph } from './icons';

export function ResultDialog({ standings, startedAt, finishedAt, reason, isHost, onRematch, onReturn, onCloseRoom }: {
  standings: VisiblePlayer[];
  startedAt: number;
  finishedAt: number | null;
  reason: 'normal' | 'vote' | null;
  isHost: boolean;
  onRematch: () => void;
  onReturn: () => void;
  onCloseRoom: () => void;
}) {
  const seconds = Math.max(0, Math.floor(((finishedAt || Date.now()) - startedAt) / 1000));
  return <div className="modal-backdrop"><section className="result-dialog" role="dialog" aria-modal="true" aria-label="比赛结果">
    <Glyph name="crown" size={54}/><h2>肘击大乱斗 · 本局结束</h2>
    <p>{reason === 'vote' ? '结束原因：全体玩家投票提前结束。未完成的大轮没有额外计分。' : '结束原因：完成全部大轮。'}</p>
    {standings.map((player, index) => <div className="result-row" key={player.id}><b>#{index + 1}</b><span>{player.name}</span><strong>{player.score} 分</strong></div>)}
    <small>比赛持续 {Math.floor(seconds / 60)} 分 {seconds % 60} 秒</small>
    <div className="result-actions">
      {isHost ? <button className="primary" onClick={onRematch}>重新开始</button> : <span>重新开始由房主发起</span>}
      <button className="secondary" onClick={onReturn}>返回大厅</button>
      {isHost && <button className="text-button" onClick={onCloseRoom}>关闭房间</button>}
    </div>
  </section></div>;
}
