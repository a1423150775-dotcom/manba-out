import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url='http://127.0.0.1:5195',server=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:'5195',NODE_ENV:'production'},stdio:'ignore'});
const wait=async f=>{for(let i=0;i<300;i++){if(await f())return;await new Promise(r=>setTimeout(r,30));}throw Error('timeout');};
mkdirSync('render-review',{recursive:true});let browser;const checks=[],errors=[];
try{
 await wait(async()=>{try{return(await fetch(url+'/health')).ok;}catch{return false;}});browser=await chromium.launch({channel:'chrome',headless:true});
 for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile}),page=await ctx.newPage();let state;const sent=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>{ws.on('framesent',f=>sent.push(String(f.payload)));ws.on('framereceived',f=>{const v=String(f.payload);if(v.startsWith('42/realtime,')){const[e,s]=JSON.parse(v.slice(v.indexOf('[')));if(e==='state')state=s;}});});
 const map=JSON.parse(readFileSync('maps/classic.json','utf8'));if(!mobile)map.floors.forEach(h=>h.height=h.q===0&&h.r===0?3:h.q===1&&h.r===0?2:h.q===4&&h.r===-1?1:0);
 await page.addInitScript(m=>localStorage.setItem('elbow-map-test',JSON.stringify(m)),map);
 await page.goto(url+'/?mode=realtime&quick=solo&editorTest=1');await page.getByRole('button',{name:'开始实时战斗'}).click();await page.locator('.rt-board').waitFor();
 await page.locator('.rt-info-drawer>summary').click();await page.locator('.rt-debug summary').click();await page.getByRole('button',{name:'暂停Bot行动'}).click();await page.locator('.rt-info-drawer>summary').click();
 const hero=()=>state.game.players.find(p=>p.id===state.you),tap=async loc=>mobile?loc.tap():loc.click();
 for(const renderer of ['2D','2.5D'])for(const camera of ['全地图','跟随视角']){
 const n=sent.length;await tap(page.getByRole('button',{name:renderer,exact:true}));await tap(page.getByRole('button',{name:camera,exact:true}));await page.waitForTimeout(200);
 assert.equal(sent.slice(n).filter(s=>s.startsWith('42/realtime,')).length,0,'camera/render must not emit gameplay');
 assert.equal(await page.locator('.rt-board').getAttribute('data-renderer'),renderer.toLowerCase());assert.equal(await page.locator('.rt-board').getAttribute('data-camera'),camera==='全地图'?'map':'follow');
 assert.equal(await page.locator('[data-slot]').count(),4);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const actor=await page.locator(`[data-player="${state.you}"] circle`).boundingBox(),hud=await page.locator('.rt-skills').boundingBox();assert.ok(actor.y+actor.height<hud.y);
 await page.screenshot({path:`render-review/${mobile?'mobile':'desktop'}-${renderer}-${camera==='全地图'?'map':'follow'}.png`});
 }
 await tap(page.getByRole('button',{name:'全地图',exact:true}));await tap(page.locator('[data-cell="4,-1"] [data-surface="top"]'));await wait(()=>hero().position.r===-1&&!hero().action);assert.equal(hero().energy,4);
 const before=hero().hand[2].id;await tap(page.locator('[data-slot="2"]'));await wait(()=>hero().hand[2].id!==before);await wait(()=>!hero().action);
 if(mobile){await tap(page.getByRole('button',{name:'跟随视角',exact:true}));const client=await ctx.newCDPSession(page),n=state.game.actionsStarted;const send=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});await send('touchStart',[[130,270],[230,370]]);await send('touchMove',[[95,235],[265,405]]);await send('touchEnd',[]);await page.waitForTimeout(100);assert.equal(state.game.actionsStarted,n);await tap(page.getByRole('button',{name:'重置视角',exact:true}));}
 else{await tap(page.getByRole('button',{name:'放大',exact:true}));await page.mouse.move(700,300);await page.mouse.down();await page.mouse.move(750,340,{steps:8});await page.mouse.up();}
 await tap(page.locator('[data-cell="4,-2"] [data-surface="top"]'));await wait(()=>hero().position.r===-2&&!hero().action);
 const seat=state.you;await page.reload();await page.locator('.rt-board').waitFor();assert.equal(await page.locator('.rt-board').getAttribute('data-renderer'),'2.5d');await wait(()=>state.you===seat&&state.game);
 checks.push(`${mobile?'touch':'desktop'}: four combinations; switch emits no operation; height map accepted; accurate move, heal and cycle; zoom/pan target; reconnect style/identity`);
 await ctx.close();
 }
 assert.deepEqual(errors,[]);writeFileSync('render-review/results.json',JSON.stringify({checks,errors},null,2));console.log({checks,errors});
}finally{await browser?.close();server.kill();}
