type GuidanceState = {
  ap: number;
  moveAp: number;
  cardAction: 'none' | 'draw' | 'play';
  handCount: number;
};

export function turnGuidance({ ap, moveAp, cardAction, handCount }: GuidanceState): string {
  const remaining = ap + moveAp;
  if (cardAction !== 'none') return remaining > 0
    ? '本回合卡牌操作已完成，仍可继续移动。操作完毕后请主动结束回合。'
    : '本回合卡牌操作已完成，行动力已用完，可以结束回合。';

  const lead = remaining > 0
    ? `你的回合：还剩${remaining} AP，可以移动，并选择抽取1张公共卡牌或使用1张手牌。移动与卡牌操作顺序不限，也可以跳过卡牌直接结束回合。`
    : '你的回合：行动力已用完。仍可抽牌或使用合法的零AP手牌，也可以直接结束回合。';
  if (handCount === 0) return `${lead}你目前没有手牌，可以从公共卡池抽取一张；即使不抽牌，也可以先移动或直接结束回合。`;
  if (handCount >= 3) return `${lead}手牌已满，请先使用手牌腾出位置，才能再抽牌；也可以移动或直接结束回合。`;
  return lead;
}
