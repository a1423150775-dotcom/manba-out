# Elbow Mayhem 2.1 开发交付

当前正式名称：肘击大乱斗（Elbow Mayhem）。开发分支 development-2.1；升级前可运行版本提交 720ac1b。Git恢复前请先保存2.1修改。Legacy回合制仍由 src/core 和默认首页提供；旧实时2.0引擎、配置、Bot及测试归档在 src/realtime/v20，仍参与 npm test，不打包进当前实时游戏。

## 启动与操作

本地服务：http://localhost:5180/?mode=realtime 。刷新旧页面；协议版本4会拒绝旧前端。单人测试 → 配置角色、8张卡 → 开始。9种正式技能全部开放且允许重复；4张手牌+4张队列。普通移动独立，1能量、1秒、50%切逻辑格。

Q/W/E/R使用对应当前手牌槽的双击速放入口；忽略输入焦点和按键重复。单击卡牌选目标；点格或人物立即施法。320ms内再次点击同一卡牌实例触发速放；慢速再次单击取消。ESC、右键或移动图标也取消。双击不重复提交，等待ACK期间不发送第二个请求。地雷、掩体、闪现没有危险的随机速放，需要手动选格；掩体可选择方向，弓箭可选高/低弹道。所有拒绝均显示原因。

## 九张正式卡

|卡牌|能量|前摇|范围/执行|效果|
|---|---:|---:|---|---|
|牢大肘击|2|0.3s|相邻1格|20伤害，推2格，晕1s；障碍受20伤害|
|大运|3|0.6s|沿六方向3格，执行0.9s|每个撞击玩家一次10伤害/晕0.5s；带动前方玩家；结束固定顺时针60°甩1格；每墙10伤害|
|火球|4|2s|最远4格，飞行0.5s|中心40/周围30，伤害自己、玩家和障碍；独立飞行|
|闪现|2|0.5s|1～3格|忽略路径，仅验证锁定落点；服务器瞬移|
|速凝掩体|2|0.5s|中心1～2格，沿所选轴三连格|各10HP，高1；每秒损耗2HP，无外伤5秒消失；三格全部合法才生成|
|地雷|3|0.5s|1～2格|10HP，高0.1，每秒-2HP；踩踏或归零爆炸50/10，可连锁|
|钩锁|3|0.5s|1～3格|5伤害/晕1s，无阻挡时0.4s拉至面前；不重叠|
|平A|1|0.3s|相邻1格|20伤害，可打障碍，无控制|
|弓箭|2|0.7s|由解析弹道决定|30伤害，碰到首个有效物体即消失；忽略地雷|

普通移动不是第10张技能卡，不能装备。旧配置仅替换退役项：冲刺→大运、治疗→地雷、重击→平A、范围肘击→火球、放置弹簧→掩体；普通移动按默认同位置替换，其余合法选择保留，本机保留迁移前配置。

## 状态机与并行

Fighter.action仅是主动前摇；movement是普通移动/冲锋；forced是钩锁等强制位移；projectiles、objects、visuals是独立集合。前摇到期先清除action再结算/创建效果，立刻允许下一前摇。最多一个主动位移，位移过程中允许不冲突的攻击前摇；已有位移时拒绝移动/冲锋/闪现。被大运顶撞时不能自行开始主动位移，冲锋结束或中断后解除。

击晕/强制推挤打断当前前摇和主动位移，不删除已发射投射物、已放置墙体或地雷。落空、打断不退款或回牌。卡牌在成功启动时循环一次；服务端按请求ID缓存ACK、校验槽位与实例ID。50ms固定模拟步，不新增统一CD。相同时刻以服务端动作序号稳定排序，不使用客户端时间。

## 高度、碰撞、弹道

地图version:1保持向后兼容。floors坐标支持height或elevation；缺省0，支持0.5楼梯，兼容原有0～4高度。-1或hasFloor:false规范化为缺失地板。未知字段、重复坐标、非法高度与越界均拒绝，校验不修改输入。编辑器新增高度工具，可导入/导出。

普通移动/冲锋采用对称0.5高度差限制；强制击退向上超过0.5阻挡，向下可落到现有地板，不增加坠落伤害；进入空洞或边界外死亡。闪现忽略路径，仅检查终点。玩家碰撞体中心采用服务器逻辑格，视觉位置平滑插值，移动在50%切换逻辑格。

世界平面坐标x=q+r/2，y=√3r/2，相邻格心距离1。玩家使用半径0.28、高1的圆柱；石头和墙使用整格六棱柱、高1；地雷高0.1且不阻挡移动/弓箭。钩锁用同一空间层的直线连续碰撞检查，地形、墙体和玩家可阻挡。

弓箭发射高度为地面+0.7，g=9.8，初速v=3.5/√(1.4/g)≈9.2601。平地水平发射落地水平距离3.5。采用标准重力解析方程和高低抛射角解，手动目标瞄准地面+0.5。前摇开始锁定方向和速度，发射原点取释放时角色格心，不追踪目标。真实碰撞对水平进入/离开时间区间与竖直二次曲线高度区间求交，非只检查离散点；取整个Tick内最早碰撞。最大选格范围16等于支持地图的最大直径，不额外设高地射程奖励；实际可达性由弹道决定。

