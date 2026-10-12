# 2.1 操作优化交付

修改前基线提交：f781f97，development-2.1。本轮工作连续承接上一条集中优化请求，过程中最新要求将单键快施覆盖为两次按键，并新增普通移动后摇。没有修改地图、角色基础属性、能量恢复、Windows启动器、SakuraFrp或Legacy，也没有制作ZIP。

## 最新两项

- moveRecoveryUntil由服务器模拟时钟驱动，普通移动结束设为now+200ms；不是action或能量计时器。开始下一次合法普通移动后清零。自动导航在同一tick完成旧移动并开始下一步，所以连续路径无额外200ms。取消中途移动按当前50%逻辑格停下，开始200ms后摇；已完成移动的重复停止不刷新后摇。能量不足、到达、受阻时保留自然到期的后摇。
- 攻击前摇（elbow/basic/hook/arrow/fireball/charge）受后摇限制；已发射效果继续运行，移动执行中仍允许兼容非位移前摇。blink/cover/mine不额外受该攻击后摇限制。Bot通过同一个startSkill检查，未修改其难度和思考频率。
- QWER记录slot与instanceId。首次高亮；同槽同实例再次按键走quickCast；不同键只切换。成功或过牌清空选择；失败保留选择并显示原因。忽略repeat/组合键/输入焦点。触摸双击仍320ms，同一实例等待ACK期间不重复发送。ESC、右键、移动图标取消；取消请求与技能请求在同一Socket上有序到达，尚未收到ACK也可取消缓冲。

## 上一条请求的衔接内容

实际根因：客户端全前摇拒绝输入；所有事件共用pending布尔锁；客户端提前拦截被占据的掩体目标；缺少落空反馈。现为按实例隔离的待ACK集合，断线清理且不自动重发；服务器末300ms只缓存一个请求。缓存不扣能量/过牌，到期重新校验，skillResult推送终态并更新去重缓存；取消、死亡、击晕、旧实例、失效目标、费用不足有明确结果。

掩体当前占位不阻止开始前摇，结束时三格原子校验。箭矢手动点目标后显示低/高抛菜单，选择即发；菜单按相机投影定位并限制在屏内，鼠标和触摸均可使用。卡牌详情读SKILLS/RT_CONFIG，实战保持四张图标与费用。地形技能没有既定安全快施规则时仍提示手动选格，不随机选择落点。

此前明确指定、在最新两项请求之前已调整的数值：

|卡|费用|前摇|当前效果|
|---|---:|---:|---|
|肘击|2|0.3s|30伤害、推1格、晕1.2s|
|大运|3|0.6s|0.9s冲3格；玩家35伤害/晕1.2s，障碍仍10伤害；同目标一次|
|弓箭|2|0.7s|20伤害，真实高低抛体|
|火球|4|0.3s|飞行1.7s，中心40/周围30|
|地雷|3|0.5s|10HP，每秒-2，爆炸50/10；不变|
|掩体|2|0.5s|三个独立10HP，每秒-2；不变|
|闪现|2|0.5s|3格；不变|
|钩锁|3|0.5s|5伤害、晕1秒、0.4秒拉拽；不变|
|平A|1|0.3s|20伤害；不变|

导航由服务端有界Dijkstra计算（最多217格），考虑地板/高度/占位/动态墙；地雷是高代价而非墙。每步用requestMovement验证，单一navigation任务保存目标；路径受阻最多每500ms重算。目标死亡/离开取消；复活不恢复旧路径。S停止，远处新目标覆盖跟随。技能与自动移动共享动作验证，位移技能在验证成功后打断当前普通移动，按服务器现有逻辑格接续。

## 实际验证

- TypeScript、生产构建成功；237项测试/30文件通过，旧2.0/Legacy测试保留。
- controls21浏览器：QWER全槽首次只选、二次施法、Q→W不发、四次释放四个请求、循环实例、ESC/右键/移动图标取消、框体尺寸稳定；两次快速技能通过服务器缓冲。
- 自动路径按实际广播中的movement.start/end逐步比对，相邻步骤无空档；最后有200ms后摇。桌面右键和手机CDP长按跟随、停止、触摸高抛均通过。
- 1真人+3个正在行动的Bot：跟随目标、W/W释放火球、双方继续行动通过。截图来自真实Chrome。
- controls21网络：缓存时/执行后重复请求不重复扣费过牌、最终回执、取消、两客户端同步、断线恢复自动任务、停止后摇和令牌隐私通过。
- 九卡实际释放、原桌面/触摸独立访客、Legacy九种视口及投票通过。能量不足的旧连招脚本曾失败：火球前摇缩短后初始5能量不足以立刻接2费闪现；改为先等6能量，没有绕过费用检查。
- 80局加速Bot模拟=800模拟分钟，约115.7秒真实执行；6Bot组20局，53456次动作、1415击杀。全部位置/HP/能量/卡牌实例/击杀不变量通过。三图另12局36模拟分钟通过。不是长期网络或内存泄漏认证。

未验证真实Android/iPhone、Safari、公网双设备和高延迟弱网。静态目标跟随、活跃Bot跟随均测试；跨设备公网机制沿用，但不能把独立浏览器测试称为外网真机验收。自动导航无路连续5秒即取消，需要重新指定目标。地形三卡快施仍按既有规则要求手动指定安全落点。

## 文件

- src/realtime/config.ts
- src/realtime/engine.ts
- src/realtime/navigation.ts
- src/realtime/card-details.ts
- src/server/realtime.ts
- src/web/RealtimeApp.tsx
- src/web/RealtimeBoard.tsx
- src/web/RealtimeDeckEditor.tsx
- src/web/realtime.css
- src/realtime/input21.test.ts
- src/realtime/navigation21.test.ts
- src/realtime/tuning21.test.ts
- src/realtime/combat21.test.ts
- src/realtime/regression21.test.ts
- scripts/controls21-browser.mjs
- scripts/controls21-network.mjs
- scripts/combat21-browser.mjs
- scripts/combat21-network.mjs
- scripts/combat21-nine-browser.mjs
- scripts/experience21-browser.mjs
- package.json
- README.md
- GAME_RULES.md
- TODO.md
- TEST_REPORT.md
- RELEASE_2_1.md
- CONTROLS_2_1.md

## 截图

- controls21-review/desktop-deck.png
- controls21-review/desktop-details.png
- controls21-review/four-slots.png
- controls21-review/desktop-arc-menu.png
- controls21-review/mobile-arc-menu.png
- controls21-review/desktop-follow.png
- controls21-review/mobile-follow.png
- controls21-review/live-bots.png

复现命令：npm test；npm run build；npm run test:2.1:controls；npm run test:2.1:browser；npm run test:2.1:network；npm run test:2.1:experience；npm run test:mobile；npm run simulate:realtime；npm run simulate:maps。
