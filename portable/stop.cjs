const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const file = path.join(__dirname, 'data', 'control.json');
if (!fs.existsSync(file)) {
  console.error('没有找到本便携包的运行记录；服务器可能尚未启动。');
  process.exitCode = 1;
} else {
  try {
    const { port, secret } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Number.isInteger(port) || typeof secret !== 'string') throw new Error('停止凭据无效');
    const socket = net.connect({ host: '127.0.0.1', port });
    let response = '';
    socket.setTimeout(4000);
    socket.on('connect', () => socket.end(`${secret}\n`));
    socket.on('data', bytes => { response += bytes.toString('utf8'); });
    socket.on('end', () => {
      if (response.trim() === 'OK') console.log('已向本便携包的服务器发送安全停止请求。');
      else { console.error('停止请求未获服务器接受。'); process.exitCode = 1; }
    });
    socket.on('error', error => { console.error(`无法连接本便携包的服务器：${error.message}`); process.exitCode = 1; });
    socket.on('timeout', () => { console.error('停止请求超时。'); socket.destroy(); process.exitCode = 1; });
  } catch (error) { console.error(`无法读取停止记录：${error.message}`); process.exitCode = 1; }
}
