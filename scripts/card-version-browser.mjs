import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:'5193',NODE_ENV:'production'},stdio:'ignore'});let browser;
try{for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5193/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.route('**/version.json',r=>r.fulfill({json:{buildId:'outdated-client-test'}}));await page.goto('http://127.0.0.1:5193/?mode=realtime');await page.getByRole('button',{name:'刷新到最新版本',exact:true}).waitFor();assert.match(await page.locator('.rt-version-alert').innerText(),/版本已更新/);console.log('PASS frontend mismatch: visible refresh action, no silent failure');}finally{await browser?.close();server.kill();}
