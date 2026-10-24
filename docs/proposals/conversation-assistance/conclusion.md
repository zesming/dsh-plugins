# 评审结论：一处上游修正与一个双模块插件

本文合并评审 [项目草稿](project-drafts.md)、[提示词预测](composer-predictions.md)、[轮次 recap](turn-recap.md)，按 DSH 固定基线的实际实现重新核对能力边界，给出可以开始开发的初步结论。三份原方案保留为背景材料；与本文冲突时以本文为准。

核查基线：DSH `22ddee3`（2026-10-23），目标仓库 `892ce6e`。方法是对基线源码逐项追踪实现与既有测试，并对关键主张做了一轮独立复核（见[复核记录](#复核记录)）。本次没有启动 DSH、没有调用模型；键盘仲裁、附件往返、Desktop 与多面板差异仍需在开发中实测。

## 结论摘要

| 功能 | 归属 | 首版可以交付到哪一步 | 主要限制 |
|---|---|---|---|
| 项目草稿 | **上游 PR** | 导航不再覆盖或搬走任一项目的草稿；未发送附件随草稿保留 | 附件运行时归属必须一起改，否则去掉搬运会变成丢附件 |
| 提示词预测 | **本仓库插件** | 输入框上方一行建议，点击或快捷键接受成可编辑草稿 | 不是行内 ghost text；生成请求受“model-visible ⟺ logged”约束，需评审确认 |
| 轮次 recap | **本仓库插件** | `facts` 纯客户端生成，不需要模型；`semantic` 待同一个合规决定 | `semantic` 与预测共享日志与计费缺口 |

一句话结论：**三个功能按“一个上游 PR、两个插件功能”只能落成“草稿走 DSH、预测与 recap 走 `dsh-conversation-assist`”**。但有一个前置判断要先做：如果严格要求“任何模型请求都必须有 Session 日志记录”，那么预测和 `semantic` 都要等上游补接口，插件首版只剩 `facts`；如果接受“日志 + 代码内固定模板可重建 + 插件自有审计日志”，两个功能都能进首版（预测关闭、`semantic` 关闭）。这不是技术实现问题，是本轮评审必须先拍板的规则问题。

## 一、核实后的关键事实

### 1.1 项目草稿：搬运只发生在一个入口，且会覆盖目标

- 草稿文字与引用芯片按 Session 持久化，切换 Session、reload 都能恢复；这是已有能力，不需要第二份 `projectDrafts`。[D1](evidence.md#项目草稿)
- 工作区选择器只出现在 hero（无 Session 或 blank Session）界面；带历史的会话看不到它。[C1](#新增证据)
- 选择器是唯一会搬运草稿的入口：`selectWorkspace` 在 `beforeOpen` 中把来源文字、引用和附件写入目标 Session，再把来源文字清空。[D4](evidence.md#项目草稿)
- 搬运会**静默覆盖目标 blank Session 已有草稿**：`next.setDraft(draft)` 是整份替换，会连同目标的引用芯片一起换掉（附件则是追加合并）；现有 e2e 只覆盖“来源被清空”，没有“目标已有草稿”的用例。[C2](#新增证据)
- 侧栏、Workspace 浏览器、New Session、新建/添加工作区、Agent preset 切换、启动恢复等入口都不搬运，各自保持原 Session 的草稿。原方案“统一所有项目切换入口”的描述过宽，需要修正。[C3](#新增证据)
- 附件是浏览器运行时对象，不是引用计数：Session scope 释放时输入壳被销毁，逐个 `releaseDraftAttachment` 删除 File、撤销预览 URL、中止上传。搬运会把附件先移交目标再释放来源引用，所以附件能活过一次跳转；但离开目标时同样会释放。非搬运入口切走再回来，只恢复文字与引用芯片，附件不会回来。[C4](#新增证据)
- 没有“非替换式”的插件入口：搬运是 `ui-conversation` 内部的闭包，hero 的 workspace 占位虽可被插件用更低优先级替换，但那是复刻整段选择器 UI，违反本仓库“不替换已发布组件”的约定。因此该项按上游修正处理。[D3](evidence.md#项目草稿)

### 1.2 提示词预测：能做，但不是 ghost text

- 没有公开的行内 ghost text 接口。输入框占位符是内部兄弟节点；真正的“行内提示”是内部 CSS 变量 `--dsh-composer-hint` 驱动的 `::after`，由命令 claim 状态写入，外部无法稳定设置（编辑器根节点的 style 归 React 所有，下一次渲染会覆盖）。不支持靠改这个变量交付。[C5](#新增证据)
- 支持的落点是 composer 内的三个 list 占位：`conversation.input.overlay`（卡片内、贴顶，浮层）、`conversation.input.dock`（卡片上方）、`conversation.composer.dock`（卡片下方）。session scope 的条目都能拿到 `sessionId`、`useSession`、`useInput`、`inputActions`。[C6](#新增证据)
- Tab / → 可以在不注册全局命令的情况下观测：`ctx.shortcuts.observeFixedInput` 在 window 冒泡阶段收到 keydown，`gesture.defaultPrevented` 已经反映编辑器或斜杠菜单是否消费了这次按键；调用 `consume()` 会 `preventDefault`，可以阻止 Tab 的焦点跳转。已发布的 Esc Esc 停止功能用的就是同一套观测方式。[C7](#新增证据)
- 目标定位有稳定标记：编辑器根节点 `[data-composer-input]`、卡片 `[data-composer-card]`、输入区 `[data-conversation-region="composer"]`、会话容器 `[data-conversation-session]`；不需要依赖构建哈希类名。[C7](#新增证据)
- 接受写入用 `captureInsertion()` + `insertText(text, span)`：带 draft revision 的 CAS，一次撤销，保留引用芯片，不要求编辑器聚焦。但 CAS 只比较内容版本，光标单独移动不会让版本变化，因此迟到结果可能插到旧光标处，接受前必须重新抓取 span。[P5](evidence.md#提示词预测)
- Host 侧可以生成候选：`ctx.on('session/event')` 观察 durable `turn/end`，`session.deriveMessages()` 取已发送历史，`request/header` 或 `sessionProjections` 取路由，`ctx.llm.prepareCall` / `stream` 发一次不带工具的请求。[C8](#新增证据)
- 两个明确缺口：外部插件不能写 durable Session 记录（`appendPluginRecord` 只允许上游 experimental 包；自定义事件不在已知类型集合里，下次读取会拒绝整份日志，即使插件还在）；辅助调用不计入 `token-meter`，也不会进入任何用量投影。`purpose` 字段目前只接受 `compaction` 与 `session-title` 两种分类。[C9](#新增证据)

### 1.3 轮次 recap：facts 可以完全在客户端

- 客户端会话事件流包含 `turn/end` 及其 `reason`，也包含 `tool/call`、`tool/result`、assistant 文本。turn-tail 的 owner 直接带有 `TurnLocation.end`（结束事件）与 `TurnLocation.data`。[C10](#新增证据)
- 外部插件可以注册一个 state-only 的 Conversation Definition（不配 View 也合法），在 `buildLocationData` 里按 Turn 发布自己的数据，再在 `conversation.chat.turnTail` 条目里通过 `owner.turn.data.get(kind)` 读取。`ui-deliverables` 的 turn-tail 卡片就是这个模式。[C10](#新增证据)
- 因此 `facts` 模式不需要 Host、不需要模型调用、不需要新路由，也不会产生额外费用。
- `semantic` 模式需要 Host：观察同一批事件、构造有上限的输入、调用一次模型并缓存结果。客户端读取有两条路：按需 `fetch` 插件路由（简单、拉取式），或由 Host 注册客户端可见投影，随会话控制流推送并在重连时给出基线（更顺滑，但投影值应可由 Session 日志重建，缓存态投影需要在缺失时重算）。首版按需读取即可。[C11](#新增证据)
- `owner.seq` 不总是实际 `turn/end` 序号，锚点必须用真实结束序号映射到 `owner.turn`；原方案的这条提醒成立。[R5](evidence.md#轮次-recap)

## 二、归属：为什么只能这样分

| 分法 | 草稿 | 预测 | recap | 是否成立 |
|---|---|---|---|---|
| A（推荐） | 上游 PR | 插件（降级形态） | 插件（facts 完整、semantic 有限制） | 成立 |
| B | 上游 PR | 上游接口 + 上游 PR | 插件 | 成立，但需要两个上游项，超出“一个上游 PR” |
| C | 插件 | 插件 | 上游 PR | 不成立：草稿没有非替换式入口，只能复刻宿主选择器 |

草稿没有插件入口；recap 的 `facts` 有完整公共入口；预测介于两者之间——交互入口够用，但“行内 ghost text”和“辅助请求可追溯”需要上游。按“一个上游 PR、两个插件功能”的目标，只有 A 成立。A 中预测的降级点必须在评审时讲清楚，不能对外宣称已有原生 ghost text。

## 三、上游 PR：让导航不再破坏草稿

### 目标与非目标

目标是“导航不破坏任何一方的草稿”：切到另一个项目再回来，文字、引用芯片和未发送附件都还在；目标项目已有的草稿不被覆盖。非目标：新增 `projectDrafts` 存储、修改 `DraftSnapshot` schema、把附件 Blob 写进草稿、跨 reload 恢复 File / 图片。

### 三个提交，一个 PR

1. **不覆盖目标草稿（可单独合并）**：`selectWorkspace` 的搬运只在目标 Session 没有任何草稿文字或引用时执行；目标已有内容时保留双方内容并给出提示（附件仍按现有规则追加）。这一步不改变产品语义，只消除静默数据丢失，现有 e2e 全部保持通过，另加“目标已有草稿”用例。
2. **附件运行时归属**：把草稿附件的所有权从输入壳移到会话级草稿存储。输入壳卸载只解绑视图，不释放对象；发送成功、显式移除、丢弃草稿、删除会话、页面关闭才释放；上传进度与已上传对象跨导航保留。reload 仍丢失 File / 图片，按现有产品范围说明。这条同时修掉侧栏切换也会丢附件的老问题。
3. **选择器改为纯导航**：删除 `beforeOpen` 中的搬运，来源草稿留在原 Session；目标 Session 恢复自己的草稿。更新 `draft-initialization.e2e.ts` 中的搬运断言为隔离断言，并补真实导航后的附件用例。若产品仍要保留“输入后改目标项目”的便利，另设显式“移动草稿”动作，不做默认行为。

如果维护者希望拆分，提交 1 可以先独立合并；提交 3 是产品语义变化，必须等提交 2 的附件 e2e 证据。

### 变更点

| 位置 | 变更 |
|---|---|
| `ui-conversation/src/client/apply.ts` `selectWorkspace` | 搬运改为条件化，最终删除；目标内容判定与提示 |
| `ui-conversation/src/client/input/hub.ts` scope teardown | 不再释放仍属于未发送草稿的附件 |
| `ui-conversation/src/client/service.ts` | 新增按 Session 的草稿附件归属、释放与重绑 |
| `ui-conversation/src/client/input/facade.ts` | 打开 Session 时恢复附件 id，而不只恢复文字与芯片 |
| `apps/web/tests/draft-initialization.e2e.ts` | 覆盖目标草稿、附件往返、所有导航入口的隔离 |

### 验收

原方案 [D-01 至 D-08](acceptance.md#项目草稿) 仍然有效。D-06（真实导航使来源 Session 的 scope 销毁后，附件仍可预览、移除、继续上传和发送）是合并门槛；提交 1 只需 D-01 与新增的“目标草稿不被覆盖”用例。所有条目都需要在真实 UI 上跑，mock 保留视图不算。

### 风险与回退

- 附件归属改造会触及发送、失败恢复、命令附件与上传取消，必须按所有权逐条列用例；无法证明的路径不要用“测试通过”代替。
- 保留附件意味着 Session 资源可能比视图活得更久；需要明确上限与会话删除时的清理，避免内存与临时 URL 泄漏。
- 如果维护者不接受“纯导航”，回退方案是只合并提交 1，并把“显式移动草稿”作为后续设计；功能降级为“不丢数据”，而不是“每项目独立草稿”。

## 四、插件：`dsh-conversation-assist`

一个包、一个 profile 条目、一份 Config（`prediction.*` 与 `recap.*` 两组），两个功能作为内部模块打包进同一个 Host 入口与同一个 Client factory。真正“两个独立设置命名空间/两个可单独卸载的包”做不到：设置表单按 profile 条目寻址，一个条目只有一份 Config。因此两个功能共享安装与卸载，各自在自己的 Config 分组里开关。

```
packages/dsh-conversation-assist/
  src/index.js          Host：事件折叠、候选生成、recap 生成、路由、插件自有状态
  src/client.js         Client：两个 slot 贡献、键盘观测、设置入口
  src/shared/           纯函数：资格判定、事实折叠、候选校验、缓存键、预算
  locale/{zh,en}.json
  cordis.patch.yml
```

### 共用约束

- 只处理当前 Session 已发送的内容；不读未发送草稿、不检索 memory、apps 或其他项目。
- 一次辅助请求必须可取消、有超时、有输出与上下文上限、每轮最多一次；换 Session、换轮次、模型切换、发送、插件卸载都取消旧请求并丢弃迟到结果。
- 默认关闭预测、默认开启 `facts`、默认关闭 `semantic`；关闭入口是插件自己的设置区，不冒充 DSH 命令。
- 设置与缓存写到插件自有的状态目录（`DSH_HOME` 下，路径与清理规则写进 README），不改 profile、不改宿主 settings 文档；不可写时退化为内存态。
- 文案走插件字典（中英）。Host 读不到浏览器语言，`semantic` 请求必须显式携带语言码，不能用服务端 locale 猜。
- 样式用宿主主题 token，正文用 `--dsw-alias-label-secondary`（约 5.8:1）而不是 `tertiary`（约 3.7:1，低于 AA）；recap 是普通可选文本，不新增 `aria-live` 区域，避免和 Chat 现有的运行/完成播报重复。
- 不替换任何已发布组件，不占用 single 占位；两个模块分别注册 list 占位条目。不测量宿主 DOM 去“画在输入框里”。
- Host 与 Client 不 import `@deepseek-ai/*` 运行时包，也不依赖 `.d.ts`：这个 checkout 的应用副本没有类型声明，本仓库又是纯 JS + Bun。所有跨包数据按运行时契约做防御性校验，不把声明合并当成能力。
- 路由注册在 `ctx.inject(['connection'])` 内，只对 owner Peer 开放（其他 Peer 得到 403 时静默降级）；请求用 POST，校验 body，in-flight 去重，`request.signal` 断开即取消。生命周期全部走 `ctx.effect`，插件卸载时取消在途模型调用、清空缓存、释放监听；安装或替换包后必须重启 DSH。

### 模块 A：下一条提示词建议

**触发**：Host 观察 `turn/end` 且 `reason.kind === 'completed'`，确认没有排队输入、没有恢复中的生成、没有待处理交互；记录 `sessionId`、`turn`、真实 `endSeq`、路由与 template 版本。其他终态首版不预测。

**生成**：从已发送历史取有上限的尾部（建议 6–8 KB）。历史来源按场景选：Live Session 用 `session.deriveMessages()`；离线或只读场景用 `sessionQuery`（`ctx.sessions.get()` 只返回活跃 Session）。加一条代码内固定、带版本号的指令；`prepareCall` 后 `stream` 一次，禁用工具，输出上限 48–64 tokens，超时 8 秒；只接受单行、长度受限、无引号包裹的结果，无法确定时返回空。语言由客户端显式传入，Host 不猜 locale。

**候选与失效**：Host 按 `sessionId + turn + endSeq + templateVersion` 缓存一条候选；新轮次、取消、Session 删除、插件卸载即作废。Client 只在以下条件同时成立时展示：当前 Session 匹配、`input.draft === ''`、无附件、无引用芯片、输入未锁定、会话不在运行、仍是同一轮。任一变化立即隐藏并丢弃。

**展示**：首版放 `conversation.input.dock`（卡片上方、整行、已分配高度）里的一条建议行：左侧建议文字，右侧“接受”按钮与键帽提示。选择它的原因是插件指南要求“选已经分配空间的占位”，而 `conversation.input.overlay` 是卡片内零高度锚点，想贴到输入文字上只能测量宿主 DOM，既脆弱又容易和斜杠菜单打架。浮层方案只作为后续 spike，不作为首版。建议行出现会让输入区下移，这是可接受的代价；用户一开始输入就隐藏。

**接受**：点击“接受”是主入口；键盘支持用 `observeFixedInput` 观测，不 `registerFixed`，且只在建议可见、编辑器 `[data-composer-input]` 聚焦、`region === 'editable'`、非组合输入、`defaultPrevented === false` 时处理。默认接受键仍是 Tab / →（产品要求），但必须保证：Esc 先隐藏建议、Shift+Tab 永远是焦点导航、建议不可见时 Tab 行为不变；不接受 IME 组合、菜单打开、有选区或非空草稿。命中后重新 `captureInsertion()`，再 `insertText(text, span)`；失败则丢弃，不回退成覆盖整份草稿。若维护者认为“在输入框里按 Tab 接受”仍会困住键盘用户，降级为可配置快捷键（例如 Mod+Enter）并保留点击入口。

**键盘边界（需实测）**：同页多个 composer 时必须按 `[data-conversation-session]` 绑定，不能全局查询；Desktop 的可配置快捷键在原生层派发，用户若把 Tab 绑到其他命令，DOM 观测可能收不到该按键，或收到时已被 `preventDefault`，两种情况都应安静退让。

**预算**：默认关闭；开启后每轮最多一次、每 Session 每小时与每日上限、失败不重试。不可用、超时、超预算都不显示，也不阻塞输入。

### 模块 B：轮次 recap

**facts**：turn-tail 条目可以直接读 `owner.turn.end` 拿到结束原因与取消原因；工具调用与结果、最终答复、截断标记需要插件自己的 state-only Definition 折叠，按 Turn 发布数据，条目只在有内容时渲染。输出规则沿用原方案：`completed` 只说本轮闭合；`aborted` 说停止与已知进展；`blocked`、`error`、`max-tokens` 分别说明阻塞、失败、截断；`interrupted` / `forked` 不当作新完成轮；工具结果未知保留“未确认”；有调用无结果则说“进行中”。一到两句，硬上限 400 字符。

**semantic**：Host 在同一 `turn/end` 上用同一份事实加最终答复构造输入，调用一次模型；输出必须以事实为边界，失败或超时回退 `facts`，不阻塞正文与新输入。缓存键 `sessionId + turn + endSeq + mode + promptVersion`，Host 内存缓存 + 插件自有文件缓存；重启后按需重算。Client 在 tail 首次挂载且该轮是最近完成轮时按需请求，旧轮只读缓存；后续可以改为 Host 投影推送，但投影值应能在缺失时重算。

**展示**：`conversation.chat.turnTail`，位于正文之后、动作行之前；不写入主回复、不进入后续模型历史。

### 与 DSH 规则的差距

| 项 | 现状 | 处理 |
|---|---|---|
| 辅助请求可追溯 | 外部插件不能写 durable Session 记录；严格解读下，含会话内容的生成请求无法被记录 | 宽松解读：输入可由“Session 日志 + 代码内带版本号的固定模板 + 日志中的路由”重建，插件另存审计记录（请求摘要、路由、输出、usage、时间）并在设置页说明。严格解读：预测与 `semantic` 都要等上游公开 seam，首版只交付 `facts` |
| 用量与成本 | `token-meter` 只折叠 `assistant/message` 与 `assistant/attempt`，插件调用不产生这些事件 | 插件记录 token 数用于本地预算，**不展示、不估算货币成本**，也不声称功能免费；DSH 用量页会少算这部分，需在 README 说明 |
| 请求分类 | `purpose` 只接受 `compaction` / `session-title` | 省略该字段；不伪造其他分类 |
| 模型可用性 | 辅助调用要求已注册 adapter | 先用 `listProviders()` / `listModels()` 探测，`prepareCall` 失败时静默关闭本模块，不阻塞主流程 |

这是本轮最需要拍板的地方：宽松解读能让预测与 `semantic` 进首版（默认关闭、可选），严格解读让它们等上游。评审必须在“功能范围”与“规则一致性”之间选一个，并在 PR 里写明选择与理由。

## 五、验收映射

| 原方案条目 | 首版 | 说明 |
|---|---|---|
| D-01 至 D-05 | 上游 | 修正是导航语义与文案，不是新组件 |
| D-06 至 D-08 | 上游，合并门槛 | 附件归属是提交 2 的核心 |
| P-01 至 P-07 | 插件 | 建议行 + 放置策略 + 可访问性；Tab 接受需按第七节第 3 条确认 |
| P-08 | 插件（受限） | 只用已发送历史；日志可追溯性按合规决定 |
| P-09 至 P-10 | 插件 | 取消、预算、终态判定 |
| R-01 至 R-05 | 插件（facts） | 纯客户端，可完整覆盖 |
| R-06 至 R-12 | 插件（facts + semantic） | `semantic` 的日志、计费与去重按合规决定 |

## 六、里程碑

| 阶段 | 内容 | 出口条件 |
|---|---|---|
| M0 | 包骨架、单个 Config（`prediction` / `recap` 两组）、设置区、路由、字典、图标；把 `scripts/build.mjs` 与根 `package.json` 的测试路径改成遍历 `packages/*` | 安装后无副作用；重启后生效；卸载后无残留；`npm run check` 覆盖新包 |
| M1 | `facts` recap | 五类终态文案快照；无模型调用、无新增 live region；卸载无残留 |
| M2 | 预测（以第七节第 1 条为前提）：Host 候选 + 建议行 + 接受 + 失效 | 真实 UI 里建议不可见时 Tab 行为不变；可见时只接受建议；迟到结果不写入；不展示成本 |
| M3 | `semantic` recap（同一前提） | 失败回退 facts；预算、超时、缓存生效；语言由请求决定 |
| M4 | 加固 | 多客户端、重连、深浅主题、读屏、文档与成本说明 |

M1 不依赖模型、不受合规选择影响，可以先交付。M2 与 M3 都以“第 1 条规则选择”为前提；若选择严格解读，二者顺延为上游接口完成后的阶段。M2 的风险集中在键盘仲裁与 Desktop 行为，需要真机验证。

## 七、待决策

1. **辅助请求规则**：接受“日志 + 代码内固定模板可重建 + 插件自有审计日志”，还是要求“任何模型请求都必须有 Session 记录”？前者让预测与 `semantic` 进首版（默认关闭），后者让它们等上游。
2. **上游导航**：接受“纯导航 + 附件归属”吗？若不接受，只合并“不覆盖目标草稿”，功能目标改为“不丢数据”。
3. **接受键**：Tab / → 仍是默认接受键，还是改成可配置快捷键？前者贴近参考产品但需要键盘仲裁与退出路径，后者更保守。
4. **附件跨导航保留**是否作为上游 PR 的合并门槛？建议是。
5. **默认值**：预测关闭、`facts` 开启、`semantic` 关闭，是否同意？

## 复核记录

| 主张 | 初次判断 | 复核结果 | 依据 |
|---|---|---|---|
| 所有项目切换都会搬走草稿 | 原方案如此描述 | 过宽：只有 hero 选择器搬运，其他入口不搬 | `ConversationMainPanel.tsx` hero 条件；`navigation.ts` `startSession` |
| 搬运只影响来源 | 原方案未提 | 不成立：目标已有文字与芯片会被整份替换，附件则追加 | `apply.ts` `next.setDraft(draft)`；e2e 无目标草稿用例 |
| 附件随“最后一个引用”释放 | 原方案措辞 | 不准确：没有引用计数，壳/scope 销毁即释放；搬运让附件活过一次跳转 | `hub.ts` teardown；`service.ts` `releaseDraftAttachment` |
| 删除搬运即可按项目保留草稿 | 原方案方向 | 不充分：附件随 scope 释放丢失，必须先改归属 | 同上 |
| 需要公开 ghost text 接口 | 原方案 | 成立；但 Tab / → 与插入已有可用公共入口 | `dom.ts` 固定输入观测；`contract/input.ts` |
| 外部插件完全无法处理搬运 | 复核时的初判 | 部分不成立：替换 hero 占位可绕过，但要复刻宿主 UI，不作为方案 | `contract/slots.ts` single 占位；`ui-slots` 优先级规则 |
| recap 需要 Host 折叠 | 原方案 | 不必要：`facts` 可在 Client Definition 完成 | `ui-deliverables` turn-tail 模式 |
| 外部插件可写辅助请求日志 | 原方案存疑 | 确认不可：无公开 ignorable 记录写法，自定义事件会让日志不可读 | `session/README.md#write-experimental-plugin-records`；`storage-contract.ts` |
| 一个包放两个功能就够了 | 原方案设想 | 功能可以共用包，但设置不能：一个 profile 条目只有一份 Config | `settings.md`；`config-form.ts` |
| 建议画在输入框里最贴近参考产品 | 原方案 | 不采用：零高度 overlay 要测宿主 DOM；首版用已分配空间的 `input.dock` | `slots.ts`；`ui-plugin.md` |
| 辅助调用成本可以展示 | 初次设想 | 不可：token-meter 只折叠 Session 事件；不展示、不估算货币成本 | `usage-projection.ts`；`token-meter/README.md` |
| 插件可以靠类型增补 | 初次设想 | 不可：应用副本无 `.d.ts`，本仓库纯 JS；按运行时契约防御式校验 | 安装副本与 `scripts/build.mjs` |

## 新增证据

- C1 `packages/client/ui-conversation/src/client/skeleton/ConversationMainPanel.tsx`：`hero` 仅由无 Session 或 blank Session 决定。
- C2 `packages/client/ui-conversation/src/client/apply.ts`：`selectWorkspace` 的 `next.setDraft(draft)` 整份替换目标文字与芯片；`from.setDraft('')` 清空来源。
- C3 `packages/client/ui-workspace/src/client/navigation.ts`：`startSession` / `openWorkspace` 不搬运草稿；只有 `selectWorkspace` 的 `beforeOpen` 搬运。
- C4 `packages/client/ui-conversation/src/client/input/hub.ts`（scope teardown）与 `packages/client/ui-conversation/src/client/service.ts`（`releaseDraftAttachment`）：释放 File、预览 URL 与上传。
- C5 `packages/client/ui-conversation/src/client/input/editor/DraftEditor.tsx` 与 `packages/client/ui-conversation/src/client/skeleton/InputBar.module.css`：占位符与 `.input p:last-child::after` 的 `--dsh-composer-hint` 都是内部实现。
- C6 `packages/client/ui-conversation/src/client/contract/slots.ts`：composer 三个 list 占位；`SessionStandardProps` 合并 `useInput` / `inputActions`。
- C7 `packages/client/shortcuts/src/client/dom.ts` 与 `packages/client/ui-conversation/src/client/stop-shortcut.ts`：固定输入观测在冒泡阶段、`defaultPrevented` 与 `consume()` 语义、稳定 data 标记。
- C8 `packages/llm/llm/src/types.ts` 与 `packages/llm/llm/README.md`：流式块、`prepareCall` / `stream`、`purpose` 联合类型。
- C9 `packages/core/session/src/index.ts` 与 `packages/core/session/README.md`：`appendPluginRecord` 限制、`ignorable` 读取规则；`packages/llm/token-meter` 只折叠 Session 事件。
- C10 `packages/client/ui-deliverables/src/client/turn-deliverables.ts` 与 `packages/client/ui-chat/src/client/chat/TurnTailNodeView.tsx`：Definition `buildLocationData` + `owner.turn.data.get` 的可用模式；`TurnLocation.end` 提供真实结束事件；`owner.seq` 语义。
- C11 `packages/client/connection/src/client/rpc.ts`（拉取式精确路由）与 `packages/api/session-controller/src/client/control.ts`（投影随控制流推送并在重连给出基线）。
- C12 `docs/subsystems/settings.md` 与 `packages/client/ui-settings/src/client/config-form.ts`：设置表单按 profile 条目寻址，一个条目一份 Config；`volatile()` 字段才出现在表单。
- C13 `packages/client/ui-theme/src/styles/design-platform.css`：`label-secondary` 约 5.8:1，`label-tertiary` 约 3.7:1；`packages/client/ui-chat/src/client/chat/RunningStatus.tsx` 已有运行/完成播报。
- C14 `scripts/build.mjs` 与根 `package.json`：构建与测试当前硬编码 `dsh-deepseek-usage`，新增包前必须泛化。

链接仍固定在上游基线 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，文件路径与行号仅用于定位；开发开始时复核上游是否已有变化。
