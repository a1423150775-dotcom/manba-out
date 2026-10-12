# 双渲染模式验证（2026-10-11）

- 类型检查、生产构建成功；23个测试文件、139项测试通过。新增15项高度校验、投影方向和规则不变测试。
- Chrome桌面1440×1000、移动触摸模拟390×844：四种渲染/镜头组合，切换不发送游戏操作；高低地板、移动扣能量、治疗补牌、缩放平移后点格、触摸缩放、刷新身份和渲染偏好恢复通过。实际截图与结果：render-review/。
- 既有实时双客户端浏览器回归分别在2D与2.5D通过：移动、治疗、肘击伤害/击退、触摸、卡槽循环、Bot、重连、结算重开与图层顺序。
- Socket.IO身份与请求去重、地图同步测试通过。Legacy九种视口及真实Chrome触摸事件模拟通过。
- 80局加速Bot模拟（合计800模拟分钟）完成，非800分钟真实运行；不是长期内存泄漏证明。
- 未进行真实Android/iOS Safari或外网双设备测试。无火球卡，未测试实际火球飞行/落点；不新增战斗技能。
- 高度仅显示，内置地图未修改。测试高度图从原地图克隆，仅为显示验收，不作为新内置地图发布。

---

## 卡牌UI稳定性修复（2026-10-11）

真实Chrome复现：选中边框1px→3px、卡牌translateY(-4px)，条件取消按钮和弹簧方向行撑高HUD，ResizeObserver随后重算地图镜头。桌面HUD最大变化56px，390px手机58px；页面滚动坐标和滚动条无变化。卡牌没有所属form，未发生表单提交；未通过阻止焦点来掩盖问题。

修复仅限RealtimeApp.tsx、RealtimeDeckEditor.tsx、realtime.css：固定选卡边框/卡牌高度，移除选中位移；状态与提示行预留固定空间，方向选择复用提示行；取消按钮保持占位；保留focus-visible虚线键盘描边，按钮显式type=button。没有修改规则、技能或卡组机制。

新增 scripts/card-stability-browser.mjs：先运行（无参数）记录基线；修复验收用 --verify。证据：card-stability-review/before.json、after.json与桌面/手机截图。1440×1000、390×844、320×568、844×390全图模式每种连续16次切换：卡牌/容器/HUD/地图矩阵/滚动位置最大变化均0px。检查border、padding、margin、transform、焦点和表单归属。键盘Tab仍有独立可见焦点。

类型检查、生产构建、全量124测试通过；真实桌面+触摸实时回归中选卡、目标点击、肘击、治疗、移动及重连通过。未实测实体Android/iPhone/Safari。

## HUD与地图验收（2026-10-11）

- TypeScript与生产构建通过；全量Vitest 22文件/124测试通过，新增16项地图测试包含三图Bot、50种子默认资源一致、六方向推挤、内部空洞死亡、复活、弹簧与移动中点。
- maps-browser：真实Chrome操作编辑器添加/删除地板、出生点、障碍、弹簧方向；缩放后命中正确、拖动画布不误绘制；保存/导出/导入一致；启动自定义地图真人+3Bot；三张地图实际移动、全图与跟随正常。
- maps-touch：Chrome触摸模拟环岛移动/技能；真实CDP单指拖动/双指缩放不误操作；重置后选格正确；320×568、360×800、375×812、390×844、412×915、667×375、844×390、768×1024无页面横溢出，4卡槽在屏幕内、跟随角色不被HUD遮挡；刷新恢复身份和手牌。
- maps-network：独立Socket.IO会话验证三图同步、非法地图拒绝、非房主/开局后改图拒绝、自定义地图普通玩家移动与请求去重、重连地图一致。
- 既有realtime网络与Chrome桌面/触摸技能回归、Legacy手机测试通过。三图额外12场/36分钟加速Bot模拟与既有80场/800分钟加速模拟完成；未将模拟时间当作在线压测时间。
- 浏览器验收发现并修复过固定棋盘残留绘制、结算界面遮挡设置两处问题。最终浏览器结果与截图见maps-review、realtime-review。
- 未进行本次版本的Android/iPhone实体机、Safari或公网双设备实测；未声称跨设备公网回归已经完成。现有同源Socket.IO/身份/请求去重机制保留。

