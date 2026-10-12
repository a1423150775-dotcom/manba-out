# 2.1 移动输入与选卡状态修复

## 版本保护与范围

从可运行提交 `879b4ab` 创建分支 `input-2.1-single-step`。没有修改卡牌配置、战斗数值、地图、角色、Bot难度、房间席位、Windows启动器或SakuraFrp。

## 根因与实现

原棋盘 `tap` 在移动模式直接发送 `navigate: point`，相邻碰撞以外的每次点击都建立持续导航。选卡只有释放、切换或手动取消出口，没有独立超时。

- `MapClickIntent` 用260ms区分同格单击与双击。第二次同格点击清除单击计时器，仅发送一个持续导航意图。不同格覆盖未提交点击。选卡、Space、断线、死亡、拖动、双指手势和组件卸载清理待提交点击。技能瞄准不经过这个延迟。
- 新 `navigate: step` 在服务器复用现有Dijkstra路径，只执行第一格；不会创建 `navigation`。矿雷仍是高代价格而非墙，障碍/占格/高度限制沿用现有规则。相邻主动撞击仍走原有移动接口，保留既定5HP碰撞规则。
- 单击取消旧持续任务。若一格普通移动已经开始，保留该动作，只保存一个最多1500ms有效的待执行单步，在当前格结束时重新寻路、验证并执行一次。它不绘制持续目标，不会自动重复，不提前扣费。死亡、取消、新任务和断线清除它；执行失败在移动状态区域显示原因。
- 所有新客户端导航/Space请求携带单调 `navigationRevision`；服务端拒绝旧版本，原请求ID去重仍生效。断线/新连接绑定提升版本并丢弃旧目标，保留当前已经执行的动作和身份。
- `SelectionExpiry` 的5000ms参数集中在 `src/web/battleInput.ts`。只有明确选卡、切卡、快捷施法尝试、目标点击、弹道选择/取消及掩体方向调整会重新计时。Socket.IO和动画渲染不会续期。失效实例立即清除；旧请求ACK不会取消后来选择的另一张牌。
- 超时只清理本地选择、箭矢菜单和未提交瞄准；不发送战斗/取消请求，不影响导航、跟随、已提交缓冲、能量、手牌及已生成效果。Space仍独立调用服务端全部取消。
- 浏览器实测发现右键菜单被新的取消清理关闭，现已将瞄准清理与完整菜单清理分开。跟随菜单和5秒超时互不干扰。

## 修改文件

实现：`src/web/battleInput.ts`、`src/web/RealtimeApp.tsx`、`src/web/RealtimeBoard.tsx`、`src/realtime/navigation.ts`、`src/realtime/engine.ts`、`src/server/realtime.ts`。

测试：`src/web/battleInput.test.ts`、`src/realtime/movementInput.test.ts`、`scripts/movement-input-browser.mjs`、`scripts/movement-input-network.mjs`。现有 `controls21-browser.mjs`、`revision21-browser.mjs` 的自动寻路操作改为双击；`controls21-network.mjs` 的重连断言改为不恢复旧导航，保留去重与身份测试。

入口与文档：`package.json`、`README.md`、`GAME_RULES.md`、`TODO.md`、`TEST_REPORT.md`、`KNOWN_ISSUES.md`、本报告。

## 实际验证

- TypeScript检查和生产构建通过。
- 全量Vitest：34个文件263项通过，包含新增13项输入/移动测试及原有Legacy、实时战斗、导航、Bot、地图与席位测试。
- 新增Chrome实测：桌面1440×1000、触摸390×844。相邻/远格单击均只走一步；双击只发一次请求并连续走三格；Space能取消260ms窗口内尚未提交点击；QWER切换保持HUD与地图尺寸；5秒超时清除高亮且不发技能请求/过牌；超时后的Q重新选卡；弓箭目标点击续期并最终关闭菜单；2.5D跟随视角命中正确；新单击停止旧持续目标；跟随中超时不停止跟随；同键/双击快施；双指缩放不移动；无页面横向溢出或JS异常。
- 新增两个独立Socket.IO客户端：房主/普通玩家单步及状态同步、相同请求不重复执行、旧导航版本拒绝、取消后旧请求不能重启导航、重连身份与卡槽恢复但导航清除。
- 原有controls浏览器：QWER、缓冲、箭矢高抛、连续导航、手机长按跟随、真人+3个活动Bot边跟随边施法通过。controls联机回归通过。
- 原有revision浏览器/联机：箭矢远距离拒绝、近距离实际命中、5HP碰撞、Space、4卡槽、普通房间、出生点、6Bot观战及权限通过。
- Legacy移动端九尺寸回归通过，含CDP拖动/双指缩放、非房主移动与出牌、商店、结束投票、双客户端同步和重连。

测试命令：`npm test`、`npm run build`、`npm run test:movement-input:browser`、`npm run test:movement-input:network`、`npm run test:2.1:controls`、`npm run test:2.1:revision:browser`、`npm run test:2.1:revision:network`、`npm run test:mobile`。

首次受限执行Vitest遇到Windows依赖读取EPERM，获准正常权限后通过。首次新浏览器测试暴露跟随菜单清理问题，修复后完整重跑通过；旧联机测试原本要求恢复导航，与本次防止旧目标复活的规则冲突，修改断言后通过。没有删除原有测试来隐藏失败。

## 实际截图与证据

- [桌面弓箭瞄准](input21-review/desktop-aim.png)
- [触摸弓箭瞄准](input21-review/mobile-aim.png)
- [桌面移动状态](input21-review/desktop-movement.png)
- [触摸移动状态](input21-review/mobile-movement.png)
- [新增浏览器结果](input21-review/browser.json)
- [新增联机结果](input21-review/network.json)

## 验证边界

浏览器测试使用真实Chrome进程与本机生产服务器，移动端为视口/CDP触摸模拟。没有在真实Android/iPhone、iOS Safari或公网双设备上验证。单击固定等待260ms，是避免双击额外移动和扣费的取舍。服务重启不能恢复此前的内存房间；更新后需刷新并重新建房。本轮不打包发行ZIP。

额外运行 `npm run simulate:realtime`：80场合计800分钟加速模拟通过；6Bot组20场52312动作/1573击杀。耗时117.7秒；模拟中的真人席位为静止占位，不是浏览器真人输入。内存采样不等于无长期泄漏证明。
