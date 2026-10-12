> 当前实时开发版本：Elbow Mayhem 2.1。九卡、连续能量、前摇与独立效果、高度碰撞规则以 [2.1交付与规则说明](./RELEASE_2_1.md) 为准。下文保留此前版本与Legacy说明，数值冲突时请按所选模式区分。

## 全屏HUD、多地图与地图编辑器（2026-10-11）

最新开发服务：http://localhost:5180/?mode=realtime 。地图编辑器：http://localhost:5180/?mode=editor 。5173仍是独立旧便携包；本次未更新发行ZIP、Windows启动器或SakuraFrp。

战斗地图占满视口，底部覆盖HP/能量/移动/4手牌/下一张，顶部仅时间、积分和设置。镜头区域会避让底部HUD；支持全图、平滑跟随、缩放、拖动、重置。排行榜、日志、补给和测试工具在右上角“排行 / 信息”中，规则与离开入口在“设置”。

大厅房主可选择中心竞技场（原地图）、深渊环岛、弹簧工厂或当前浏览器保存的自定义地图。地图随房间同步；开局后禁止更换。人数不能超过出生点数量。

编辑器：选工具→点格子；拖动不绘制。出生点编号1～6，弹簧六方向0～5。支持保存、加载、预览、JSON导入导出和“使用Bot测试地图”（打开独立测试页，最多3个Bot，出生点较少时相应减少）。本机最多保存30张地图；清除浏览器数据会丢失，推荐导出备份。导入内置ID的地图另存时会自动生成custom ID。

JSON格式详见GAME_RULES.md“地图格式v1”；可直接导入的样例：maps/classic.json、maps/abyss.json、maps/factory.json。服务端仅接受验证后复制的数据，不执行地图文本，不读取本地文件路径。

验证命令：npm test；npm run build；npm run test:maps:browser；npm run test:maps:touch；npm run test:maps:network；npm run simulate:maps。地图网络测试使用maps-review/custom-map.json（仓库内附有浏览器编辑导出的样例）；若删除该样例，先运行test:maps:browser生成。

## 默认移动版（2026-10-11）

配卡：点击上方8个位置之一，再点击下方收藏卡直接替换；允许重复，普通移动不在收藏区或8张卡组内。保存后刷新或新建房间会恢复本机配置。战斗严格4张手牌，下一张只预览。界面顶部标明“默认移动版”。不选技能时点相邻格即可移动，旁边小型移动图标可取消技能选择；不是第五个手牌槽。旧配置仅按位置替换移动牌，其他选择原样保留，并在本机保留迁移前备份。如提示版本更新，请使用“刷新到最新版本”，不要继续使用旧页面。

验证：`npm run test:cards:browser`执行真实双浏览器移动、伤害、治疗与连续循环；`node scripts/card-version-browser.mjs`验证版本提示。

## Elbow Mayhem 2.0：实时乱斗开发版（2026-10-11）

打开 `http://localhost:5180/?mode=realtime` 可试玩本次留在本机运行的版本。当前5173服务和SakuraFrp未修改；5180不是已验证的公网地址。首页也增加“单人测试”“Bot观战模式”“实时多人2.0”入口。Legacy仍在 `/`，实时模式使用 `/?mode=realtime`，两种房间不互通。

单人测试：创建1真人＋3普通Bot → 选择角色与8张卡牌 → 保存 → 开始实时战斗。观战模式默认6 Bot，观察者不占参赛名额。真人和Bot合计最多6名。测试房主可在战斗中增删Bot、暂停/恢复决策、限制行为、提前结束、重新配置。暂停决策不会取消已开始的技能；能量、机关和比赛时钟继续运行。

角色：牢大100HP（肘击额外5伤害）、铁头哥140HP（直接敌方击退少1格、移动慢30%）、闪电鼠75HP（移动/冲刺快30%）。8张卡组、4个循环手牌槽，允许重复；普通移动为默认操作，7种特殊卡全部实现：牢大肘击、冲刺、治疗、重击、闪现、范围肘击、放置弹簧。

手机：不选卡时点相邻格移动；点特殊卡牌，再点棋盘目标即释放，成功开始后返回移动模式；治疗/范围肘击点击卡牌直接释放。再次点已选卡、取消按钮或ESC取消；桌面1～4选卡。弹簧先设置朝向再点位置。支持全地图/跟随视角、双指缩放、单指平移与恢复视角，拖动不触发技能。跟随镜头基于角色视觉位置平滑移动。目标技能可选远处对手预判，前摇结束才检查射程；落空仍扣能量。能量和动作进度由服务器状态展示。

开发和验证：

```powershell
npm ci
npm run build
$env:PORT='5180'
$env:NODE_ENV='production'
npm start
# 在另一终端验证
npm test
npm run test:realtime
npm run test:realtime:network
npm run test:realtime:browser
npm run simulate:realtime
node scripts/realtime-soak.mjs
```

