export function VictoryGoal({ maxRounds }: { maxRounds: number }) {
  return <div className="victory-goal" role="note" aria-label="胜利条件与区域积分">
    <strong>占据中心区域，累计积分最高者获胜！</strong>
    <span>中心王座：3分　第一圈：2分　第二圈：1分　外围：0分</span>
    <span>每大轮结束统一结算 · 本局共 {maxRounds} 大轮</span>
  </div>;
}
