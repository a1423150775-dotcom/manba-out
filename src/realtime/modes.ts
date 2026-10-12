import {DEFAULT_DECK,SKILLS,type SkillId} from './config';
export type Mode='ffa'|'moba'|'siege';
export type Team='blue'|'red';
export type SkillRule={type:'cycle';slotCount:4}|{type:'fixed';slotCount:1|2|3|4};
export const MODE_NAMES={ffa:'自由乱斗',moba:'MOBA基地攻防',siege:'城堡攻防战'};
export const CYCLE:SkillRule={type:'cycle',slotCount:4};
export const MODE_CONFIG={coreHp:350,towerHp:250,gateHp:200,towerRange:4,towerDamage:20,towerInterval:3000,towerWindup:300,coreRange:4,coreInterval:5000,coreWindup:800,buildingHeight:1,minionHp:300,minionDamage:5,minionAttackMs:2000,minionMoveMs:1000,minionWaveMs:15000,minionWaveSize:2,siegeWaveSize:1,siegeWaveMs:45000,minionCap:6,healPerSecond:10,energyPerSecond:1,mobaMs:600000,siegeMs:300000};
export function skillRule(v:unknown):SkillRule{const r=v as SkillRule;if(r?.type==='cycle'&&r.slotCount===4)return{...CYCLE};if(r?.type==='fixed'&&Number.isInteger(r.slotCount)&&r.slotCount>=1&&r.slotCount<=4)return{type:'fixed',slotCount:r.slotCount};throw Error('技能规则无效');}
export const deckSize=(rule:SkillRule)=>rule.type==='cycle'?8:rule.slotCount;
export const validLoadout=(deck:unknown,rule:SkillRule):deck is SkillId[]=>Array.isArray(deck)&&deck.length===deckSize(rule)&&deck.every(id=>id!=='move'&&Object.hasOwn(SKILLS,id));
export function adaptLoadout(deck:SkillId[]|undefined,rule:SkillRule):SkillId[]{const result=(deck||DEFAULT_DECK).filter(id=>id!=='move'&&Object.hasOwn(SKILLS,id)).slice(0,deckSize(rule));while(result.length<deckSize(rule))result.push(DEFAULT_DECK[result.length%8]);return result;}
