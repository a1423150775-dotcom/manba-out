# 速凝掩体部署修复报告

日期：2026-10-12。保护分支：`fix-cover-partial-deployment`；修改前版本：`08ae5c3`。

## 根因

1. `src/realtime/engine.ts` 的 cover resolve 使用 `cells.every(...)`：任一玩家、石头、墙体、地雷、弹簧或缺失地板都会让三格全部失败。这与本次要求的部分部署相反。
2. `src/web/RealtimeBoard.tsx` 原先点击中间格就发送请求，方向来自 HUD 六方向下拉框（默认0），没有第三步轴向选择。玩家难以判断预定三格，某些轴向还会包含自己。
3. resolve 再检查施法者当前距离，移动施法可能让已经锁定的部署位置额外失效。现在选择范围在启动时验证；中间格和方向保存在服务端动作中，结算只检查锁定格子。
4. 失败反馈原来只有泛化的“落空：目标或生效条件已变化”；现在零格时显示“部署失败：没有可放置的格子”，部分成功显示数量及跳过原因。
5. 新交互实际触摸验证发现：pointerup 弹出菜单后，兼容 click 可能误点刚出现的方向按钮。方向按钮现在要求独立 pointerdown（键盘 Enter 仍可用），保证手机也是三次选择。

## 交互与坐标

选择掩体 → 点击距自身1～2格的中间地板 → 点击 A/B/C 轴向。第三次点击直接提交，无确认按钮。QWER第二次/双击掩体不随机生成，提示完成中间格和方向选择。Space、ESC、取消按钮及5秒选卡超时清理未提交选择；菜单上的主动方向操作更新超时。

三个格子为 `center+d, center, center-d`：

|轴向|d|反向|
|---|---|---|
|A| (1,0) | (-1,0) |
|B| (1,-1) | (-1,1) |
|C| (0,-1) | (0,1) |

服务端保留0～5旧方向参数兼容，但相反方向表示同一轴向。客户端只提供三个轴向，图标使用当前投影后的向量绘制，不硬编码屏幕左右。预览逐格绿/红，菜单显示每轴当前可用格数；预览只是提示，结算仍以服务器为准。

## 权威部署、生命与伤害

启动沿用身份、卡槽实例、动作、能量、距离及方向验证。成功启动一次扣2能量、循环一次；0.5秒后逐格检查并创建独立ID对象。已经开始后零格也不退款。多次同时部署顺序处理，后一个动作看见前一个已创建的墙，不能重叠。

每格10HP、按服务端经过时间每秒损耗2HP、生成5秒后消失；受攻击可提前消失。原有独立伤害、破碎效果及障碍列表清理保留。火球和地雷原有伤害函数已经遍历范围内所有对象，本次未发现遗漏墙体的实现，因此没有修改伤害数值或爆炸规则。

地雷和弹簧沿用现有不可与掩体共存规则，跳过该格且不删除原对象。苹果、普通标记和非实体预警不阻挡部署，也不会被删除。地形高度沿用现有逐格附着规则，不新增跨格高度限制。

## 实际测试

- `npm test`：36个文件，293项通过（新增20项掩体回归；保留并更新两项旧的全有或全无断言）。含Legacy、六Bot模拟、弹道、移动与伤害回归。
- `npm run build`：TypeScript检查、Vite前端和服务端打包通过。
- `npm run test:cover:browser`：真实Chrome，1440×1000桌面和390×844触摸仿真；通过WebSocket读取真实服务器快照，没有注入位置/HP或伪造墙体。
- A：三格空闲生成3格；B：Bot占中间格生成两侧2格；C：石头挡一侧生成2格；D：两侧无地板只生成1格；E：三格阻挡生成0格并提示失败。
- F：真实火球飞行后炸毁3格；G：地雷保持在中间格，掩体仅生成两侧，随后真实地雷爆炸摧毁两侧；H：大运连续撞碎3格并到达第3格；I：手机部署、等自然消失后实际走入原墙格。
- QWER选卡、第二次按键保留必要选择、Space/ESC取消、5秒超时、方向操作重置超时、2D/2.5D全图/跟随菜单定位通过；恢复Bot运行后确认权威行动继续。
- `npm run test:cover:network`：独立Socket.IO客户端同时施法、重复请求、非房主、重连、墙体消失同步通过。
- `node scripts/combat21-nine-browser.mjs`：9张现有卡牌真实点击/前摇/效果/卡槽循环回归通过。

原始结果：`cover-review/browser.json`、`cover-review/network.json`。截图：`full-preview.png`、`full-result.png`、`bot-preview.png`、`bot-result.png`、`stone-result.png`、`edge-result.png`、`blocked-result.png`、`mobile-2.5d.png`、`follow-2D.png`、`follow-2.5D.png`，均位于 `cover-review/`。

## 修改文件

- `src/realtime/cover.ts`：共享三轴格子计算与逐格阻挡原因。
- `src/realtime/engine.ts`：部分部署、锁定落点结算、结果原因、对象上限按实际单元处理。
- `src/realtime/config.ts`：掩体描述同步，无参数改动。
- `src/realtime/bots.ts`：掩体选择允许部分可用格，仍走同一手牌接口。
- `src/web/RealtimeBoard.tsx`：中间格/轴向菜单、逐格预览、触摸防穿透。
- `src/web/RealtimeApp.tsx`：取消旧方向下拉框、掩体快捷操作提示、真实结果反馈。
- `src/web/BattleEffects.tsx`：前摇预警逐格标出当前阻挡。
- `src/web/realtime.css`：方向菜单与不影响HUD布局的部署反馈。
- `src/realtime/cover.test.ts`、`combat21.test.ts`、`input21.test.ts`：新回归及旧断言适配。
- `scripts/cover-browser.mjs`、`scripts/cover-network.mjs`：可复现实际测试。
- `scripts/combat21-nine-browser.mjs`、`scripts/experience21-browser.mjs`：现有掩体浏览器操作适配。
- `package.json`：增加掩体测试命令。
- 本报告、`README.md`、`TEST_REPORT.md`及测试截图/结果。

## 限制与未验证

未进行真实Android/iPhone设备或跨公网双设备复测；触摸结果来自Chrome设备仿真，不代表Safari实机验证。原有手机“排行/信息”浮层仍可能覆盖少量地图区域，可拖动/缩放移开后操作，本次未改无关HUD。未改Windows启动器、SakuraFrp、其他卡牌数值、地图布局、角色或房间机制；未打发行ZIP。
