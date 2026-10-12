import { DIRS,add,distance,equal,key,type Hex } from '../core/hex';
import { CHARACTERS,SKILLS,type SkillId } from './config';
import { free,random,useHandCard,requestMovement,type Arena,type Fighter,type Intent } from './engine';
const delays={easy:1200,normal:450,hard:200};
// Dijkstra on 61 cells, penalizing traps and backtracking. It uses only public positions/actions.
function pathTo(g:Arena,p:Fighter,target:Hex,retreat:boolean):Hex|null{
  const queue:{at:Hex;cost:number;first:Hex|null}[]=[{at:p.position!,cost:0,first:null}],seen=new Map<string,number>();
  let best:Hex|null=null,bestScore=-Infinity;
  while(queue.length){queue.sort((a,b)=>a.cost-b.cost);const node=queue.shift()!;if(seen.has(key(node.at)))continue;seen.set(key(node.at),node.cost);
    if(node.first){const score=retreat?distance(node.at,target)*4-node.cost: -distance(node.at,target)*8-node.cost;
      if(score>bestScore){bestScore=score;best=node.first;}if(!retreat&&distance(node.at,target)<=1)return node.first;}
    for(const d of DIRS){const at=add(node.at,d);if(!free(g,at)||seen.has(key(at)))continue;const cost=node.cost+1+(g.springs.some(t=>equal(t.at,at))?5:0)+(p.previous&&equal(p.previous,at)?2:0);queue.push({at,cost,first:node.first||at});}
  }return best;
}
export function decideBots(g:Arena){
  if(g.phase!=='playing'||g.pausedBots)return;
  for(const p of g.players){
    if(!p.bot||!p.position||p.action||p.stunnedUntil>g.now||g.now<p.nextThink||p.botMode==='idle')continue;
    p.nextThink=g.now+delays[p.bot]+(p.bot==='easy'?Math.floor(random(g)*500):0);
    const allowed=(s:SkillId)=>(s==='move'||p.hand.some(c=>c.skill===s))&&p.energy>=SKILLS[s].energyCost;
    const enemies=g.players.filter(t=>t.id!==p.id&&t.position).sort((a,b)=>distance(p.position!,a.position!)-distance(p.position!,b.position!)||a.hp-b.hp);
    const target=enemies[0]; if(!target)continue;
    let intent:Intent|undefined;const hurt=p.hp<CHARACTERS[p.character].hp*.4;
    if(p.botMode==='normal'&&hurt&&allowed('heal'))intent={skill:'heal'};
    const predicted=p.bot==='hard'&&target.action?.path.length?target.action.path[target.action.step]||target.position!:target.position!;
    const near=distance(p.position,predicted)<=1||distance(p.position,target.position!)<=1;
    if(!intent&&p.botMode!=='move'&&near&&(p.bot!=='easy'||random(g)>.45)){
      if(enemies.filter(t=>distance(p.position!,t.position!)===1).length>=2&&allowed('area'))intent={skill:'area'};
      else if(p.bot==='hard'&&target.stunnedUntil>g.now+800&&allowed('heavy'))intent={skill:'heavy',targetId:target.id};
      else if(allowed('elbow'))intent={skill:'elbow',targetId:target.id};
      else if(allowed('heavy'))intent={skill:'heavy',targetId:target.id};
    }
    if(!intent&&p.botMode!=='attack'&&p.energy>=1){
      // In melee, saving enough energy to attack is better than pacing back and forth.
      if(near&&!hurt&&p.botMode!=='move'&&(p.hand.some(c=>c.skill==='elbow'||c.skill==='heavy')))continue;
      let at=pathTo(g,p,predicted,hurt&&p.bot!=='easy');
      if(p.bot==='easy'&&random(g)<.2){const options=DIRS.map(d=>add(p.position!,d)).filter(h=>free(g,h)&&!(p.previous&&equal(h,p.previous)));at=options[Math.floor(random(g)*options.length)]||at;}
      if(at){const direction=DIRS.findIndex(d=>equal(add(p.position!,d),at!)),second=add(at,DIRS[direction]);
        if(p.bot==='hard'&&!hurt&&allowed('dash')&&distance(p.position,target.position!)>3&&free(g,second)&&!g.springs.some(t=>equal(t.at,at!)||equal(t.at,second))&&distance(second,predicted)<distance(at,predicted))intent={skill:'dash',direction};else if(allowed('move'))intent={skill:'move',at};else if(allowed('dash')&&free(g,second))intent={skill:'dash',direction};else if(allowed('blink'))intent={skill:'blink',at};}
    }
    if(!intent&&p.botMode==='normal'){if(allowed('heal'))intent={skill:'heal'};else if(allowed('area'))intent={skill:'area'};else if(allowed('spring')){const at=DIRS.map(d=>add(p.position!,d)).find(h=>free(g,h)&&!g.springs.some(t=>equal(t.at,h)));if(at)intent={skill:'spring',at,direction:0};}}
    if(intent?.skill==='move'){requestMovement(g,p.id,intent.at!);}else if(intent){const slot=p.hand.findIndex(c=>c.skill===intent!.skill);if(slot>=0)useHandCard(g,p.id,{...intent,slot,instanceId:p.hand[slot].id});}
  }
}

