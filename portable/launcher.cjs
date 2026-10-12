const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');

const root = __dirname;
const controlFile = path.join(root, 'data', 'control.json');
const logFile = path.join(root, 'logs', 'server.log');
const fail = message => { console.error(`启动失败：${message}`); process.exitCode = 1; };
const log = message => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try { fs.appendFileSync(logFile, `${line}\n`, 'utf8'); } catch { /* 控制台仍显示状态 */ }
};

function configuration() {
  const file = path.join(root, 'config.json');
  if (!fs.existsSync(file)) throw new Error('缺少 config.json；请从完整 ZIP 重新解压，或恢复配置文件。');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { throw new Error(`config.json 不是有效 JSON：${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('config.json 顶层必须是对象。');
  const { port, maxRooms, bindAddress } = value;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port 必须是 1～65535 的整数。');
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 1000) throw new Error('maxRooms 必须是 1～1000 的整数。');
  if (typeof bindAddress !== 'string' || !net.isIP(bindAddress)) throw new Error('bindAddress 必须是有效的 IP 地址。');
  return { port, maxRooms, bindAddress };
}

function checkPort(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, host, () => probe.close(resolve));
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flatMap(entries => entries || [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => entry.address).filter((address, index, all) => all.indexOf(address) === index);
}

async function main() {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  const config = configuration();
  const webIndex = path.join(root, 'web', 'index.html');
  const serverScript = path.join(root, 'server.cjs');
  if (!fs.existsSync(webIndex) || !fs.existsSync(serverScript)) throw new Error('缺少 web/index.html 或 server.cjs；请重新解压完整 ZIP。');
  try { await checkPort(config.port, config.bindAddress); }
  catch (error) { throw new Error(`端口 ${config.port} 无法监听（${error.code || error.message}）。请关闭占用它的程序，或修改 config.json 的 port。`); }

  process.env.NODE_ENV = 'production';
  process.env.DEBUG_SCENARIOS = '0';
  process.env.PORT = String(config.port);
  process.env.GAME_HOST = config.bindAddress;
  process.env.GAME_MAX_ROOMS = String(config.maxRooms);
  process.env.GAME_WEB_DIR = path.join(root, 'web');
  process.env.GAME_LOG_DIR = path.join(root, 'logs');
  const { server, io } = require(serverScript);
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const secret = crypto.randomBytes(32).toString('hex');
  let closing = false;
  const control = net.createServer(socket => {
    socket.setTimeout(3000);
    socket.once('data', bytes => {
      const supplied = bytes.toString('utf8').trim();
      const accepted = supplied.length === secret.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
      socket.end(accepted ? 'OK\n' : 'DENIED\n');
      if (accepted) setImmediate(shutdown);
    });
  });
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    log('收到本机停止命令，正在关闭游戏服务器。');
    await new Promise(resolve => io.close(resolve));
    await new Promise(resolve => control.close(resolve));
    try { fs.unlinkSync(controlFile); } catch { /* 已不存在 */ }
    log('服务器已安全停止。');
    process.exit(0);
  };
  control.listen(0, '127.0.0.1', () => {
    fs.writeFileSync(controlFile, JSON.stringify({ pid: process.pid, port: control.address().port, secret }), { mode: 0o600 });
    log(`服务器启动成功，房间上限 ${config.maxRooms}。`);
    log(`本机访问：http://localhost:${config.port}`);
    if (config.bindAddress === '0.0.0.0') {
      const addresses = lanAddresses();
      for (const address of addresses) log(`局域网访问：http://${address}:${config.port}`);
      if (!addresses.length) log('未发现可用的非回环 IPv4 地址；请检查网络连接。');
    } else log(`监听地址：http://${config.bindAddress}:${config.port}`);
    log('按 Ctrl+C 或运行 stop.bat 可关闭服务器。');
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(error => fail(error.message || String(error)));
