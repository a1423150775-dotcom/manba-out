import {SKILLS,characterSkill,RT_CONFIG as C,type Skill,type SkillId} from './config';
export function cardDetails(id:SkillId):[string,string][]{const s:Skill=characterSkill('laoda',id),facts:[string,string][]=[['类型',s.targetType==='player'?'锁定目标':s.targetType==='direction'?'方向技能':'位置技能'],['能量',String(s.energyCost)],['前摇',s.windup/1000+'秒'],['射程',id==='arrow'?'由初速、高度与发射角共同决定':s.range+'格']];
 if(s.damage!==undefined)facts.push([s.ringDamage!==undefined?'中心伤害':'伤害',s.damage+' HP']);if(s.ringDamage!==undefined)facts.push(['相邻格伤害',s.ringDamage+' HP'],['作用范围','中心＋六邻格']);if(s.push)facts.push(['击退',s.push+'格']);if(s.stun)facts.push(['击晕',s.stun/1000+'秒']);
 if(id==='charge')facts.push(['冲锋距离',C.chargeSteps+'格'],['冲锋时间',C.chargeMs/1000+'秒'],['障碍伤害',s.obstacleDamage+' HP']);if(id==='fireball')facts.push(['飞行时间',C.fireFlightMs/1000+'秒']);if(id==='hook')facts.push(['拉拽时间',C.hookMs/1000+'秒']);
 if(s.objectHp){const decay=id==='cover'?C.coverDecay:C.mineDecay;facts.push(['单元HP',String(s.objectHp)],['自然损耗',decay+' HP/秒'],['无外伤寿命',s.objectHp/decay+'秒']);if(s.units)facts.push(['独立单元',String(s.units)]);}
 if(id==='arrow')facts.push(['平地同高度最大距离',(C.arrowSpeed**2/C.gravity).toFixed(2)+'格心单位'],['弹道','低抛／高抛；飞行时间取决于角度'],['发射高度',C.launchHeight+'（相对地面）'],['初速度',C.arrowSpeed.toFixed(3)],['重力',String(C.gravity)]);
 if(id==='move')facts.push(['碰撞伤害',C.moveDamage+' HP'],['执行时间',s.recovery/1000+'秒'],['移动后摇',C.moveRecoveryMs/1000+'秒，可用连续移动取消']);return facts;
}