生产仍由同一个服务器提供网页、原Socket.IO通道及新增 `/realtime` 命名空间。前端使用同源地址，支持WebSocket与轮询回退，没有硬编码开发机IP。Windows启动器和SakuraFrp无需改协议；但历史ZIP中的服务器/网页仍是旧构建，本次没有覆盖发行目录或打包ZIP。开发版部署应使用本次完整dist构建，不能只拷新网页给旧后端。

可靠备份：`backups/legacy-20261011-173211/`，包含修改前src、scripts、dist、portable、launcher-win、依赖锁定和构建配置；`SHA256.csv`记录文件校验值。Legacy源引擎未改，新增实时规则在src/realtime，服务器接入在src/server/realtime.ts，UI在src/web/RealtimeApp.tsx。测试输出与截图位于realtime-review。

这是可运行原型，不宣称已平衡。新模式尚未进行Android/iPhone真机、Safari/Edge引擎或公网双物理设备实测。详见TEST_REPORT.md、KNOWN_ISSUES.md及GAME_RULES.md。本页以下内容中的旧卡池、回合和发行包描述适用于Legacy。

# 肘击大乱斗 · Elbow Mayhem

《肘击大乱斗》（Elbow Mayhem）是 2～6 人联机的六边形中心争夺游戏。服务端裁定规则，浏览器只提交操作意图。当前正式卡牌库仅包含 **牢大肘击**（ID `laoda_elbow`）；其余 23 种旧卡牌正在重新设计，旧效果代码与回归测试保留，但不会从正式游戏的公共卡池、盲盒、商店和初始牌生成。

## 本地开发

项目目录保持为 `D:\game`。需要 Node.js 24，在项目目录执行：

```powershell
npm ci
npm run dev
```

开发网页为 `http://localhost:5173`，开发服务端默认监听 3001 端口。创建房间后，其他玩家输入六位房间码加入。昵称可以留空，服务端按本房间当前可用的最小加入序号分配“神秘牢大X”；自定义昵称不可与同房间玩家重复。断线重连和重新开局保留昵称。2～6 人准备后由房主开始，房主可在开局前调整总轮数（1～99）；2/3/4/5/6 人默认分别为 18/13/10/10/10 轮。

默认无限时：每人 3 基础 AP，可自由安排移动和一次卡牌操作（抽一张或主动使用一张），也可不操作卡牌就结束个人回合。公共 4+1 卡池与 3 张手牌上限保持不变。地图上的六个固定弹簧仍在原位，弹射两格，方向相对原朝中心方向按棋盘屏幕坐标顺时针偏转 60°。详细规则见 [GAME_RULES.md](./GAME_RULES.md)。

首次进入可查看教学；顶部“游戏规则”展示图例和当前正式卡牌。开发模式支持本机房主调试场景；导出含私密对局状态，请勿公开。房间中的“结束本局”投票与“关闭房间”保留原有行为。

## 验证与构建

```powershell
npm run typecheck
npm test
npm run build
node scripts/multiplayer.mjs
node scripts/nickname-regression.mjs
```

`multiplayer.mjs` 使用独立 Socket.IO 会话完成 2～6 人整局，检查公共卡牌、重复抽牌、重连和重开；`nickname-regression.mjs` 检查 6 个默认昵称、昵称冲突、序号复用、重连和自定义轮数。其他联机回归脚本及实际执行结果见 [TEST_REPORT.md](./TEST_REPORT.md)。

若局域网客户端操作失败，可在地址后加 `?debug=1`，查看连接、玩家 ID、阶段、最近操作及 ACK；不要分享身份令牌。生产首页和版本信息禁用缓存，客户端发现新版本会提示刷新。联机经 Socket.IO 与服务端同步；公网和异机验证仍需在实际网络环境执行。

## 生产与便携发布

`npm run build` 生成前端静态资源与服务端产物。生产服务由同一进程提供网页和 Socket.IO；设置 `NODE_ENV=production`、`PORT=3001` 后运行 `npm start`。`/health` 可检查进程。容器方案见 [DEPLOY.md](./DEPLOY.md)。房间保存在单个进程内存，进程重启会丢失正在进行的比赛。

Windows 10/11 x64 图形启动器与完整生产服务器已打入 [ElbowMayhem-Windows-x64-GUI-v0.2.0.zip](./release/ElbowMayhem-Windows-x64-GUI-v0.2.0.zip)。完整解压后双击 `肘击大乱斗/肘击大乱斗启动器.exe`，在窗口选择端口并启动；同一服务进程提供网页、Socket.IO 和规则引擎，包内含 Node.js 运行时，无需另装 Node、npm 或 Vite。启动器使用 Windows .NET Framework 4.x，系统若禁用该组件需启用。可用端口在启动前重检，启动成功由网页、Socket.IO 和 `/health` 共同确认；停止只针对该启动器创建的游戏服务进程。若系统弹出防火墙提示，由用户自行决定是否允许局域网访问，启动器不会自动改动防火墙。

