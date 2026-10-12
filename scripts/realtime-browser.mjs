import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('realtime-review',{recursive:true});
const port=5196,url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});
const wait=async(f)=>{for(let i=0;i<200;i++){if(await f())return;await new Promise(r=>setTimeout(r,50));}throw new Error('timeout');};
let browser;
const errors=[],passed=[];
try{
 await wait(async()=>{try{return(await fetch(url+'/health')).ok;}catch{return false;}});
 browser=await chromium.launch({channel:'chrome',headless:true});
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
 if(process.env.RENDER_STYLE)for(const ctx of [mobile,desktop])await ctx.addInitScript(style=>localStorage.setItem('elbow-render-style',style),process.env.RENDER_STYLE);
 const page=await mobile.newPage(),other=await desktop.newPage();
 let state;
 page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message));
 page.on('websocket',ws=>ws.on('framereceived',frame=>{const payload=String(frame.payload);if(payload.startsWith('42/realtime,')){const [event,s]=JSON.parse(payload.slice(payload.indexOf('[')));if(event==='state')state=s;}}));
 await page.addInitScript(()=>{if(!localStorage.getItem('elbow-loadout'))localStorage.setItem('elbow-loadout',JSON.stringify({character:'laoda',deck:['move','elbow','move','heal','dash','move','blink','heavy']}));});
 await page.goto(url+'/?mode=realtime');
 await page.getByText('实时乱斗 · 已连接',{exact:true}).waitFor();
 await page.getByRole('button',{name:'单人测试',exact:true}).click();await page.getByRole('button',{name:'开始实时战斗'}).waitFor();
 assert.equal(await page.locator('.rt-seat').count(),4);
 assert.equal(await page.locator('[data-library-card="move"]').count(),0);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('elbow-loadout')).deck),['elbow','elbow','heal','heal','dash','area','blink','heavy']);
 await page.getByRole('button',{name:/铁头哥/}).click();
 const loadout=['elbow','dash','heal','heavy','blink','area','spring','elbow'];for(let i=0;i<8;i++){await page.locator('[data-deck-slot="'+i+'"]').click();await page.locator('[data-library-card="'+loadout[i]+'"]').click();}
 await page.getByRole('button',{name:'保存角色与卡组'}).click();
 const roomCode=await page.locator('.rt-lobby h2').textContent();const code=roomCode.match(/[A-F0-9]{6}/)[0];
 await other.goto(url+'/?mode=realtime');await other.getByText('实时乱斗 · 已连接',{exact:true}).waitFor();await other.getByLabel('实时房间码').fill(code);await other.getByRole('button',{name:'加入实时房间'}).click();await other.locator('.rt-lobby').waitFor();
 await page.screenshot({path:'realtime-review/lobby-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'开始实时战斗'}).click();await page.locator('.rt-board').waitFor();await other.locator('.rt-board').waitFor();await wait(()=>state?.game);
 assert.equal(state.game.players.find(p=>p.id===state.you).hp,140);
 assert.equal(await page.getByRole('button',{name:'结束回合',exact:true}).count(),0);
 await page.locator('.rt-info-drawer>summary').click();await page.locator('.rt-debug summary').click();await page.getByRole('button',{name:'暂停Bot行动'}).click();await page.locator('.rt-info-drawer>summary').click();
 assert.equal(await page.locator('[data-slot]').count(),4);assert.equal(await page.locator('[data-move-mode]').count(),1);
 assert.equal(state.game.players.find(p=>p.id===state.you).deck.includes('move'),false);
 await page.locator('.rt-board').scrollIntoViewIfNeeded();
 const originalHand=JSON.stringify(state.game.players.find(p=>p.id===state.you).hand);
 await page.locator('[data-slot="0"]').click();await page.locator('[data-cell="0,0"] polygon[data-surface="top"]').tap();
 assert.equal(await page.locator('[data-slot="0"]').getAttribute('aria-pressed'),'true');
 assert.equal(JSON.stringify(state.game.players.find(p=>p.id===state.you).hand),originalHand);
 await page.getByRole('button',{name:'普通移动模式'}).click();assert.equal(await page.locator('[data-move-mode]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-slot="0"]').click();await page.locator('.rt-status').click({button:'right'});assert.equal(await page.locator('[data-move-mode]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-slot="0"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.rt-skill-list button[aria-pressed=true]').count(),0);
 await page.locator('[data-slot="0"]').click();await page.locator('[data-slot="1"]').click();assert.equal(await page.locator('[data-slot="1"]').getAttribute('aria-pressed'),'true');await page.locator('[data-slot="1"]').click();assert.equal(await page.locator('.rt-skill-list button[aria-pressed=true]').count(),0);
 await page.getByRole('button',{name:'跟随视角',exact:true}).click();await page.getByRole('button',{name:'放大',exact:true}).click();await page.getByRole('button',{name:'普通移动模式'}).click();await page.evaluate(()=>{window.cameraSamples=[];let n=0;const tick=()=>{const m=document.querySelector('[data-layer="camera"]').getCTM();window.cameraSamples.push([m.e,m.f]);if(n++<100)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 await page.locator('[data-cell="4,-1"] polygon[data-surface="top"]').tap();
 await wait(()=>state.game.players.find(p=>p.id===state.you).position?.r===-1);
 await wait(()=>!state.game.players.find(p=>p.id===state.you).action);
 assert.ok(state.game.players.find(p=>p.id===state.you).energy<=5);
 assert.equal(JSON.stringify(state.game.players.find(p=>p.id===state.you).hand),originalHand);
 const samples=await page.evaluate(()=>window.cameraSamples);assert.ok(samples.length>10);assert.ok(Math.hypot(samples.at(-1)[0]-samples[0][0],samples.at(-1)[1]-samples[0][1])>2,'camera follows visual movement');assert.ok(samples.slice(1).every((p,i)=>Math.hypot(p[0]-samples[i][0],p[1]-samples[i][1])<100),'no camera tile jump');
 passed.push('ESC/toggle/switch selection, zoomed follow-camera target tap and sampled smooth tracking');
 await page.locator('.rt-skill-list button').filter({hasText:'治疗'}).click();assert.equal(await page.getByRole('button',{name:/确认释放/}).count(),0);
 await wait(()=>state.game.players.find(p=>p.id===state.you).action?.skill==='heal');await wait(()=>!state.game.players.find(p=>p.id===state.you).action);
 passed.push('mobile solo create, three Bots, tank character/deck saved, desktop joins, real move and heal lifecycle');
 await page.getByRole('button',{name:'全地图',exact:true}).click();
 const dirs=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]],dist=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
 const same=(a,b)=>a.q===b.q&&a.r===b.r;
 const hero=()=>state.game.players.find(p=>p.id===state.you);
 const enemyId=state.game.players.filter(p=>p.bot&&p.position).sort((a,b)=>dist(hero().position,a.position)-dist(hero().position,b.position))[0].id;
 for(let step=0;step<12;step++){
  const enemy=state.game.players.find(p=>p.id===enemyId);if(dist(hero().position,enemy.position)===1)break;
  const queue=[{at:hero().position,first:null}],seen=new Set();let first;
  while(queue.length){const node=queue.shift(),k=JSON.stringify(node.at);if(seen.has(k))continue;seen.add(k);if(dist(node.at,enemy.position)===1){first=node.first;break;}
   for(const[q,r]of dirs){const at={q:node.at.q+q,r:node.at.r+r};if(dist(at,{q:0,r:0})>4||state.game.players.some(p=>p.position&&same(p.position,at))||state.game.springs.some(s=>same(s.at,at)))continue;queue.push({at,first:node.first||at});}}
  assert.ok(first,'path to adjacent enemy');await wait(()=>hero().energy>=1&&!hero().action);
  await page.getByRole('button',{name:'普通移动模式'}).click();await page.locator(`[data-cell="${first.q},${first.r}"] polygon[data-surface="top"]`).tap();await wait(()=>hero().position&&same(hero().position,first));await wait(()=>!hero().action);
 }
 await wait(()=>hero().energy>=3&&!hero().action);
 const enemy=state.game.players.find(p=>p.id===enemyId),hp=enemy.hp,at=enemy.position;
 assert.equal(dist(hero().position,at),1);
 await page.locator('.rt-skill-list button').filter({hasText:'牢大肘击'}).click();await page.locator(`[data-player="${enemyId}"] circle`).tap();await wait(()=>state.game.players.find(p=>p.id===enemyId).hp<hp);
 assert.equal(await page.locator('[data-move-mode]').getAttribute('aria-pressed'),'true');
 passed.push('migration preserves other cards; 4 special hand slots + movement indicator; illegal target retains selection; movement/icon/ESC/right-click and successful skill reset');
 passed.push('mobile pathfinding taps to adjacent Bot, elbow windup and real server damage/push');
 for(const [width,height]of [[320,568],[390,844],[844,390],[768,1024]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`realtime-review/battle-${width}x${height}.png`,fullPage:true});
 }
 await other.screenshot({path:'realtime-review/battle-desktop.png',fullPage:true});await other.getByRole('button',{name:'跟随视角',exact:true}).click();await other.screenshot({path:'realtime-review/battle-desktop-follow.png',fullPage:true});
 assert.deepEqual(await other.locator('[data-layer=camera]>g').evaluateAll(nodes=>nodes.map(n=>n.dataset.layer)),['floor','ground','ground-effects','actors','effects','labels','targets']);
 await other.keyboard.press('3');await wait(()=>state.game.players.find(p=>p.id!==state.you&&!p.bot)?.action?.skill==='heal');
 await page.setViewportSize({width:390,height:844});await page.locator('.rt-info-drawer>summary').click();await page.getByRole('button',{name:'恢复Bot行动'}).click();await page.locator('.rt-info-drawer>summary').click();
 const old=state.game.actionsStarted;await wait(()=>state.game.actionsStarted>old+3);
 const identity=state.you;await page.reload();await page.locator('.rt-board').waitFor();await wait(()=>state.you===identity);passed.push('Bot activity and refresh identity recovery');
 await page.locator('.rt-info-drawer>summary').click();await page.locator('.rt-debug summary').click();await page.getByRole('button',{name:'重新开始测试'}).click();await page.getByRole('button',{name:'开始实时战斗'}).waitFor();
 await page.getByRole('button',{name:'开始实时战斗'}).click();await page.locator('.rt-board').waitFor();
 await page.locator('.rt-info-drawer>summary').click();await page.locator('.rt-debug summary').click();await page.getByRole('button',{name:'结束测试',exact:true}).click();await page.getByRole('heading',{name:'实时乱斗结束'}).waitFor();
 passed.push('restart and finish result; mobile/tablet/landscape no page overflow');
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('.rt-settings').getByRole('button',{name:'返回大厅',exact:true}).click();await page.getByRole('button',{name:'Bot观战模式'}).click();await page.getByRole('button',{name:'开始实时战斗'}).click();await page.locator('.rt-board').waitFor();await wait(()=>state?.spectate&&state.game?.players.length===6);assert.equal(await page.locator('.rt-skill-list').count(),0);passed.push('six-Bot observer match');
 assert.deepEqual(errors,[]);writeFileSync('realtime-review/browser.json',JSON.stringify({passed,errors},null,2));console.log({passed,errors});
}catch(e){for(const context of browser?.contexts()||[])for(const [i,p]of context.pages().entries()){console.log((await p.locator('body').innerText()).slice(0,2500));await p.screenshot({path:`realtime-review/failure-${i}.png`,fullPage:true});}throw e;}finally{await browser?.close();server.kill();}


