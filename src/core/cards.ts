export type CardId = 'laoda_elbow' | 'punch' | 'hook' | 'rocket_boots' | 'banana' | 'ice' | 'shield' | 'dodge' | 'barricade' | 'dismantle' | 'supply_dash'
  | 'swap' | 'magnet' | 'air_cannon' | 'launch_trap' | 'time_bomb' | 'mirror' | 'gravity_well' | 'friend_delivery' | 'remote'
  | 'teleport' | 'tornado' | 'quake' | 'swap_storm' | 'gathering';
export type Card = { instanceId: string; id: CardId };
export const CARDS: Record<CardId, { name: string; rarity: 'common' | 'rare' | 'legendary'; reaction: boolean; detail: string }> = {
  laoda_elbow: { name: '牢大肘击', rarity: 'common', reaction: false, detail: '相邻目标击退2格；出界击杀得2分。' },
  punch: { name: '友情一拳', rarity: 'common', reaction: false, detail: '推开相邻玩家2格。' },
  hook: { name: '友情钩锁', rarity: 'common', reaction: false, detail: '拉近同一直线上2～3格的首个玩家。' },
  rocket_boots: { name: '火箭鞋', rarity: 'common', reaction: false, detail: '指定方向直冲1～4格，遇阻停下。' },
  banana: { name: '香蕉皮', rarity: 'common', reaction: false, detail: '相邻格放置滑行陷阱。' },
  ice: { name: '冰冻地板', rarity: 'common', reaction: false, detail: '相邻格放置冰面，踩中者下回合基础AP减1。' },
  launch_trap: { name: '弹射陷阱', rarity: 'rare', reaction: false, detail: '相邻格放置定向弹射陷阱。' },
  shield: { name: '护盾', rarity: 'common', reaction: true, detail: '反应：抵消本次针对自己的强制位移。' },
  dodge: { name: '紧急闪避', rarity: 'common', reaction: true, detail: '反应：移到相邻空格并取消本根敌对位移。' },
  barricade: { name: '路障', rarity: 'common', reaction: false, detail: '相邻格设置临时障碍。' },
  dismantle: { name: '拆迁队', rarity: 'common', reaction: false, detail: '拆除3格内一处临时障碍或机关。' },
  supply_dash: { name: '补给冲刺', rarity: 'common', reaction: false, detail: '本回合额外获得2点只用于普通移动的AP。' },
  swap: { name: '乾坤挪移', rarity: 'rare', reaction: false, detail: '与3格内玩家交换位置。' },
  magnet: { name: '超级磁铁', rarity: 'rare', reaction: false, detail: '将2格内其他玩家各向自己拉1格。' },
  mirror: { name: '反弹镜', rarity: 'rare', reaction: true, detail: '反应：抵消并反弹拳头、钩锁或空气炮。' },
  air_cannon: { name: '空气炮', rarity: 'rare', reaction: false, detail: '前方两格120°扇形，径向推2格。' },
  time_bomb: { name: '定时炸弹', rarity: 'rare', reaction: false, detail: '放置炸弹，下一大轮开始爆炸。' },
  gravity_well: { name: '引力井', rarity: 'rare', reaction: false, detail: '下一大轮将2格内玩家向井拉近1格。' },
  friend_delivery: { name: '友情快递', rarity: 'rare', reaction: false, detail: '将3格内目标随机传送到外围。' },
  remote: { name: '机关遥控器', rarity: 'rare', reaction: false, detail: '临时改变弹簧或弹射陷阱方向。' },
  teleport: { name: '空间传送', rarity: 'legendary', reaction: false, detail: '传送自己到任意合法空格。' },
  tornado: { name: '龙卷风', rarity: 'legendary', reaction: false, detail: '让指定中心的一圈玩家顺时针旋转一格。' },
  quake: { name: '地震炸弹', rarity: 'legendary', reaction: false, detail: '指定范围内玩家向外击退2格。' },
  swap_storm: { name: '交换风暴', rarity: 'legendary', reaction: false, detail: '交换恰好两名其他玩家的位置。' },
  gathering: { name: '全员集合', rarity: 'legendary', reaction: false, detail: '将其他玩家传送到中心七格空位。' },
};
export const IMPLEMENTED_CARDS: CardId[] = ['punch', 'hook', 'rocket_boots', 'banana', 'ice', 'shield', 'dodge', 'barricade', 'dismantle', 'supply_dash', 'swap', 'magnet', 'air_cannon', 'launch_trap', 'time_bomb', 'mirror', 'gravity_well', 'friend_delivery', 'remote', 'teleport', 'tornado', 'quake', 'swap_storm', 'gathering'];
// Only this list is registered for formal-match generation. Other definitions
// and effects remain for development scenarios and future redesign.
export const ACTIVE_CARD_IDS: readonly CardId[] = ['laoda_elbow'];
