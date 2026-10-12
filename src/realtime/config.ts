export const CARD_PROTOCOL=6;
export const RT_CONFIG={tickMs:50,moveDamage:5,appleHp:30,appleEnergy:4,moveRecoveryMs:200,broadcastMs:100,maxEnergy:10,initialEnergy:5,regenPerSecond:1.1,regenMs:1000/1.1,respawnMs:5000,matchMs:180000,resourceMs:15000,killScore:2,assistScore:1,assistMs:5000,chainLimit:32,chargeMs:900,chargeSteps:3,chargeSide:5,coverDecay:2,mineDecay:2,fireFlightMs:1700,hookMs:400,gravity:9.8,arrowSpeed:3.5/Math.sqrt(1.4/9.8),bodyRadius:.28,obstacleRadius:.48,bodyHeight:1,mineHeight:.1,launchHeight:.7,maxStep:.5,maxObjects:128,maxProjectiles:128};
// Exact 2.1 card parameters supersede 2.0 damage/movement/resistance modifiers; HP retained.
export const CHARACTERS={
laoda:{name:'牢大',hp:100,moveScale:1,regenScale:1,damageScale:1,resistance:0,elbowDamage:0,description:'均衡角色 · 100生命'},
tank:{name:'铁头哥',hp:140,moveScale:1,regenScale:1,damageScale:1,resistance:0,elbowDamage:0,description:'重装角色 · 140生命；2.1统一移动与击退'},
mouse:{name:'闪电鼠',hp:75,moveScale:1,regenScale:1,damageScale:1,resistance:0,elbowDamage:0,description:'轻型角色 · 75生命；2.1统一移动速度'},} as const;
export type CharacterId=keyof typeof CHARACTERS;
export type Skill={name:string;description:string;energyCost:number;windup:number;recovery:number;targetType:'cell'|'player'|'direction';range:number;effect:string;damage?:number;push?:number;stun?:number;motion?:boolean;obstacleDamage?:number;ringDamage?:number;objectHp?:number;units?:number};
export const SKILLS={
move:{name:'普通移动',description:'1能量，1秒移动相邻格，50%切格；主动撞击占格玩家5HP；0.2秒后摇可用下次移动取消；上下高度差最多0.5',energyCost:1,windup:0,recovery:1000,targetType:'cell',range:1,effect:'move',motion:true},
elbow:{name:'牢大肘击',description:'0.3秒前摇，相邻目标30伤害、击退1格、击晕1.2秒；可攻击障碍',energyCost:2,windup:300,recovery:0,targetType:'player',range:1,effect:'hit',damage:30,push:1,stun:1200},
charge:{name:'大运',description:'0.6秒前摇，0.9秒冲锋3格；撞击35伤害/晕1.2秒，结束向顺时针60°甩飞',energyCost:3,windup:600,recovery:0,targetType:'direction',range:3,effect:'charge',motion:true,damage:35,stun:1200,obstacleDamage:10},
fireball:{name:'火球',description:'0.3秒前摇，1.7秒飞行；中心40、相邻30伤害，包含自己和障碍',energyCost:4,windup:300,recovery:0,targetType:'cell',range:4,effect:'fireball',damage:40,ringDamage:30},
blink:{name:'闪现',description:'0.5秒前摇，瞬移至1～3格合法落点；忽略路径障碍',energyCost:2,windup:500,recovery:0,targetType:'cell',range:3,effect:'blink',motion:true},
cover:{name:'速凝掩体',description:'0.5秒前摇，1～2格放置三连墙，每格10HP、每秒损耗2HP，最多5秒；全体合法才生成',energyCost:2,windup:500,recovery:0,targetType:'cell',range:2,effect:'cover',objectHp:10,units:3},
mine:{name:'地雷',description:'0.5秒前摇，1～2格放置10HP地雷；每秒失去2HP，踩踏或归零爆炸50/10伤害',energyCost:3,windup:500,recovery:0,targetType:'cell',range:2,effect:'mine',objectHp:10,damage:50,ringDamage:10},
hook:{name:'钩锁',description:'0.5秒前摇，1～3格无遮挡目标5伤害、晕1秒，0.4秒拉至面前',energyCost:3,windup:500,recovery:0,targetType:'player',range:3,effect:'hook',damage:5,stun:1000},
basic:{name:'平A',description:'0.3秒前摇，相邻玩家或障碍20伤害，无控制',energyCost:1,windup:300,recovery:0,targetType:'player',range:1,effect:'hit',damage:20},
arrow:{name:'弓箭',description:'0.7秒前摇，固定初速抛体；首个有效目标20伤害，可切换高低弹道，不命中地雷',energyCost:2,windup:700,recovery:0,targetType:'cell',range:16,effect:'arrow',damage:20},
} satisfies Record<string,Skill>;
export type SkillId=keyof typeof SKILLS;
export const DEFAULT_DECK:SkillId[]=['elbow','fireball','blink','arrow','charge','cover','mine','hook'];
export const validDeck=(v:unknown):v is SkillId[]=>Array.isArray(v)&&v.length===8&&v.every(x=>typeof x==='string'&&x!=='move'&&Object.hasOwn(SKILLS,x));
const old:Record<string,SkillId>={dash:'charge',heal:'mine',heavy:'basic',area:'fireball',spring:'cover'};
export function migrateDeck(v:unknown):SkillId[]|null{if(!Array.isArray(v)||v.length!==8||!v.every(x=>typeof x==='string'&&(Object.hasOwn(SKILLS,x)||Object.hasOwn(old,x))))return null;return v.map((x,i)=>x==='move'?DEFAULT_DECK[i]:old[x]||x) as SkillId[];}
