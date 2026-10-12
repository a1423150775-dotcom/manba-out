import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:5180/?mode=realtime&quick=solo');
 await page.getByRole('button',{name:'开始实时战斗'}).waitFor();
 if(await page.locator('.rt-seat').count()!==4)throw new Error('quick solo seat count');
 console.log('5180 latest production quick solo: 1 human + 3 Bots OK');
 console.log('health',await (await fetch('http://localhost:5180/health')).text());
}finally{await browser.close();}