修改文件：src/realtime/maps.ts、maps.test.ts、engine.ts；src/server/realtime.ts；src/web/MapEditor.tsx、RealtimeApp.tsx、RealtimeBoard.tsx、useBoardViewport.ts、main.tsx、realtime.css；scripts/maps-{browser,network,touch}.mjs、maps-simulate.ts、export-maps.ts、realtime-browser.mjs；package.json；maps/*.json；README.md、GAME_RULES.md、TODO.md、TEST_REPORT.md、KNOWN_ISSUES.md。源代码备份：backups/before-maps-hud-20261011。

## 默认移动改版：2026-10-11

- 类型检查与生产构建通过。Vitest：21文件、108测试通过，包含移动50%切格、1秒动作、费用、不循环、非法/忙碌/击晕拒绝与逐槽迁移；原40%/60%打断测试保留。
- 实际Chrome桌面+390px触摸会话：默认点格移动、移动图标/ESC/右键取消、非法目标保留选择、肘击/治疗、施法后返回移动、4手牌+独立移动指示器、保存/刷新与双会话同步通过。320/390/844/768宽度无整体溢出。截图和结果：realtime-review。
- Socket.IO回归通过；Legacy规则和test:mobile通过。80场Bot模拟（800分钟模拟时间）完成，占格、HP、能量、卡牌实例守恒检查通过；这不是800分钟实际在线压测。
- 未实测Android/iPhone实体设备或本次公网双设备；未修改SakuraFrp、Windows启动器或Legacy规则。

## 历史：卡牌系统修复验收（2026-10-11；移动入循环规则已被本次替代）

### 实际根因证据

检查用户当时打开的5180内置浏览器，而不是只新建测试会话：页面加载 assets/index-K5p7sRc4.js，仍有旧版“可行动 · 已选择范围肘击”和旧棋盘工具栏，界面实际显示“请选择当前手牌槽位”。旧前端用固定move加完整deck渲染可释放按钮，并发送skill名称；新版服务端只接受hand槽位0～3。因此完整8张被误画为技能栏，固定移动又与卡组内重复移动混在一起，所有旧格式真人技能请求均被拒绝。上轮只验证了新开的最新前端，没有处理已经打开的旧JS页面，这是遗漏；不是删除权限或修改能量能解决的问题。

### 修复范围

- CARD_PROTOCOL版本握手与状态校验；旧请求返回明确“页面版本已过期，请刷新”提示。前端每15秒及窗口聚焦检查version.json，不匹配时提供刷新入口并阻止继续施法。
- 新useHandCard统一真人/Bot入口：槽位0～3＋独立实例ID＋目标；服务端从当前手牌取技能。已换牌的旧实例明确拒绝，不能误放新补牌。
- 卡组配置仍为8个技能选择（允许重复）；开局生成8个独立实例，hand4＋queue4为互斥有序分区，成功启动原子扣能量并循环。配置不是可直接施法的手牌。未改伤害、HP、恢复速度、前摇、地图、弹簧或击晕。
- 替换式卡组编辑器：上方8位置，下方原创SVG卡牌收藏；点位置再点收藏替换，未满时追加，支持移除、默认、完整说明、平均费用、保存。刷新同房及新建房间恢复保存配置。
- 战斗仅渲染hand四个按钮，预览为无按钮展示。保留直接释放/取消/1～4操作，非法目标与版本/能量/状态错误均有文字反馈。

### 实际运行结果

1. 类型检查、生产构建通过；20个测试文件105项全部通过，包含既有101项及新4项手牌请求测试。
2. 实时Socket.IO回归通过：非房主、重复请求、重连手牌、实例去重、过期实例拒绝、旧版本拒绝、权限、动态Bot和重开。
3. scripts/card-repair-browser.mjs实际Chrome两个隔离会话（390×844触摸＋1400×1000桌面）：替换保存8张，其中恰好3张普通移动；刷新保持；进入战斗断言4个可操作槽、无额外槽/确认按钮、预览无按钮；实际闪现与移动；桌面肘击前摇后HP100→80、向外推2格；手机治疗点击即开始、HP80→100；连续8次真实UI施法，每次精确断言手牌/队列实例顺序和原槽位补牌；能量不足触摸显示原因且不循环；刷新恢复同一身份与牌序。无JS运行时异常。结果在card-repair-review/browser.json。
4. 能量测试前几次失败属于测试前提/自动等待问题：Playwright locator.click会等待aria-disabled按钮变可用；最终用真实touchscreen.tap点击不可用牌，且选择无盲盒站位，不修改能量或伤害。最终专项全通过。
5. 目标在前摇中离开导致落空、落空/打断不退牌、启动失败不循环、完整16次实例循环，已由执行中的规则测试覆盖；不把这些单元场景说成真实设备测试。
6. 既有realtime-browser最终再次通过：真人与3Bot、选卡/ESC、手机移动/治疗/肘击、相机采样、重连、结算、6Bot观战。原test:mobile全通过（Legacy 9视口、CDP触控、旧规则完整操作、商店/投票/重连）。
7. 80局800模拟分钟Bot回归通过，手牌4/队列4/8实例唯一、技能集合守恒以及位置HP能量不变量均检查。
8. card-version-browser模拟版本不一致，实际页面显示更新提示和刷新按钮；不会继续静默操作。
9. 5180已更新并保持运行。用户原内置浏览器已实际刷新，看到“四槽循环版”，在该页面开局后只见4卡槽；点击移动及相邻格，界面进入“普通移动执行中”，原槽补牌、下一张从移动变闪现。验证后已返回配卡界面，保留用户自己的已保存卡组。

截图均来自实际游戏：card-repair-review/deck-editor-desktop.png、deck-mobile.png、four-slots.png、battle-four-mobile.png、battle-four-desktop.png。four-slots.png由正在运行的5180服务生成，并断言4个按钮。

修改文件：src/realtime/config.ts、engine.ts、bots.ts；新增hand-request.test.ts；src/server/realtime.ts；src/web/RealtimeApp.tsx、RealtimeBoard.tsx、realtime.css；新增RealtimeDeckEditor.tsx；scripts/realtime-network.mjs、realtime-browser.mjs；新增card-repair-browser.mjs、card-version-browser.mjs、card-repair-screenshots.mjs；package.json及README.md、GAME_RULES.md、TODO.md、TEST_REPORT.md、KNOWN_ISSUES.md。生产dist与截图为生成文件。修改前备份：backups/cards-repair-20261011。

未验证：Android/iPhone真机、Safari/Edge、此修复版公网双物理设备。Windows启动器、SakuraFrp、5173及发行ZIP未修改。其他仍停留在旧页面的设备需刷新一次；不能替远程设备保证已经更新。

---

## 实时循环卡组与相机升级：最新验收（2026-10-11）

修改文件：src/realtime/config.ts、engine.ts、bots.ts、skills.test.ts、interactions.test.ts；新增src/realtime/cycle.test.ts；src/server/realtime.ts；src/web/RealtimeApp.tsx、realtime.css；新增src/web/RealtimeBoard.tsx；scripts/realtime-network.mjs、realtime-browser.mjs、realtime-simulate.ts；README.md、GAME_RULES.md、RULE_DECISIONS.md、TODO.md、TEST_REPORT.md、KNOWN_ISSUES.md；生成dist与realtime-review证据。备份在backups/realtime-before-cycle-20261011。Windows启动器、SakuraFrp、Legacy核心未修改。

实际结果：
- 类型检查、生产构建成功。Vitest 19文件101项通过，原90项保留并适配当前手牌前提，新增11项：8张验证/重复、四槽顺序、失败不循环、落空/打断保留循环、越权技能拒绝、六方向连续推挤、固定弹簧与Legacy源布局一致。
- 实时联机通过：非房主释放、槽位验证、重复请求不重复扣能量/换牌、重连手牌一致且8实例守恒、动态Bot、重开与旧局请求拒绝。
- Playwright实际Chrome双独立会话通过：手机改8张重复卡组、保存、桌面加入；选卡/切换/重复点取消/ESC；跟随模式放大后的移动；连续采样相机变换有平滑移动且无整格跳跃；治疗点击即释放；移动到邻格后点玩家肘击并确认服务端HP下降；桌面快捷键4直接治疗；无确认按钮；图层顺序断言；刷新恢复身份；Bot活动、重开、结算、6Bot观战。未捕获JS运行时错误。
- 实时布局320×568、390×844、844×390、768×1024、1440×1000无页面横向溢出。实际查看全地图/跟随与手机截图。头像可交互，标签/特效层不截获点选。
- 原有test:mobile完整通过（9视口、实际CDP拖动/双指缩放、触摸点选、资源、投票、断线及手机房主）。multiplayer、end-vote、nickname-regression、debug-smoke通过；turn-system通过（等待41.5秒无自动结束，反应及重连权限正常）。
- Bot模拟80局/800模拟分钟通过，每步检查手牌4、队列4、实例总数8且唯一、技能多重集合与卡组一致，以及HP/能量/地图/占格/击杀状态。1+1、1+3、1+5、6Bot四组动作1650/5733/9637/11638，击杀520/324/621/610。真人座位静止，非真人体验测试。

击退诊断：没有复现服务端六方向反转，攻击者到目标方向公式正确，因此未旋转或反转正确的逻辑。已确认旧显示仅向最新终点插值，不能显示弹簧导致的中途转向；新增逐格只读轨迹并插值经过点。不能声称已定位用户每一次“方向错误”的唯一原因；若仍出现请提供站位和机关位置。
图层诊断：旧渲染将每个玩家的身体、动作环和标签放在同一组，按座位顺序绘制，后一个身体可覆盖前一个标签。现在地面、实体、效果、标签、交互高亮分层，实体按视觉Y排序，两种相机共享同一棵渲染树。

截图（实际运行生成）：realtime-review/battle-desktop.png（全地图）、battle-desktop-follow.png（跟随）、battle-390x844.png（手机卡牌栏）、lobby-mobile.png（卡组配置）。browser.json及simulation.json为机器记录。历史failure截图不代表最终结果。

尚未验证：新模式真实公网双设备、Android/iPhone/Safari/Edge；没有重新打包ZIP。相机跟随击退使用与移动相同的视觉插值管线，但未对所有机关长链进行逐帧自动视觉比对。

---

# Elbow Mayhem 2.0 实时乱斗验收（2026-10-11）

本节为最新结果，下方旧报告仅描述对应历史版本。实时模式为新增隔离模式，Legacy仍是根页面默认模式。修改前快照：backups/legacy-20261011-173211（含SHA256.csv）。未修改Windows启动器、SakuraFrp配置或Legacy核心规则文件。

## 实际执行结果

- TypeScript类型检查通过；生产前端与服务端构建通过。
- 全部Vitest：18个文件、90项通过。其中原有69项保留，新增实时模式21项。覆盖能量、前摇结束重判、预判命中/脱离落空、50%移动逻辑、40%/60%打断、占格冲突/换位、伤害/击杀去重/复活、刷新击晕、机关连锁、角色差异、八种技能、资源及确定性Bot。
- 实时Socket.IO回归通过：两个独立客户端、非房主技能、身份认证、请求去重、能量只扣一次、重连、非法卡组、权限、动态Bot人数上限、结束/重开及旧比赛请求拒绝。
- 实际Chrome Playwright通过：390×844触摸会话与1440×1000桌面会话加入同房；单人测试默认3Bot、角色/卡组保存、真实移动、治疗动作、走近Bot并释放肘击，服务端实际产生伤害和击退；刷新保留身份；Bot持续行动；重开/结算；6Bot观战。无捕获到的JavaScript运行时异常。
- 实时布局检查：320×568、390×844、844×390、768×1024、1440×1000无整体横向溢出。截图在realtime-review。复用既有Pointer Events相机；原有test:mobile再次通过，包括双指缩放、拖动、变换后点选、重置和双客户端操作。新模式尚未单独覆盖所有机型的多指手势。
- Legacy联机回归通过：multiplayer（2～6人完整对局）、turn-system（无限时等待41.5秒、反应/权限/重连）、end-vote（2/3/4人）、nickname-regression、debug-smoke，以及test:mobile。
- Bot加速模拟：1真人位+1/3/5Bot、6Bot四种配置，各20个种子、每局10分钟，共80局/800模拟分钟。逐步检查位置不重叠、地图边界、HP/能量范围、击杀计数与事件容量；全部通过。真人位在模拟中不提交动作，不能视为真人体验测试。四组动作数1400/9571/14919/17938，击杀1340/503/833/796。
- 实际60秒6Bot服务器运行通过：486次快照，模拟时钟59950ms，99次动作，3次击杀；GC后堆约14.8→15.1MB，RSS约88→91MB；10秒窗口CPU约15～156ms，事件循环延迟最大约33.3ms。未观察到卡死或明显资源增长；一分钟不能证明长期无内存泄漏。
- 最新生产构建在0.0.0.0:5180运行，/health成功。既有5173服务未停止、未替换，公网隧道未改动。

## 修改文件

新增：src/realtime/config.ts、engine.ts、bots.ts、engine.test.ts、skills.test.ts、interactions.test.ts；src/server/realtime.ts；src/web/RealtimeApp.tsx、realtime.css；vitest.config.ts；scripts/realtime-network.mjs、realtime-browser.mjs、realtime-simulate.ts、realtime-soak.mjs、realtime-soak-server.ts。

修改：src/server/index.ts（安装独立namespace）；src/web/main.tsx（模式入口）；package.json（测试命令）；README.md、GAME_RULES.md、TODO.md、RULE_DECISIONS.md、TEST_REPORT.md、KNOWN_ISSUES.md。生成：dist、realtime-review测试证据。本次没有重新打包发行ZIP。

## 复现与证据

npm run typecheck；npm test；npm run build；npm run test:realtime:network；npm run test:realtime:browser；npm run simulate:realtime；node scripts/realtime-soak.mjs；npm run test:mobile。

机器结果：realtime-review/browser.json、simulation.json、soak.json。截图：lobby-mobile.png、battle-390x844.png、battle-844x390.png、battle-desktop.png等。failure-0.png是开发期间已修复问题的历史诊断截图，并非最终验收截图。

未验证：Android/iPhone真机、Safari/Edge、新实时模式的公网双物理设备联机、手机系统后台冻结/网络切换、长时间生产内存稳定性。以上本机浏览器与Socket测试不替代这些验收。

---

## 移动端适配验收（2026-10-11，最新）

修改范围仅前端交互、布局、测试及说明。src/core、src/server、联机协议、卡牌库、地图、Windows启动器和SakuraFrp均未修改；本次不重新生成ZIP。生产网页输出在dist/web，现有便携包不会自动更新。

实际通过：
- TypeScript类型检查、Vite生产构建、服务端现有代码编译全部通过。受限沙箱Vite realpath曾返回EPERM，在正常本机权限下构建成功。
- Vitest：15个文件、69项通过（原有67项全部保留，新增2项相机缩放/平移边界测试）。
- Playwright使用本机Chrome，两个隔离BrowserContext（手机触摸、桌面）连接同一个本机生产网页服务；额外的测试房主Socket只负责使用既有开发调试接口设置站位与资源。
- 9个移动/平板视口均通过整体横向溢出检查，棋盘复位完整显示；900px及以下还检查底栏不遮棋盘、结束回合在可视区域、4+1卡池和不可抽预览牌。尺寸：320×568、360×800、375×812、390×844、412×915、667×375、844×390、768×1024、1024×768。
- 390×844完整链路：真实CDP触摸拖动与双指缩放不提交行动；放大后平移有效；变换后点击坐标正确；恢复视角；非房主移动、看卡牌详情、抽牌、选牌、选择目标后确认肘击、结束回合；盲盒领取、商店购买、排行榜、规则、结束投票及双端结算。仅肘击卡池没有产生虚假反应选项。
- 断线测试真实关闭手机WebSocket并确认服务端玩家离线、前端结束按钮禁用，然后恢复连接及刷新；玩家ID保持、版本不增加，未重放操作。另验证手机创建房间并作为房主开始双人比赛。
- 浏览器返回关闭面板、横竖屏切换、桌面1440×1000无整体横向溢出，未捕获JavaScript运行时错误。实际检查了竖屏、横屏、320px卡牌面板、商店和桌面截图；初版发现的底栏遮棋盘和跨局残留面板已修复并重新验证。
- 现有联机脚本通过：smoke（2人36个人回合含重连和重复请求）、multiplayer（2～6人完整对局、重开）、turn-system（41.5秒无限时ACTION、无限时REACTION、非房主、重连与权限）、nickname-regression（6人昵称/序号/重开）、debug-smoke（开发房主权限/生产禁用）。
- end-vote首次3人随机局失败：测试先移动踩到盲盒，手牌变满，却要求随后抽牌成功。修正测试前提为初始手牌有空位时先抽，再移动，遇满手牌盲盒明确放弃；保持全部投票和权限断言。修正后2/3/4人全部通过，使用本机真实局域网IP访问；这不是第二台物理设备的测试。

复现：npm run build；npm test；npm run test:mobile。测试脚本scripts/mobile-check.mjs使用5198临时端口；现有联机脚本分别使用其原有测试端口。截图及机器可读结果在mobile-review/results.json。

本次文件：src/web/main.tsx、Board.tsx、CardTile.tsx、mobile.css、useBoardViewport.ts、board-viewport.test.ts、style.css（尾部空白整理）、index.html、package.json、package-lock.json、scripts/mobile-check.mjs、scripts/end-vote.mjs、README.md、TEST_REPORT.md、KNOWN_ISSUES.md，以及dist生产构建与mobile-review截图。

验收限制：未使用真实Android/iPhone设备，未运行Safari/WebKit，未测试真实软键盘、浏览器伸缩地址栏、iOS安全区硬件、系统后台冻结与蜂窝/Wi-Fi切换，也未重新进行公网双设备对局。未运行ZIP/启动器打包测试，本次没有修改这些部分。横屏默认棋盘较小，精确操作使用放大与平移；320px卡牌面板内部需要滚动才能看完4+1，不会横向撑开整页。现有依赖安装时npm audit报告6项问题，本次未执行改变依赖行为的自动修复。
# 肘击大乱斗 · Elbow Mayhem 验证记录（2026-10-11）

## Windows 图形启动器与 SakuraFrp 集成（本次）

- 构建了 WinForms x64 `肘击大乱斗启动器.exe`，与自带 Node.js 运行时、生产网页和 Socket.IO 服务装入 `ElbowMayhem-Windows-x64-GUI-v0.2.0.zip`。当前构建机有 .NET Framework 4.8 编译器和运行时、无 .NET SDK；启动器依赖 Windows .NET Framework 4.x，尚未在干净 Windows 10/11 主机测试。游戏规则和网页未改。
- 从便携 ZIP 解压到新的中文、含空格目录并实际打开 EXE：WinForms 窗口、端口列表、端口与隧道目标不匹配警告、自动匹配现有隧道 5173 端口、生产服务器启动、网页、`/health` 与 Socket.IO 轮询健康检查、实际局域网地址显示均成功。点击停止后 5173 端口释放。已检验服务端启动日志以 UTF-8 正确显示。
- 本机检测到现有 SakuraFrp Launcher 与一条 TCP 隧道（ID 29485289，目标 127.0.0.1:5173，节点域名 `frp-few.com`，远程端口 20551）。启动器经官方只读 API 读取现有隧道和节点，不向日志或 ZIP 写入访问密钥。尝试按官方 frpc 环境变量启动时，本机随 Launcher 安装的 `frpc.exe` 明确输出“仅允许 SakuraFrp Service 启动”，并立即退出；因此最终版禁用隧道启停与自动启停，提示在原客户端操作。此限制是实际测试所得，不宣称自动启动成功。
- 在原 SakuraFrp 客户端中启动唯一现有隧道后，官方 API 报在线；经 `http://frp-few.com:20551/health` 实际收到 HTTP 200。最终 GUI 刷新后显示在线，且公网网页、`/health`、Socket.IO 轮询验证通过。独立 WebSocket transport 连接公网地址成功。
- 通过便携服务器的本机地址，`portable-smoke.mjs` 的 2/3/4 人完整对局全部通过，个人回合数分别 36/39/40，含非房主移动、抽牌、主动出牌、终局、重开。再通过现有 SakuraFrp 公网地址运行同一脚本，2/3/4 人亦全部通过；此为同一台电脑发起的独立 Socket.IO 客户端，经公网节点转发，**不是**两台物理设备或同学手机的实测。
- `npm test -- --reporter=dot`：14 文件 67 项通过。`npm run build:portable` 成功，包含 TypeScript 类型检查、Vite 生产构建和服务端打包。首次在受限沙箱内运行测试/构建遭 `realpath EPERM`，随后以非沙箱执行通过。WinForms `csc.exe` 编译通过。
- 最终 GUI 包再次解压到 `D:\game\release\最终 GUI 中文 空格\肘击大乱斗` 后打开 EXE：在隧道离线操作不可用的当前客户端上，启停与自动启停确实被禁用；原客户端启动隧道后，刷新可显示在线并确认公网网页与 Socket.IO。复制公网地址按钮写入了该地址，窗口日志确认复制成功。
- GUI 逐项验证：自定义 5180 端口 `/health` 返回 HTTP 200；重启 5173 成功；停止后端口释放；第二个 GUI 窗口对被占用的 5173 启动被拒，并显示占用的 `GameServer` PID；精确校验空房间服务进程路径后模拟异常退出，GUI 显示退出码 -1 且窗口未崩溃，随后可再次启动到 5173。最终测试服务器在 5173 端口运行。
- 最终交付 [ElbowMayhem-Windows-x64-GUI-v0.2.0.zip](./release/ElbowMayhem-Windows-x64-GUI-v0.2.0.zip)，35,361,993 字节，SHA-256 `331C696212038A0757E168A65B59456D509093D4B88D7002940FAB81FC167279`。包内 EXE 与 `release/肘击大乱斗/肘击大乱斗启动器.exe` 哈希一致。
- 尚未验证：干净 Windows 10/11 无开发工具环境、实际另一台设备、手机浏览器、不同网络下的长期稳定性、HTTP/HTTPS 类型隧道、系统防火墙允许后的局域网访问。另已在独立测试副本移除 `config.json`，但测试窗口的桌面焦点被外部输入打断，未得到 GUI 错误截图；源码有缺文件检查，此项仍记为未实测。启动器没有更改系统防火墙或其他现有隧道。

以下“本次四项定向修改”是此前游戏更名与规则定向修改的历史记录；其中“未重新打包”只描述当时状态。

## 本次四项定向修改

- 名称：大厅、游戏顶栏、浏览器标题、结果标题、规则说明与当前文档使用《肘击大乱斗》/ Elbow Mayhem。后续便携包命名脚本改为 `ElbowMayhem`，本次按要求不重新打包；既有发行 ZIP 是历史旧版。
- 地图弹簧：六个固定坐标及两格距离保持。以棋盘 `xy` 投影验证每个方向比原朝中心方向在屏幕上顺时针偏转 60°；显示箭头的旋转与实际轴方向对应。规则测试验证了触发、连锁推挤和出界。
- 卡牌：正式来源集中使用 `ACTIVE_CARD_IDS = ['laoda_elbow']`，覆盖初始牌、公共四张与预览、盲盒及商店；旧 24 项实现和独立图标留存供未来设计，正式图鉴只显示牢大肘击。新增肘击出界得分断言；检查发现原 `punch` 的代码没有给出界击杀加分，本次按明确要求在肘击及保留的原拳头路径补上每名有效出界目标 +2 分，其余旧卡结算不变。
- 昵称与人数：服务端分配“神秘牢大X”，拒绝重名，离房复用最小可用加入序号，重连和重开保留；配置扩到 2～6 人，5/6 人默认 10 轮，房主可设置 1～99 轮。既有 2/3/4 人默认轮数不变。
- `npm run typecheck` 通过；`npm test`：14 文件 67 项全部通过（原 58 项及新增/扩展，含浏览器标题、大厅与文档名称检查）。首次新增弹簧连锁测试把 `(3,-2)` 误判为出界，按轴坐标边界修正站位后全通过。
- `npm run build` 通过，产出 `dist/web` 与 `dist/server/index.js`。`node scripts/multiplayer.mjs` 使用独立 Socket.IO 会话完成 2/3/4/5/6 人整局、公共池、重复抽牌、重连及重开；对应个人回合数分别为 36/39/40/50/60。`node scripts/nickname-regression.mjs` 完成六默认昵称、重名拒绝、离房复用、令牌重连、房主自定义轮数、完整两轮结算及重开。均为同机多客户端，不是异机或公网实测。
- `npm run simulate -- 100`：100/100 局完成，6684 次动作、255 次牢大肘击出牌、441 次抽牌、68 次盲盒、175 次购买、11 次出界，无失败种子。这是机器人批量模拟，不是平衡性或真人时长证明。
- `node scripts/turn-system.mjs` 再次通过：无限时行动静置 41.5 秒不推进，非房主在房主离线时移动、抽牌、结束回合，非当前玩家被拒；开发回归场景中的非房主出牌、无限时反应等待、重连后反应和房主可选限时均通过。旧卡牌效果仅通过开发回归场景注入，不属于正式随机卡池。
- 尚未执行：本次新界面在真人手机上的视觉与触控验收、新发行 ZIP 打包与其解压运行测试、异机公网测试。

以下是此前版本的历史记录；其中旧版 ZIP、旧卡牌图鉴和既有测试数量不代表本次正式发行状态。

## v0.2.0 远程操作与结束本局增量（2026-10-11）

- 根因定位：旧版浏览器在每次操作前同步调用 `crypto.randomUUID()` 生成请求 ID。非 HTTPS 的局域网/IP 网页不属于可信上下文，该 API 可能不存在，操作因此在 Socket.IO 发出前抛错；`localhost` 环境不复现。新版改用可回退的请求 ID，并为操作设置 8 秒 ACK、错误代码和可见原因。实际浏览器通过 `http://192.168.1.106:5173/?debug=1` 抽牌成功，诊断面板显示非 UUID 回退格式的请求 ID、同源服务器地址、正确玩家 ID 和成功 ACK；控制台无错误。此 IP 仅为本次机器实测值。
- `npm run typecheck` 通过；`npm test`：12文件58项全部通过（原有规则测试和新增请求 ID、提前结束测试）；`npm run build:portable` 通过，并生成 Windows x64 v0.2.0 ZIP。沙箱内初次 `npm test` 和 `npm run build` 被 Windows `realpath EPERM` 阻挡，未执行测试/构建；经受限沙箱外重试通过。最终 UI 微调后再次类型检查与重新打包。
- `node scripts/end-vote.mjs` 经实际网卡地址 `192.168.1.106` 连接本机服务器，2/3/4 人会话全部通过：非当前行动者被拒并收到原因，当前行动者移动、抽牌、结束回合，任意人发起与取消、投票期间继续行动、拒绝后继续、离线票权保留、全票提前结束且不额外计分、最终同意请求重复 ACK、终局拒绝行动、重开、房主关闭后全部座位收到事件。此测试未跨物理机器。
- `node scripts/multiplayer.mjs` 的 2/3/4 人完整对局通过；`node scripts/turn-system.mjs` 静置 41.5 秒行动不自动推进，反应阶段静置 6.2 秒后仍可反应，非房主出牌和断线重连反应通过。
- 另将 `turn-system.mjs` 的访客连接改走实际局域网 IP、房主连接走回环地址（开发调试补丁只允许回环房主），通过非房主移动、抽牌、出牌、断线重连后使用反应卡及无限时反应等待。局域网路径仍为同机测试。
- 从 ZIP 解压到新的 `D:\game\release\验收 新版 中文 空格\BadFriendsArena`，从 `D:\game` 工作目录启动包内 `GameServer.exe`：网页、`/health` 均 HTTP 200；首页和 `/version.json` 均返回 `Cache-Control: no-store, must-revalidate`。对解压包运行 `node scripts/portable-smoke.mjs`，2/3/4 人分别完成36/39/40个个人回合，非房主移动、抽牌、出牌、终局和重开均通过。操作日志有请求 ID、玩家 ID、ACK/拒绝代码，无身份令牌字段。验收用 3000 端口服务器随后通过本机停止控制优雅停止。
- 两个应用内浏览器来源（局域网 IP 和 localhost）实测建房、加入、准备、开局、局域网网页抽牌、回合同步、非当前玩家发起投票、全票结束结果，以及房主二次确认关闭后两端返回大厅。两个会话共用一台物理电脑，不能当作同学电脑、手机或公网验证。未验证真实公网地址、手机浏览器触控、不同电脑、无 Node.js 的干净 Windows 主机。
- 最终 ZIP 为 [BadFriendsArena-Windows-x64-v0.2.0.zip](./release/BadFriendsArena-Windows-x64-v0.2.0.zip)，35,335,941 字节，SHA-256 `4f6c2f983b2ac8e7d3ba4b8ff3ff9a06e1458d8b1025712122ec52126328ac42`。最终修正后重新运行 `npm test`，12文件58项再次全通过；最终 ZIP 再次解压到独立中文空格路径，包内 `GameServer.exe` 启动、2/3/4 人完整对局及非房主出牌均通过，验收服务器安全停止。最新生产服务继续在 `http://localhost:5173` 监听，`/health` 返回 HTTP 200。

本次在 Windows、Node.js 24.19.0、`D:\game` 实际运行。项目规格 [CODEX_PROMPT.md](./CODEX_PROMPT.md) v3.1 已完整读取，桌面附件与项目内副本的 SHA-256 一致。

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过，TypeScript 无错误。 |
| `npm test` | 8 个文件、42 项测试全部通过。覆盖公共 4+1、手牌/主动额度、地图与计分、空气炮六方向与边界、多目标反应、推挤/机关、资源、特殊牌、定时效果及调试补丁等。并非每张卡都已有独立的合法、非法、边界三组测试。 |
| `npm run build` | 通过；Vite 网页与 esbuild 服务端产物写入 `dist/`。 |
| `npm run simulate -- 1000` | 1000/1000 局结束：2人333、3人334、4人333；104321 次动作、11176 次抽牌、718 次盲盒、1863 次购买、2155 次反应、57 次出界、56 次控制保护；失败种子为空。记录有卡牌使用、出生位和行动顺序结果；机器人策略不能作为平衡证明。 |
| `node scripts/multiplayer.mjs` | 独立 Socket.IO 会话分别完成 2人36、3人39、4人40 个个人回合；重复抽牌幂等、断线令牌重连、房主重新开局均通过。 |
| `node scripts/debug-smoke.mjs` | 开发环境：房主可导出及应用场景，访客被拒，过期版本被拒；生产环境：调试接口被拒；公开状态均未暴露种子与随机流。 |
| 浏览器手动操作 | 在应用内浏览器创建房间，由另一个独立 Node Socket 会话加入；在网页点击公共牌，确认原预览牌补入被抽位置，另三格不变；点击相邻格后 AP 3→2，弹簧事件显示。仅一个浏览器上下文被人工操作。 |

首次在受限沙箱中运行 `npm test` 和 `npm run build` 时，Windows 对依赖/入口文件的 `realpath` 返回 `EPERM`，测试未执行且构建失败。随后对这两项各做一次沙箱外重试，均通过。调试联机脚本首次因把需要四人房间的场景放入两人测试而失败；改用合法两人场景后，开发与生产权限检查均通过。

未执行：完整双浏览器真人对局、手机触控实机、两台物理设备公网联机、真人平均时长测量、Docker 镜像构建与 Compose 运行、实际公网部署。当前机器执行 `docker --version` 返回命令不存在。不能据本机独立 Socket 会话或单个浏览器操作推断上述项目已通过。

## UI/UX 重构增量检查

在原有42项规则测试之外，增加2项 SVG 视觉词汇测试，检查24个卡牌绘图互异、卡牌稀有度边框与10项地图图例。重构后类型检查、9文件44项测试和生产构建通过；2、3、4人独立 Socket.IO 会话整局测试再次通过。应用内浏览器实际检查了大厅、教学、桌面棋盘、商店、公共/个人卡牌、24卡图鉴及单卡完整效果。390×844 手机视口无整页横向溢出。详情与截图见 [UI_REVIEW.md](./UI_REVIEW.md)。

## 回合交互重构增量检查

- `npm run typecheck`、`npm test`（9文件44项）和 `npm run build` 最终均通过。
- `node scripts/multiplayer.mjs`：2人36回合、3人39回合、4人40回合均完成，确认默认无截止时间、每大轮发出 `ROUND_SUMMARY`、终局发出 `GAME_OVER`；断线后重发同一抽牌请求不会重复抽牌。
- `node scripts/turn-system.mjs`：实际静置 41.5 秒，普通回合版本和轮次均不变；非房主在房主断线后完成移动、抽牌和结束回合；非当前玩家普通行动被拒；非房主下一回合出空气炮；反应阶段静置 6.2 秒仍等待，反应后回到行动；非房主在反应阶段断线重连后能成功用护盾；房主可开局前选择限时，限时房间产生服务端截止时间。代码检查确认限时轮询器仅在至少一个限时对局进行时创建，默认无限时房间没有截止时间。
- 应用内浏览器中以 `localhost:5173` 与 `127.0.0.1:5173` 两个隔离存储来源建立独立座位：房主开房、非房主加入、准备、启动；非房主回合的移动令 AP 3→2、成功抽牌、卡牌额度锁定、主动结束回合，房主视角随即变成“轮到你了”；非房主刷新后仍恢复同一座位和 `ACTION` 阶段。两端浏览器控制台无错误。最终画面保存在 [turn-review](./turn-review)。这两个网页会话共享同一个应用内浏览器进程，尚不等同于两种浏览器或两台物理设备。
- 新增阶段广播测试中，第一次断言在终局过渡快照后立即检查 `GAME_OVER`，因下一状态异步到达而失败；改为等待所有会话接收终局阶段后，2/3/4人测试通过。首次长等待测试在跨大轮先手轮换处误以为必轮到房主，已改为按实际轮次推进；完整长等待测试随后通过。

## 新玩家引导与回合顺序复核

- 阅读 `src/core/game.ts` 后确认：移动只检查可用 AP 和合法目标，不依赖抽牌或出牌；结束回合不要求卡牌操作；抽牌和主动出牌共用一次 `cardAction` 额度。因此本次未修改规则引擎。
- 新增6项规则测试，实际通过：空手牌移动、不抽牌直接结束、移动后抽牌、抽牌后移动、出牌后移动、第二次卡牌操作被拒。另新增5项展示测试，检查空手牌/满手牌/已操作提示，以及2/3/4人分别显示18/13/10轮和全部区域分值。
- `npm run typecheck` 通过；`npm test` 在非沙箱重试后11文件55项全部通过；`npm run build` 通过。首次受限沙箱的全量测试因 Windows 对 `node_modules/vitest/dist/spy.js` 的 `realpath` 返回 `EPERM`，测试未启动，该失败不计为规则测试失败。
- 应用内浏览器实际打开本地游戏，查看教学第1步和第8步，并以两个独立网页会话建立2人房间开局。比赛页面可见“占据中心区域，累计积分最高者获胜！”、四档区域积分、本局18大轮、当前玩家3 AP、移动/卡牌顺序与主动结束提示。画面保存在 [new-player-guidance.jpg](./turn-review/new-player-guidance.jpg)。此处只做界面与开局检查；六种回合操作顺序由自动化规则测试验证，未做本轮双人完整手动对局。

## Windows x64 便携包验收

- `npm run build:portable` 成功生成 [BadFriendsArena-Windows-x64.zip](./release/BadFriendsArena-Windows-x64.zip)。最终文件 35,330,699 字节，SHA-256 为 `088f5688845d05c91a252ed42ebab7b00500a13a621fdbfaf5c321aff50e33fa`。包含 Windows x64 自带运行时、独立打包的 2.0 MB 服务端脚本、生产网页、启动/停止脚本、配置及许可证；不包含 `node_modules`。
- 从最终 ZIP 解压到 `D:\game\release\最终验收 中文 空格\BadFriendsArena`，以 `D:\game` 为工作目录启动包内 `GameServer.exe launcher.cjs`；`http://127.0.0.1:3000/health` 为正常 JSON，网页返回 HTTP 200。启动日志从实际网络接口列出 `192.168.1.106:3000`（仅本次机器与时间有效）。另实际运行 `start.bat`，窗口持续运行并显示本机及局域网地址；`stop.bat` 安全停止，3000 端口退出，用户指定的 5173 服务仍正常。
- 对最终解压服务器运行 `node scripts/portable-smoke.mjs`，独立 Socket.IO 客户端完成2人36、3人39、4人40个个人回合；验证非房主移动、抽牌、主动出牌、终局和重新开局。原有 `node scripts/multiplayer.mjs` 再次完成2/3/4人整局、重复抽牌与断线重连；`npm test` 11文件55项全部通过，`npm run build:portable` 已包含类型检查和生产构建。
- 在解压副本中模拟缺失 `config.json` 与端口 5173 已占用，分别得到明确错误和退出码1；临时设 `maxRooms=1` 后第二个建房请求被拒，第81个十秒窗口内请求被限速。强制结束测试进程后能重新启动；异常退出会暂留控制记录，重新启动会覆盖。所有临时配置均恢复；测试用3000服务器已停止。
- 自动联机验收脚本的早期版本曾因随机起手牌无法立即出牌，以及只等待房主版本广播就发送访客后续动作而失败。已改为向对手移动、等待所有客户端收到权威版本，并在限速时等待后重试；最终包实际通过完整联机测试。随机发牌仍意味着某一局可能没有合适的非房主出牌机会，脚本会另开局验证该能力。
- 本次无法在无 Node.js 的干净 Windows 10/11 虚拟机、Linux x64、macOS x64/arm64、两台物理设备或公网网络中测试。Node 安装在构建机上，但便携测试进程的可执行文件来自解压目录，服务端脚本不读取项目源码或 `node_modules`。本次没有实际公网部署。



实时补充验证：scripts/realtime-quick-smoke.mjs对保持运行的5180最新版执行快捷单人入口检查，正确创建1真人+3Bot；健康检查通过。该脚本亦为本次新增文件。





本次主要修改文件：src/realtime/{config,engine,bots}.ts；src/server/realtime.ts；src/web/{RealtimeApp,RealtimeDeckEditor}.tsx；src/web/realtime.css；src/realtime/{default-movement,cycle,hand-request}.test.ts；scripts/{realtime-browser,realtime-network,card-repair-browser}.mjs；README.md、GAME_RULES.md、TODO.md、TEST_REPORT.md。

最终构建下 test:cards:browser 通过：两独立浏览器、连续8次真实施法、4张重复治疗独立实例、伤害/治疗、低能量拒绝、刷新后手牌/队列一致。中途首次执行受重新构建的版本保护中断；最终固定构建重跑成功。证据：card-repair-review/browser.json。


最终复核：test:cards:browser完成连续8次真实施法、伤害与治疗、重复实例循环及刷新恢复；maps-touch还验证了手机编辑器点格。最终构建与124项测试通过，服务在5180后台运行。


卡牌稳定性补测：上述4种视口的跟随模式各连续切换8次，卡牌/HUD/地图矩阵/滚动坐标完全一致；Tab焦点样式确认为dashed，全部卡牌type=button且无form归属。
