import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../core/game';
import { turnGuidance } from './turn-guidance';
import { VictoryGoal } from './VictoryGoal';

describe('回合引导', () => {
  it('空手牌时明确允许先移动或直接结束', () => {
    const text = turnGuidance({ ap: 3, moveAp: 0, cardAction: 'none', handCount: 0 });
    expect(text).toContain('还剩3 AP');
    expect(text).toContain('你目前没有手牌');
    expect(text).toContain('先移动或直接结束回合');
  });

  it('手牌已满及完成卡牌操作时给出不同指引', () => {
    expect(turnGuidance({ ap: 2, moveAp: 0, cardAction: 'none', handCount: 3 })).toContain('手牌已满');
    expect(turnGuidance({ ap: 2, moveAp: 0, cardAction: 'draw', handCount: 1 })).toContain('仍可继续移动');
    expect(turnGuidance({ ap: 0, moveAp: 0, cardAction: 'play', handCount: 0 })).toContain('可以结束回合');
  });
});

describe('胜利条件展示', () => {
  it.each([[2, 18], [3, 13], [4, 10], [5, 10], [6, 10]])('%i人局显示%i大轮及全部区域分值', (playerCount, rounds) => {
    const seats = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `玩家${i}`, color: '#ffffff' }));
    const game = createGame(seats, 1000, 100);
    const html = renderToStaticMarkup(<VictoryGoal maxRounds={game.maxRounds}/>);
    expect(html).toContain('占据中心区域，累计积分最高者获胜！');
    expect(html).toContain('中心王座：3分');
    expect(html).toContain('第一圈：2分');
    expect(html).toContain('第二圈：1分');
    expect(html).toContain('外围：0分');
    expect(html).toContain(`本局共 ${rounds} 大轮`);
  });
});
