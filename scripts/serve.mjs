import {parseArgs} from 'node:util';
import {createServer,isIP} from 'node:net';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {networkInterfaces} from 'node:os';
try {
 const {values}=parseArgs({options:{port:{type:'string',default:process.env.PORT||'3000'},host:{type:'string',default:process.env.GAME_HOST||'127.0.0.1'}}});
 const port=Number(values.port),host=values.host;
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口必须是1～65535的整数');
 if(!isIP(host))throw Error('监听地址必须是IP，例如127.0.0.1或0.0.0.0');
 const root=resolve(import.meta.dirname,'..'),entry=resolve(root,'dist/server/index.js'),web=resolve(root,'dist/web');
 if(!existsSync(entry)||!existsSync(resolve(web,'index.html')))throw Error('缺少生产构建，请先运行 npm run build');
 await new Promise((yes,no)=>{const probe=createServer();probe.once('error',no);probe.listen(port,host,()=>probe.close(yes));});
 Object.assign(process.env,{PORT:String(port),GAME_HOST:host,GAME_WEB_DIR:web,NODE_ENV:'production',DEBUG_SCENARIOS:'0'});
 const {server,io}=await import(pathToFileURL(entry).href);
 await new Promise((yes,no)=>{if(server.listening)return yes();server.once('listening',yes);server.once('error',no);});
 console.log(`启动成功：http://localhost:${port}/?mode=realtime`);
 if(host==='0.0.0.0')for(const n of Object.values(networkInterfaces()).flat())if(n?.family==='IPv4'&&!n.internal)console.log(`局域网：http://${n.address}:${port}`);
 console.log(`监听 ${host}:${port}，按 Ctrl+C 停止。`);
 let closing=false;const stop=()=>{if(closing)return;closing=true;io.close(()=>{console.log('服务器已停止');process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch(e){console.error('启动失败：'+(e.code==='EADDRINUSE'?'端口已被占用，请选择其他端口。':e.message));process.exitCode=1;}
