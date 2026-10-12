export const CARD_PROTOCOL = 3;
export const RT_CONFIG = { tickMs: 50, broadcastMs: 100, maxEnergy: 10, initialEnergy: 5, regenMs: 3000, respawnMs: 5000, matchMs: 180000, scoreMs: 10000, resourceMs: 15000, springMs: 20000, killScore: 2, chainLimit: 8 };
export const CHARACTERS = {
  laoda: { name: '牢大', hp: 100, moveScale: 1, regenScale: 1, damageScale: 1, resistance: 0, elbowDamage: 5, description: '近战控制：牢大肘击额外造成5伤害' },
  tank: { name: '铁头哥', hp: 140, moveScale: 1.3, regenScale: 1, damageScale: 1, resistance: 1, elbowDamage: 0, description: '坦克：敌方直接击退减少1格，移动慢30%；机关弹射不减免' },
  mouse: { name: '闪电鼠', hp: 75, moveScale: .7, regenScale: 1, damageScale: 1, resistance: 0, elbowDamage: 0, description: '高机动：移动、冲刺快30%，生命较少' },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export type Skill = { name: string; description: string; energyCost: number; windup: number; recovery: number; targetType: 'cell' | 'player' | 'direction' | 'self'; range: number; effect: 'move' | 'hit' | 'heal' | 'blink' | 'area' | 'spring'; damage?: number; push?: number; stun?: number; heal?: number; steps?: number };
export const SKILLS = {
  move: { name: '普通移动', description: '相邻1格，1秒完成，50%时切换逻辑格', energyCost: 1, windup: 500, recovery: 500, targetType: 'cell', range: 1, effect: 'move', steps: 1 },
  elbow: { name: '牢大肘击', description: '前摇0.3秒；相邻目标15伤害、推2格、晕1秒；可预判目标', energyCost: 3, windup: 300, recovery: 0, targetType: 'player', range: 1, effect: 'hit', damage: 15, push: 2, stun: 1000 },
  dash: { name: '冲刺', description: '沿方向移动2格，0.6秒；每段50%切格，受阻停止', energyCost: 2, windup: 150, recovery: 450, targetType: 'direction', range: 2, effect: 'move', steps: 2 },
  heal: { name: '治疗', description: '前摇1秒，恢复25 HP', energyCost: 3, windup: 1000, recovery: 0, targetType: 'self', range: 0, effect: 'heal', heal: 25 },
  heavy: { name: '重击', description: '前摇0.8秒，相邻目标30伤害，击退1格', energyCost: 4, windup: 800, recovery: 0, targetType: 'player', range: 1, effect: 'hit', damage: 30, push: 1 },
  blink: { name: '闪现', description: '前摇0.5秒，传送到3格内空地', energyCost: 4, windup: 500, recovery: 0, targetType: 'cell', range: 3, effect: 'blink' },
  area: { name: '范围肘击', description: '前摇0.7秒，周围1格敌人各受10伤害、击退1格', energyCost: 5, windup: 700, recovery: 0, targetType: 'self', range: 1, effect: 'area', damage: 10, push: 1 },
  spring: { name: '放置弹簧', description: '前摇0.6秒，相邻空格放置20秒弹簧；推2格，最多2个', energyCost: 3, windup: 600, recovery: 0, targetType: 'cell', range: 1, effect: 'spring' },
} satisfies Record<string, Skill>;
export type SkillId = keyof typeof SKILLS;
export const DEFAULT_DECK: SkillId[] = ['elbow', 'dash', 'heal', 'heavy', 'blink', 'area', 'spring', 'elbow'];
export const validDeck = (value: unknown): value is SkillId[] => Array.isArray(value) && value.length === 8 && value.every(id => typeof id === 'string' && id !== 'move' && Object.hasOwn(SKILLS, id));

export function migrateDeck(value:unknown):SkillId[]|null {
 if(!Array.isArray(value)||value.length!==8||!value.every(id=>typeof id==='string'&&Object.hasOwn(SKILLS,id)))return null;
 return value.map((id,i)=>id==='move'?DEFAULT_DECK[i]:id) as SkillId[];
}
