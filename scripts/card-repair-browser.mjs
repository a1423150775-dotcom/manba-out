import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const url='http://127.0.0.1:5194',server=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:'5194',NODE_ENV:'production'},stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async f=>{for(let i=0;i<800;i++){if(await f())return;await pause(50);}throw new Error('condition timeout');};
let browser;const checks=[];mkdirSync('card-repair-review',{recursive:true});
try{
 await wait(async()=>{try{return(await fetch(url+'/health')).ok;}catch{return false;}});
 browser=await chromium.launch({channel:'chrome',headless:true});const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const desktop=await browser.newContext({viewport:{width:1400,height:1000}});const a=await mobile.newPage(),b=await desktop.newPage();let sa,sb;const errors=[];
 for(const[p,set]of [[a,s=>sa=s],[b,s=>sb=s]]){p.on('pageerror',e=>errors.push(e.message));p.on('websocket',ws=>ws.on('framereceived',f=>{const v=String(f.payload);if(v.startsWith('42/realtime,')){const[e,s]=JSON.parse(v.slice(v.indexOf('[')));if(e==='state')set(s);}}));await p.goto(url+'/?mode=realtime');await p.getByText('实时乱斗 · 已连接',{exact:true}).waitFor();}
 await a.getByRole('button',{name:'创建实时房间',exact:true}).click();await a.locator('.rt-lobby').waitFor();const code=sa.code;
 const deck=['blink','elbow','heal','heal','heal','heal','dash','elbow'];
 for(let i=0;i<8;i++){await a.locator(`[data-deck-slot="${i}"]`).tap();await a.locator(`[data-library-card="${deck[i]}"]`).tap();}
 await a.getByRole('button',{name:'保存角色与卡组',exact:true}).click();await wait(()=>JSON.stringify(sa.seats.find(p=>p.id===sa.you).deck)===JSON.stringify(deck));
 await a.screenshot({path:'card-repair-review/deck-mobile.png',fullPage:true});await a.reload();await a.locator('.rt-lobby').waitFor();assert.equal(await a.locator('.rt-deck-grid button').count(),8);assert.equal(await a.locator('.rt-deck-grid button').filter({hasText:'治疗'}).count(),4);checks.push('8-card replacement editor; four independent heal copies; save and refresh persistence');
 await b.getByLabel('实时房间码').fill(code);await b.getByRole('button',{name:'加入实时房间',exact:true}).click();await b.locator('.rt-lobby').waitFor();await b.locator('[data-deck-slot="0"]').click();await b.locator('[data-library-card="blink"]').click();await b.locator('[data-deck-slot="1"]').click();await b.locator('[data-library-card="elbow"]').click();await b.getByRole('button',{name:'保存角色与卡组',exact:true}).click();await wait(()=>sb.seats.find(p=>p.id===sb.you).deck[0]==='blink');
 await a.getByRole('button',{name:'开始实时战斗',exact:true}).click();await a.locator('.rt-board').waitFor();await b.locator('.rt-board').waitFor();
 const hero=(s)=>s.game.players.find(p=>p.id===s.you);const ha=()=>hero(sa),hb=()=>hero(sb);
 assert.equal(await a.locator('.rt-skill-list button').count(),4);assert.equal(await a.locator('.rt-next button').count(),0);assert.equal(await a.locator('[data-slot]').count(),4);assert.equal(await a.getByRole('button',{name:/确认/}).count(),0);checks.push('combat exactly four actionable slots; separate default movement indicator; preview not clickable');
 const clickSlot=async(p,n)=>p.locator(`[data-slot="${n}"]`).click();
 const ds=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]],hd=(x,y={q:0,r:0})=>Math.max(Math.abs(x.q-y.q),Math.abs(x.r-y.r),Math.abs(x.q+x.r-y.q-y.r)),eq=(x,y)=>x.q===y.q&&x.r===y.r;
 const safe=h=>hd(h)<=4&&!sa.game.springs.some(t=>eq(t.at,h))&&!sa.game.boxes.some(t=>eq(t,h))&&!sa.game.players.some(p=>p.position&&eq(p.position,h));
 let posA,posB,pushed;
 outer:for(let q=-4;q<=4;q++)for(let r=-4;r<=4;r++){const x={q,r};if(!safe(x)||hd(x,ha().position)>3)continue;for(const[dq,dr]of ds){const y={q:q+dq,r:r+dr},end={q:q-2*dq,r:r-2*dr},middle={q:q-dq,r:r-dr};if(safe(y)&&hd(y,hb().position)<=3&&safe(middle)&&safe(end)){posA=x;posB=y;pushed=end;break outer;}}}
 assert.ok(posA&&posB);await clickSlot(a,0);await a.locator('[data-cell="'+posA.q+','+posA.r+'"] polygon').tap();await wait(()=>ha().position&&eq(ha().position,posA)&&!ha().action);
 const noEnergyHand=ha().hand.map(c=>c.id);const denied=a.locator('[data-slot="1"]');await denied.scrollIntoViewIfNeeded();const hit=await denied.boundingBox();await a.touchscreen.tap(hit.x+hit.width/2,hit.y+hit.height/2);await a.getByRole('alert').filter({hasText:'能量不足'}).waitFor();assert.deepEqual(ha().hand.map(c=>c.id),noEnergyHand);await a.getByRole('alert').getByRole('button',{name:'关闭',exact:true}).click();checks.push('energy rejection displayed without consuming or cycling');
 await clickSlot(b,0);await b.locator('[data-cell="'+posB.q+','+posB.r+'"] polygon').click();await wait(()=>hb().position&&eq(hb().position,posB)&&!hb().action);
 await wait(()=>hb().energy>=3);const beforeHP=ha().hp;await clickSlot(b,1);await b.locator(`[data-player="${sa.you}"] circle`).click();await wait(()=>hb().action?.skill==='elbow');await wait(()=>ha().hp<beforeHP);assert.equal(ha().hp,80);assert.deepEqual(ha().position,pushed);checks.push('desktop elbow actually winds up, deals 20 laoda damage, pushes outward two cells');
 await wait(()=>ha().energy>=3&&!ha().action&&ha().stunnedUntil<=sa.game.now);const beforeHand=ha().hand.map(c=>c.id),next=ha().queue[0].id;await clickSlot(a,2);await wait(()=>ha().action?.skill==='heal');assert.equal(ha().hand[2].id,next);assert.equal(ha().queue.at(-1).id,beforeHand[2]);await wait(()=>ha().hp===100&&!ha().action);checks.push('touch self-heal immediately starts, HP 80 to 100; next card replaces used slot');
 const dirs=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]],dist=h=>Math.max(Math.abs(h.q),Math.abs(h.r),Math.abs(h.q+h.r)),same=(x,y)=>x.q===y.q&&x.r===y.r;
 const free=h=>dist(h)<=4&&!sa.game.players.some(p=>p.position&&same(p.position,h))&&!sa.game.springs.some(t=>same(t.at,h));
 const costs={move:1,elbow:3,heal:3,dash:2,blink:4,heavy:4,area:5,spring:3};
 let expectedHand=ha().hand.map(c=>c.id),expectedQueue=ha().queue.map(c=>c.id);
 for(let i=0;i<8;i++){
  const slot=i%4;await wait(()=>ha().position&&!ha().action&&ha().stunnedUntil<=sa.game.now&&ha().energy>=costs[ha().hand[slot].skill]);
  const card=ha().hand[slot];const at=ha().position;await clickSlot(a,slot);
  if(['move','blink','spring'].includes(card.skill)){const to=dirs.map(([q,r])=>({q:at.q+q,r:at.r+r})).find(free);assert.ok(to);await a.locator(`[data-cell="${to.q},${to.r}"] polygon`).tap();}
  else if(card.skill==='dash'){const d=dirs.find(([q,r])=>free({q:at.q+q,r:at.r+r})&&free({q:at.q+2*q,r:at.r+2*r}));assert.ok(d);await a.locator(`[data-cell="${at.q+d[0]},${at.r+d[1]}"] polygon`).tap();}
  else if(['elbow','heavy'].includes(card.skill))await a.locator(`[data-player="${sb.you}"] circle`).tap();
  await wait(()=>ha().hand[slot].id!==card.id);expectedQueue.push(expectedHand[slot]);expectedHand[slot]=expectedQueue.shift();assert.deepEqual(ha().hand.map(c=>c.id),expectedHand);assert.deepEqual(ha().queue.map(c=>c.id),expectedQueue);assert.equal(await a.locator('.rt-skill-list button').count(),4);
  await wait(()=>!ha().action);
  if(card.skill==='move')assert.notDeepEqual(ha().position,at);
 }
 console.log('Eight browser casts completed');checks.push('8 consecutive actual UI casts: exact hand/queue instance order checked after each cast; repeated special copies stay distinct');
 await a.getByRole('button',{name:'全地图',exact:true}).click();await a.screenshot({path:'card-repair-review/battle-four-mobile.png',fullPage:true});await b.screenshot({path:'card-repair-review/battle-four-desktop.png',fullPage:true});
 const hand=ha().hand.map(c=>c.id),queue=ha().queue.map(c=>c.id),id=sa.you;await a.reload();await a.locator('.rt-skill-list').waitFor();await wait(()=>sa.you===id);assert.deepEqual(ha().hand.map(c=>c.id),hand);assert.deepEqual(ha().queue.map(c=>c.id),queue);checks.push('refresh resumes exact hand and queue');assert.deepEqual(errors,[]);
 writeFileSync('card-repair-review/browser.json',JSON.stringify({checks,errors},null,2));console.log({checks,errors});
}catch(e){if(browser)for(const c of browser.contexts())for(const p of c.pages())console.log((await p.locator('body').innerText()).slice(-1600));throw e;}finally{await browser?.close();server.kill();}

