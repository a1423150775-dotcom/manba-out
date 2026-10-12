type AckInfo = { action: string; requestId: string; ok: boolean; code: string; reason?: string };

export function Diagnostics({ connection, transport, serverAddress, playerId, actorId, phase, lastOperation, lastAck, lastErrorCode }: {
  connection: string;
  transport: string;
  serverAddress: string;
  playerId?: string;
  actorId?: string;
  phase?: string;
  lastOperation: string;
  lastAck: AckInfo | null;
  lastErrorCode: string;
}) {
  return <details className="diagnostics" open>
    <summary>连接诊断 · 不显示身份令牌</summary>
    <dl>
      <dt>Socket.IO 状态</dt><dd>{connection} · {transport}</dd>
      <dt>当前服务器地址</dt><dd>{serverAddress}</dd>
      <dt>当前玩家 ID</dt><dd>{playerId || '未绑定'}</dd>
      <dt>行动玩家 ID</dt><dd>{actorId || '无'}</dd>
      <dt>当前阶段</dt><dd>{phase || '大厅'}</dd>
      <dt>最近一次操作</dt><dd>{lastOperation || '无'}</dd>
      <dt>最近一次 ACK</dt><dd>{lastAck ? `${lastAck.ok ? '成功' : '失败'} · ${lastAck.code} · ${lastAck.requestId}${lastAck.reason ? ` · ${lastAck.reason}` : ''}` : '无'}</dd>
      <dt>最近错误代码</dt><dd>{lastErrorCode || '无'}</dd>
    </dl>
  </details>;
}