构建命令：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-gui-launcher.ps1`。脚本先生成生产便携服务，再用 Windows 自带的 .NET Framework C# 编译器构建 WinForms EXE，产物在 `release/肘击大乱斗/` 和 `release/ElbowMayhem-Windows-x64-GUI-v0.2.0.zip`。发行包需完整复制，单独的 EXE 不包含服务器文件。Linux/macOS GUI 包未构建或验证。

启动器的“SakuraFrp 公网联机”页只读取本机已安装客户端的现有配置及 [官方隧道/节点 API](https://github.com/natfrp/api)，显示隧道类型、本地目标端口、在线状态和实际公网地址，并提示将游戏端口匹配现有隧道。当前安装的 SakuraFrp Launcher 所附 `frpc.exe` 明确只允许由 SakuraFrp Service 启动；因此启动器中的隧道启停、自动启停按钮被禁用。点击“打开 SakuraFrp 客户端”在原客户端启动现有隧道，再回启动器刷新。启动器不会新建/修改隧道、保存访问密钥或关闭其他隧道。公网网址只有网页、健康检查和 Socket.IO 检查通过后才标为已验证；异机/手机完整对局仍需实测。TCP 映射使用节点域名加远程端口，不代表启动器会自动开放防火墙、处理 NAT 或提供 HTTPS。公网使用建议配置可信网络及 HTTPS/WSS，并只向可信朋友分享房间信息。

## 手机与平板操作（2026-10-11）

手机竖屏优先显示棋盘，底部固定“公共卡池 / 我的手牌 / 结束回合”。公共卡池和手牌为可滚动的独立标签页；下一张预览不可抽取。点“效果详情”查看全文；选择牢大肘击后，点高亮玩家，再确认目标才提交出牌。没有相邻目标时显示原因。地图格可点击查看机关方向、资源和玩家昵称。

棋盘支持 Pointer Events：双指缩放（1～3倍），放大后单指平移，一键“重置视角”。拖动超过6个CSS像素或出现第二根手指后，本次手势不会提交移动/出牌。画面变换仅用于显示，不更改轴坐标、游戏状态或服务器判定。小屏横屏默认完整展示棋盘，精确选格时可放大。

排行榜、商店、战报、结束本局投票在可关闭的面板内。浏览器返回优先关闭当前面板。使用安全区域、动态视口与实际底栏高度测量处理横竖屏切换；输入框16px字体避免iOS聚焦自动放大。后台恢复、pageshow和网络恢复时使用原有resume身份恢复流程，不重发旧游戏操作。

移动端自动验收：

```powershell
npm ci
npm run build
npm run test:mobile
```

测试使用本机已安装的 Google Chrome 和 Playwright，不下载浏览器；要求5198端口空闲。测试启动临时本机服务，使用生产网页构建，开发调试接口仅用于布置合法测试场景，结束时关闭自己的测试服务。测试与截图位于 `mobile-review/`。普通运行继续使用原有启动方式；本次未更新便携ZIP、启动器或公网隧道。

已检查320×568、360×800、375×812、390×844、412×915、667×375、844×390、768×1024、1024×768和1440×1000桌面；完整操作链路在390×844触摸模拟与独立桌面会话之间执行。Android/iPhone真机、Safari/WebKit引擎、移动浏览器真实工具栏和软键盘、Wi-Fi/蜂窝网络切换仍需设备实测，不能将本机浏览器模拟视为公网双设备验收。


## 2D / 2.5D 客户端渲染

实时战斗左上角可切换 2D 或 2.5D；与全地图/跟随镜头独立，可组合使用。设置保存在本机浏览器，切换不发送游戏操作。沿用 SVG，无新增图形依赖。

地图 version:1 的 floors 项允许可选 height，例如 {"q":0,"r":0,"height":2}。省略为0，服务器校验有限数值0～4，支持小数。只影响斜俯视地板高度，不改变移动、范围、击退、机关或伤害。2D忽略高度。可通过现有编辑器导入/导出JSON；本次未增加高度画笔或修改内置地图。

渲染顺序：远至近的地板侧面/顶面、地面标记与机关、地面闪现箭头、玩家、技能效果、血条昵称、目标提示、HTML HUD。相机只变换显示，点击使用实际SVG命中元素的轴坐标。

当前卡牌库没有火球，因此没有新增火球规则或伪造火球落点测试。该轻量SVG方案不是完整3D引擎：人物与血条保持在地形上方以确保操作清晰，不提供真实3D遮挡、光照或地形物理。

验证命令：npm test；npm run build；node scripts/render-modes-browser.mjs；npm run test:realtime:browser（PowerShell设置 $env:RENDER_STYLE='2.5d' 可测斜俯视）；npm run test:realtime:network；npm run test:maps:network；npm run test:mobile；npm run simulate:realtime。截图位于 render-review/。
