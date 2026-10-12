import {spawn} from 'node:child_process';
import {io} from 'socket.io-client';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const port=5195;
const server=spawn(process.execPath,['--expose-gc','--import','tsx','scripts/realtime-soak-server.ts'],{env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
const metrics=[];let buffer='';server.stdout.on('data',data=>{buffer+=data;let line;while((line=buffer.indexOf('\n'))>=0){const raw=buffer.slice(0,line);buffer=buffer.slice(line+1);if(raw.startsWith('METRIC '))metrics.push(JSON.parse(raw.slice(7)));}});
server.stderr.on('data',data=>process.stderr.write(data));
const socket=io(`http://127.0.0.1:${port}/realtime`);let state,count=0;socket.on('state',s=>{state=s;count++;});
const ack=(event,input={})=>new Promise((resolve,reject)=>socket.timeout(7000).emit(event,input,(e,r)=>e||!r?.ok?reject(new Error(r?.reason||String(e))):resolve(r)));
try{
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);setTimeout(()=>reject(new Error('connect timeout')),7000).unref();});
 await ack('create',{mode:'spectate',seed:42});await ack('start');
 await new Promise(r=>setTimeout(r,60000));
 assert.ok(state.game.now>=59000);assert.ok(state.game.actionsStarted>30);assert.ok(count>=400);
 const result={wallSeconds:60,frames:count,simulatedMs:state.game.now,actions:state.game.actionsStarted,kills:state.game.kills,metrics,note:'Single room, 6 bots; a 60-second soak cannot establish absence of long-term leaks.'};
 writeFileSync('realtime-review/soak.json',JSON.stringify(result,null,2));console.log(result);
}finally{socket.disconnect();server.kill();}
