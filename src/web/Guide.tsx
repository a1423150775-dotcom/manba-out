import { useState } from 'react';
import { Glyph } from './icons';

const STEPS = [
  { title: '如何获胜', icon: 'crown', text: '占据中心区域，累计积分最高者获胜！中心王座3分、第一圈2分、第二圈1分、外围0分。所有玩家行动完后，每大轮统一结算。房主可在开局前设置总轮数。', tip: '先找棋盘中央的金色王冠，再看橙色第一圈和浅黄色第二圈。' },
  { title: '如何移动', icon: 'move', text: '每个个人回合有3 AP。点击棋盘上高亮的相邻合法格，每移动一步消耗1 AP。即使没有手牌，也可以先移动；移动与卡牌操作顺序不限。', tip: '轮到你时，自己的棋子和可移动格都会高亮。' },
  { title: '如何抽牌', icon: 'gift', text: '点击底部公共卡池的任意一张可选明牌，把它抽入手牌。每回合最多做一次卡牌操作，手牌上限3张；抽牌不妨碍继续移动。', tip: '没有手牌时可以抽一张，也可以不抽直接移动或结束回合。' },
  { title: '如何出牌', icon: 'target', text: '点击自己的主动手牌进入目标选择，再按棋盘高亮提示确认。每回合抽牌或主动出牌只能选一项；出牌之后仍可用剩余AP移动。', tip: '卡牌的“效果详情”显示完整说明；反应卡只在自己受击时使用。' },
  { title: '公共4+1怎样刷新', icon: 'laoda_elbow', text: '4张明牌由所有玩家共享，旁边的第5张只是下一张预览。你抽走哪个卡位，已经公开的预览牌就补进那个位置，再揭示新的预览牌。', tip: '另三个卡位保持原样。无人抽牌时，回合切换、出牌和购物都不会刷新卡池。' },
  { title: '盲盒与商店', icon: 'shop', text: '地图上的礼盒是免费盲盒，必须到达礼盒格才能领取。走到商店所在格或相邻格，才能花金币和1 AP购买。', tip: '资源就在棋盘上，不能从任意位置打开商店或盲盒。' },
  { title: '留意推挤和机关', icon: 'spring', text: '牢大肘击会推动玩家；被推的人可能撞上其他玩家，或触发地图固定弹簧。出界玩家下一大轮复活。', tip: '棋盘下方有地图图例，带箭头的机关按箭头方向生效。' },
  { title: '如何结束回合', icon: 'coin', text: '移动、抽牌和出牌没有固定先后顺序。你也可以跳过卡牌操作，直接点击“结束我的回合”。所有玩家结束个人回合后，统一结算本大轮的区域积分。', tip: 'AP用完也不会自动结束；由当前玩家主动点击结束按钮。' },
] as const;

export function Guide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  return <div className="modal-backdrop" role="presentation"><section className="guide-dialog" role="dialog" aria-modal="true" aria-label="新手引导">
    <div className="guide-top"><span>新手引导 · {index + 1} / {STEPS.length}</span><button onClick={onClose}>跳过</button></div>
    <div className="guide-illustration"><span className="guide-orbit orbit-one"/><span className="guide-orbit orbit-two"/><Glyph name={step.icon} size={110}/></div>
    <div className="guide-copy"><h2>{step.title}</h2><p>{step.text}</p><small>{step.tip}</small></div>
    <div className="guide-bottom"><div className="guide-progress">{STEPS.map((_, i) => <button key={i} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} aria-label={`第${i + 1}步`}/>)}</div><div><button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>上一步</button><button className="primary" onClick={() => index === STEPS.length - 1 ? onClose() : setIndex(index + 1)}>{index === STEPS.length - 1 ? '开始游戏' : '下一步'}</button></div></div>
  </section></div>;
}
