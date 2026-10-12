import {defaultSlots,validateSpawn,type BattleSlot} from './realtime-slots';
import {setNavigation} from '../realtime/navigation';
import {chooseMap,validateMap,type ArenaMap} from '../realtime/maps';
import { randomBytes, randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { CARD_PROTOCOL,CHARACTERS,DEFAULT_DECK,RT_CONFIG,validDeck,migrateDeck,type CharacterId } from '../realtime/config';
import { addFighter,buyResource,createArena,log,useHandCard,submitHand,cancelBuffered,requestMovement,stepArena,type Arena,type BotMode,type Difficulty,type Setup } from '../realtime/engine';
import { decideBots } from '../realtime/bots';

type Seat=Setup & {token:string;socketId:string|null;observer:boolean};
type Room={slots:BattleSlot[];map:ArenaMap;code:string;hostId:string;test:boolean;spectate:boolean;seed:number;seats:Seat[];game:Arena|null;cache:Map<string,unknown>;lastWall:number;accumulator:number;idleSince:number|null;feedback:Map<string,number>};
const colors=['#ec685b','#39aab7','#e5a529','#9b7ddd','#46a46e','#df679d'];
const id=()=>randomBytes(12).toString('hex');
const name=(n:unknown)=>typeof n==='string'?n.replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,16):'';
export function installRealtime(io:Server){
  const ns=io.of('/realtime'),rooms=new Map<string,Room>();
  const own=(socket:Socket)=>{const room=rooms.get(socket.data.rtCode),seat=room?.seats.find(s=>s.id===socket.data.rtId&&s.socketId===socket.id);return room&&seat?{room,seat}:null;};
  const flushFeedback=(room:Room)=>{for(const p of room.game?.players||[]){const result=p.inputResult;if(result&&room.feedback.get(p.id)!==result.seq){room.feedback.set(p.id,result.seq);room.cache.set(p.id+':'+result.requestId,result);const seat=room.seats.find(s=>s.id===p.id);if(seat?.socketId)ns.to(seat.socketId).emit('skillResult',result);}}};
  const broadcast=(room:Room)=>{flushFeedback(room);for(const s of room.seats)if(s.socketId){const game=room.game?{...room.game,seed:undefined,rng:undefined}:null;ns.to(s.socketId).emit('state',{cardProtocol:CARD_PROTOCOL,slots:room.slots,map:room.map,code:room.code,you:s.id,hostId:room.hostId,test:room.test,spectate:room.spectate,seed:room.test?room.seed:undefined,seats:room.seats.map(({token,socketId,...p})=>({...p,online:!!socketId})),game});}};
  const bind=(socket:Socket,room:Room,seat:Seat)=>{const old=own(socket);if(old&&old.seat!==seat){old.seat.socketId=null;broadcast(old.room);}if(seat.socketId&&seat.socketId!==socket.id)ns.sockets.get(seat.socketId)?.disconnect(true);seat.socketId=socket.id;socket.data.rtCode=room.code;socket.data.rtId=seat.id;room.idleSince=null;broadcast(room);};
  const addBot=(room:Room,character:CharacterId='laoda',difficulty:Difficulty='normal')=>{
    if(room.seats.filter(s=>!s.observer).length>=6)throw new Error('真人和Bot合计最多6名');
    let n=1;while(room.seats.some(s=>s.name===`电脑牢大${n}`))n++;
    let slot=room.slots.find(s=>!s.occupantId);if(!slot){if(room.slots.length>=6||room.slots.length>=room.map.spawns.length)throw Error('没有空闲席位');slot={number:room.slots.length+1,kind:'human',occupantId:null,spawn:{...room.map.spawns[room.slots.length].at}};room.slots.push(slot);}
    const seat:Seat={id:id(),token:'',socketId:null,name:`电脑牢大${n}`,color:colors[room.seats.filter(s=>!s.observer).length%6],character,deck:DEFAULT_DECK.map((card,i)=>i===7&&n%2===0?'basic':card),bot:difficulty,observer:false};
    if(room.seats.filter(s=>!s.observer).length>=room.map.spawns.length)throw new Error('地图出生点不足');
    if(room.game?.phase==='playing')addFighter(room.game,seat);room.seats.push(seat);slot.kind='bot';slot.occupantId=seat.id;
  };
  ns.on('connection',socket=>{
    socket.emit('cardProtocol',CARD_PROTOCOL);
    let windowStart=performance.now(),requests=0;
    socket.use((packet,next)=>{const callback=packet.at(-1);if(typeof callback!=='function')return;if(performance.now()-windowStart>10000){windowStart=performance.now();requests=0;}if(++requests>100){callback({ok:false,reason:'请求太频繁'});return;}next();});
    const command=(event:string,handler:(input:any)=>unknown)=>socket.on(event,(input:unknown,reply:(r:unknown)=>void)=>{if(typeof reply!=='function')return;try{reply(handler(input)||{ok:true});}catch(e){reply({ok:false,reason:e instanceof Error?e.message:'请求错误'});}});
    const authorized=(host=false)=>{const o=own(socket);if(!o)throw new Error('身份未恢复，请重连');if(host&&o.room.hostId!==o.seat.id)throw new Error('只有房主可以操作');return o;};
    command('create',input=>{
      if(rooms.size>=Number(process.env.GAME_MAX_ROOMS||100))throw new Error('房间已达上限');
      if(own(socket))throw new Error('请先离开当前房间');
      let code='';do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
      const seat:Seat={id:id(),token:randomBytes(32).toString('hex'),socketId:null,name:name(input?.name)||'神秘牢大1',color:colors[0],character:Object.hasOwn(CHARACTERS,input?.character)?input.character:'laoda',deck:migrateDeck(input?.deck)||[...DEFAULT_DECK],observer:input?.mode==='spectate'};
      const room:Room={slots:[],map:input?.map?validateMap(input.map):input?.mapId?chooseMap(input.mapId):chooseMap('classic'),code,hostId:seat.id,test:input?.mode==='solo'||seat.observer,spectate:seat.observer,seed:Number.isInteger(input?.seed)?input.seed>>>0:randomInt(0x100000000),seats:[seat],game:null,cache:new Map(),lastWall:performance.now(),accumulator:0,idleSince:null,feedback:new Map()};
      room.slots=defaultSlots(room.map);if(!seat.observer)room.slots[0].occupantId=seat.id;rooms.set(code,room);if(room.test)for(let i=0;i<Math.min(seat.observer?6:3,room.map.spawns.length-(seat.observer?0:1));i++)addBot(room,(['laoda','tank','mouse'] as CharacterId[])[i%3]);bind(socket,room,seat);return{ok:true,code,token:seat.token};
    });
    command('join',input=>{
      if(own(socket))throw new Error('请先离开当前房间');
      const room=rooms.get(String(input?.code||'').toUpperCase());if(!room||room.seats.filter(s=>!s.bot).length>=16)throw new Error('房间不存在或等待区已满');
      const nickname=name(input?.name)||`神秘牢大${room.seats.length+1}`;if(room.seats.some(s=>s.name===nickname))throw new Error('昵称重复');
      const seat:Seat={id:id(),token:randomBytes(32).toString('hex'),socketId:null,name:nickname,color:colors[room.seats.length%6],character:'laoda',deck:migrateDeck(input?.deck)||[...DEFAULT_DECK],observer:true};room.seats.push(seat);bind(socket,room,seat);return{ok:true,code:room.code,token:seat.token};
    });
    command('resume',input=>{const room=rooms.get(String(input?.code||'')),seat=room?.seats.find(s=>!s.bot&&s.token&&s.token===input?.token);if(!room||!seat)throw new Error('身份已失效；服务器重启不保留内存比赛');bind(socket,room,seat);return{ok:true};});
    command('configure',input=>{input={...input,deck:migrateDeck(input?.deck)};const {room,seat}=authorized();if(room.game)throw new Error('开局后不能改角色卡组');if(!Object.hasOwn(CHARACTERS,input?.character)||!validDeck(input?.deck))throw new Error('需要合法角色和恰好8张合法卡牌（允许重复）');seat.character=input.character;seat.deck=[...input.deck];broadcast(room);});
    command('map',input=>{const {room}=authorized(true);if(room.game)throw new Error('比赛开始后不能更换地图');const map=input?.map?validateMap(input.map,room.slots.length):validateMap(chooseMap(input?.mapId),room.slots.length);room.map=map;room.slots.forEach((s,i)=>s.spawn={...map.spawns[i].at});broadcast(room);});
    command('slots',input=>{
      const {room,seat}=authorized();if(room.game)throw Error('开局后不能更改席位或出生点');
      const isHost=room.hostId===seat.id;
      if(input?.op==='leave'){for(const s of room.slots)if(s.occupantId===seat.id)s.occupantId=null;seat.observer=true;}
      else if(input?.op==='join'){const slot=room.slots.find(s=>s.number===input.number);if(!slot||slot.kind!=='human'||slot.occupantId)throw Error('席位不存在、已占用或属于Bot');for(const s of room.slots)if(s.occupantId===seat.id)s.occupantId=null;slot.occupantId=seat.id;seat.observer=false;seat.color=colors[slot.number-1];}
      else {if(!isHost)throw Error('只有房主可以配置席位');
        if(input?.op==='count'){const n=input.count;if(!Number.isInteger(n)||n<2||n>6||n>room.map.spawns.length)throw Error('席位必须为2～6，且地图出生点足够');if(room.slots.slice(n).some(s=>s.occupantId))throw Error('请先清空将删除的席位');const resized=[...room.slots];while(resized.length<n){const used=resized.map(s=>s.spawn);const spawn=room.map.spawns.find(p=>!used.some(h=>h.q===p.at.q&&h.r===p.at.r))?.at;if(!spawn)throw Error('请先恢复默认出生点');resized.push({number:resized.length+1,kind:'human',occupantId:null,spawn:{...spawn}});}room.slots=resized.slice(0,n);}
        else {const slot=room.slots.find(s=>s.number===input.number);if(!slot)throw Error('席位不存在');
          if(input.op==='spawn')slot.spawn=validateSpawn(room.map,room.slots,slot.number,input.at);
          else if(input.op==='type'){if(!['human','bot'].includes(input.kind))throw Error('席位类型无效');const old=room.seats.find(s=>s.id===slot.occupantId);if(old&&!old.bot)throw Error('请玩家先退出参战席位');if(old)room.seats=room.seats.filter(s=>s!==old);slot.occupantId=null;slot.kind=input.kind;if(input.kind==='bot'){let n=1;while(room.seats.some(s=>s.name==='电脑牢大'+n))n++;const bot:Seat={id:id(),token:'',socketId:null,name:'电脑牢大'+n,color:colors[slot.number-1],character:'laoda',deck:[...DEFAULT_DECK],bot:'normal',observer:false};room.seats.push(bot);slot.occupantId=bot.id;}}
          else throw Error('席位操作无效');
        }
      }broadcast(room);return{ok:true};
    });
    command('bots',input=>{
      const {room}=authorized(true);if(room.game&&!room.test)throw new Error('普通房间开局后不能管理Bot');
      if(input?.op==='add')addBot(room);
      else if(input?.op==='remove'){const bot=room.seats.find(s=>s.id===input.id&&s.bot);if(!bot)throw new Error('Bot不存在');room.seats=room.seats.filter(s=>s!==bot);const slot=room.slots.find(s=>s.occupantId===bot.id);if(slot){slot.kind='human';slot.occupantId=null;}if(room.game){room.game.players=room.game.players.filter(p=>p.id!==bot.id);room.game.springs=room.game.springs.filter(t=>t.owner!==bot.id);}}
      else if(input?.op==='configure'){const bot=room.seats.find(s=>s.id===input.id&&s.bot);if(!bot||!['easy','normal','hard'].includes(input.difficulty)||!Object.hasOwn(CHARACTERS,input.character))throw new Error('Bot参数无效');if(room.game)throw new Error('角色和难度在重新测试前配置');bot.bot=input.difficulty;bot.character=input.character;}
      else if(input?.op==='pause'&&room.test&&room.game)room.game.pausedBots=!!input.value;
      else if(input?.op==='behavior'&&room.test&&room.game){if(!['normal','move','attack','idle'].includes(input.mode))throw new Error('行为无效');for(const p of room.game.players)if(p.bot)p.botMode=input.mode as BotMode;}
      else throw new Error('Bot操作不可用');broadcast(room);
    });
    const start=(room:Room)=>{const players=room.slots.flatMap(slot=>{const s=room.seats.find(s=>s.id===slot.occupantId);return s?[{...s,color:colors[slot.number-1],spawn:validateSpawn(room.map,room.slots,slot.number,slot.spawn)}]:[];});if(players.length<2||players.length>6)throw new Error('需要2～6名真人或Bot');if(players.some(s=>!validDeck(s.deck)||!Object.hasOwn(CHARACTERS,s.character!)))throw new Error('无效配置');room.game=createArena(players,room.seed,id(),RT_CONFIG.matchMs,room.map);room.cache.clear();room.feedback.clear();room.lastWall=performance.now();room.accumulator=0;broadcast(room);};
    command('start',()=>{const{room}=authorized(true);if(room.game)throw new Error('已经开始');start(room);});
    command('restart',()=>{const{room}=authorized(true);if(room.game?.phase==='playing'&&!room.test)throw new Error('普通比赛结束后才能重开');room.game=null;room.cache.clear();broadcast(room);});
    const dedup=(input:any,callback:(room:Room,seat:Seat)=>unknown)=>{
      const{room,seat}=authorized();if(typeof input?.requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(input.requestId))throw new Error('无效请求ID');
      if(!room.game||input.matchId!==room.game.matchId)throw new Error('比赛已变更，请等待同步');
      const key=seat.id+':'+input.requestId;if(room.cache.has(key))return room.cache.get(key);
      if(room.cache.size>=8192)throw new Error('本局请求上限已达');
      if(seat.observer||!room.game.players.some(p=>p.id===seat.id))return{ok:false,reason:'观众不能执行战斗操作'};const result=callback(room,seat);room.cache.set(key,result);broadcast(room);return result;
    };
    command('skill',input=>{if(input?.cardProtocol!==CARD_PROTOCOL)return{ok:false,reason:'页面版本已过期，请刷新页面后重新选择卡牌',code:'CLIENT_VERSION'};return dedup(input,(room,seat)=>(()=>{if(input.intent?.kind==='move')return requestMovement(room.game!,seat.id,input.intent.at);const p=room.game!.players.find(p=>p.id===seat.id);const slot=input.intent?.slot;if(!Number.isInteger(slot)||slot<0||slot>3||!p)return{ok:false,reason:'请选择当前手牌槽位'};return submitHand(room.game!,seat.id,{slot,instanceId:input.intent.instanceId,targetId:input.intent.targetId,at:input.intent.at,direction:input.intent.direction,arc:input.intent.arc,auto:input.intent.auto},input.requestId);})());});
    command('navigate',input=>dedup(input,(room,seat)=>setNavigation(room.game!,seat.id,input.navigation)));
    command('cancelInput',input=>dedup(input,(room,seat)=>cancelBuffered(room.game!,seat.id)));
    command('cancelAll',input=>dedup(input,(room,seat)=>{cancelBuffered(room.game!,seat.id);const p=room.game!.players.find(p=>p.id===seat.id)!;p.navigation=null;p.navigationNotice='已取消自动移动与待执行操作';return{ok:true};}));
    command('buy',input=>dedup(input,(room,seat)=>buyResource(room.game!,seat.id,input.item)));
    command('finish',()=>{const{room}=authorized(true);if(!room.test||!room.game)throw new Error('仅测试房主可提前结束');room.game.phase='finished';for(const p of room.game.players){cancelBuffered(room.game,p.id,'比赛已结束');p.navigation=null;p.action=null;p.movement=null;p.forced=null;}log(room.game,'测试房主结束对局');broadcast(room);});
    command('leave',()=>{const{room,seat}=authorized();if(seat.id===room.hostId){rooms.delete(room.code);for(const s of room.seats)if(s.socketId){const peer=ns.sockets.get(s.socketId);if(peer){peer.emit('closed');delete peer.data.rtCode;delete peer.data.rtId;}}}else{if(room.game?.phase==='playing')throw new Error('比赛进行中，关闭页面会保留身份');room.seats=room.seats.filter(s=>s!==seat);for(const s of room.slots)if(s.occupantId===seat.id)s.occupantId=null;delete socket.data.rtCode;delete socket.data.rtId;broadcast(room);}return{ok:true};});
    socket.on('disconnect',()=>{const o=own(socket);if(o){o.seat.socketId=null;broadcast(o.room);}});
  });
  let ticks=0;
  const timer=setInterval(()=>{const now=performance.now();for(const room of rooms.values()){
    if(!room.seats.some(s=>s.socketId)){room.idleSince??=now;if(now-room.idleSince>600000){rooms.delete(room.code);continue;}}else room.idleSince=null;
    const elapsed=now-room.lastWall;room.lastWall=now;if(room.game?.phase==='playing'){room.accumulator+=elapsed;let steps=0;while(room.accumulator>=RT_CONFIG.tickMs&&steps++<200){room.accumulator-=RT_CONFIG.tickMs;stepArena(room.game);decideBots(room.game);flushFeedback(room);}if(ticks%2===0||room.game.now>=room.game.duration)broadcast(room);}
  }ticks++;},RT_CONFIG.tickMs);timer.unref();
  io.httpServer?.on('close',()=>clearInterval(timer));
  return rooms;
}