火球目标格锁定，独立飞行后范围伤害；爆炸移除地雷实例后再传播连锁，每雷最多爆炸一次。伤害归所属投射物/地雷的owner；死亡不会清除已发效果。石头100HP、掩体10HP，摧毁不移除地板，不自动重建。石头/墙损伤裂纹和破碎、雷HP条、钩锁链、箭矢和火球均读取服务器状态。

## 已说明的参数调整与临时值

2.0原为每3秒1能量；2.1改为每秒连续1.1，最大10、初始5、复活5。能量按Tick累加并固定6位小数。原角色HP100/140/75保留；为严格执行附件的20伤害/2格击退/1秒普通移动，停用2.0的肘击加伤、击退抗性与速度加成；不再暗中改卡牌参数。

击杀+2，其他近5秒参与伤害或击退的玩家助攻+1，排除本人；自杀不加分。实时模式移除中心持续积分；Legacy不变。原地图补给与商店机制保留。

集中配置src/realtime/config.ts：冲锋甩飞方向固定顺时针60°（方向+5 mod6）；地雷前摇0.5s/距离2，火球飞行0.5s，拉拽0.4s，平A前摇0.3s，助攻窗口5s，碰撞半径0.28，箭矢最多存活5s，物体/投射物各128上限。满额会拒绝新放置或发射。以上未定项采用此可复现原型默认值。

## Bot与网络

Bot使用与真人相同的useHandCard和requestMovement；只能选择当前4张手牌。九卡均有启动回归；寻路考虑高度、障碍、边界、机关和地雷。简单/普通/困难保留决策频率差异，部分Bot默认卡组带平A，其他Bot带钩锁。Bot不读取对手私有卡组作决策。

保留Socket.IO同源连接、身份恢复与请求去重。发现原席位展开可能将token带入角色广播，已改为显式白名单字段构建Fighter，并测试广播不含token。断线后恢复整个权威状态，包括手牌、前摇、位移、投射物和障碍HP。没有修改Windows GUI或SakuraFrp接口；本次不制作发行ZIP。

## 实际验证与限制

详细结果见TEST_REPORT.md，实际截图与JSON位于combat21-review。209项自动化测试通过（包含保留的2.0归档和Legacy）；2.1专用70项。不是将过时数值测试删除，旧规则在v20继续运行，新规则有单独断言。

Chrome真实浏览器的桌面/触摸模拟、独立第二客户端和生产Socket.IO完成验证；不是两台真实设备的公网测试。未验证Android真机、iOS Safari或本轮SakuraFrp外网链路。SVG为轻量示意，不提供完整3D物理渲染/材质；近距离多人昵称仍可能较拥挤，可用跟随放大。压力模拟为加速逻辑运行，不代表长时间实际网络负载或内存泄漏认证。旧2.0专用浏览器脚本保留为历史流程（旧卡牌参数已经退役），2.1请用新增命令。

## 文件与复现命令

主要修改：src/realtime/{config,engine,bots,maps}.ts；src/server/realtime.ts；src/web/{RealtimeApp,RealtimeBoard,RealtimeDeckEditor,MapEditor}.tsx。新增space.ts、3份2.1规则测试、BattleEffects.tsx、RealtimeArt.tsx、4个combat21浏览器/网络脚本；归档v20；更新package.json及文档。

npm run typecheck
npm test
npm run test:2.1
npm run build
npm run test:2.1:network
npm run test:2.1:browser
node scripts/combat21-editor-browser.mjs
npm run test:mobile
npm run simulate:realtime
npm run simulate:maps

## 本轮体验修复文件清单

- `src/realtime/config.ts`
- `src/realtime/engine.ts`
- `src/realtime/bots.ts`
- `src/realtime/maps.ts`
- `src/realtime/combat21.test.ts`
- `src/realtime/regression21.test.ts`
- `src/realtime/experience21.test.ts`
- `src/web/RealtimeApp.tsx`
- `src/web/RealtimeBoard.tsx`
- `src/web/BattleEffects.tsx`
- `src/web/SpringModels.tsx`
- `src/web/MapEditor.tsx`
- `src/web/realtime.css`
- `src/web/boardProjection.test.ts`
- `maps/classic.json`
- `scripts/combat21-nine-browser.mjs`
- `scripts/realtime-simulate.ts`
- `scripts/experience21-browser.mjs`
- `package.json`
- `README.md`
- `GAME_RULES.md`
- `TODO.md`
- `TEST_REPORT.md`
- `RELEASE_2_1.md`

新增验证入口：npm run test:2.1:experience。掩体原本每单元就是10HP，本轮补全自然衰减；火球与地雷的范围对象伤害未复现缺陷，保留原伤害接口并添加实际浏览器回归。
