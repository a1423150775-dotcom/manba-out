import { monitorEventLoopDelay } from 'node:perf_hooks';
await import('../src/server/index');
const delay=monitorEventLoopDelay({resolution:20});delay.enable();let previous=process.cpuUsage();
setInterval(()=>{const cpu=process.cpuUsage(previous);previous=process.cpuUsage();global.gc?.();console.log('METRIC '+JSON.stringify({at:Date.now(),heap:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss,cpuMs:(cpu.user+cpu.system)/1000,loopMeanMs:delay.mean/1e6,loopMaxMs:delay.max/1e6}));delay.reset();},10000).unref();
