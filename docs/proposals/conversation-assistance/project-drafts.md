# 按项目保留输入草稿

## 目标与已核实行为

目标是在项目 A 输入未发送内容，切到项目 B 编辑另一份内容，再回到 A 时仍看到 A 的草稿。切项目是导航动作，不隐式搬运、合并或覆盖草稿。

已核实：`DraftSnapshot` 已保存文字和语义引用芯片，以 `dsh.conversation.<sessionId>` 持久化。New Session 会复用 workspace 内 eligible blank Session，所以已有部分按项目隔离能力。[D1–D3](evidence.md#项目草稿)

搬运只发生在一个入口：`ui-conversation` 的 `selectWorkspace` 在 `openWorkspace` 的 `beforeOpen` 中把来源草稿与附件搬到目标、清空来源。这个入口是 hero 界面的工作区选择器，只出现在无 Session 或 blank Session；带历史的会话没有它，侧栏、Workspace 浏览器、New Session 等入口都不搬运。[D4–D5](evidence.md#项目草稿)

真正的数据风险有两个，原方案只写了第一个：目标 blank Session 已有文字与引用时，`next.setDraft(draft)` 会整份替换目标内容（附件则是追加合并），现有测试没有覆盖这个方向；来源被清空后，原项目的 blank Session 只剩空输入。[C2](conclusion.md#一核实后的关键事实)

## 建议设计

统一所有项目切换入口为已有 `openWorkspace` 的纯导航语义。项目选择器不读取、复制或清空来源草稿；进入目标后由已有 Session 选择与初始化流程恢复目标内容。不要新增平行的 `projectDrafts` 存储、修改 `DraftSnapshot` schema，或用 workspace ID 取代 Session ID。

| 操作 | 建议结果 |
|---|---|
| A → B，B 已有草稿 | 显示 B 原草稿；A 保留原草稿 |
| A → B，B 没有草稿 | 显示空输入；A 保留原草稿 |
| A / B 快速往返 | 各自恢复自己的语义草稿；迟到回调不能把内容写进当前另一项目 |
| 打开已开始的会话 | 继续该 Session 的独立草稿，不套用 workspace blank Session 草稿 |
| New Session | 保持已有 eligible blank Session 复用规则；不因反复点击无限创建空 Session |
| 发送后切换，再遇异步失败 | 错误恢复只作用于原发送 Session 与原提交版本，不能覆盖另一项目或后来新写的草稿 |

只修改会话内项目选择入口就足以统一语义，因为其它入口本来就不搬运；需要的是把选择器对齐到它们的“打开目标 Session、恢复目标草稿”语义，并用真实 e2e 证明。开发时仍应枚举侧栏、首页、项目选择器、新建会话和启动恢复，确认没有遗漏的写入路径。若需要“把草稿带到其他项目”，另设明确动作与冲突确认，不作为本轮默认行为。

## 附件是单独的开发前置

语义引用芯片与 File / 图片附件不是同一类数据。附件包含浏览器运行时对象和上传状态；输入壳随 Session scope 销毁时会逐个释放，删除 File、撤销预览 URL、中止上传。这里没有引用计数：附件不跟着 Session 活，只跟着承载它的输入壳活。删除 `selectWorkspace` 的搬运代码只能消除隐式迁移，反而会让附件在切走后直接丢失。[D6–D7](evidence.md#项目草稿)

合并门槛是从真实 UI 导航进入另一项目，使来源 Session 的 scope 销毁，再回到来源：文件、图片、上传状态、移除和发送都要正确。保留来源组件不卸载的 mock 测试不能代替这个路径。附件所有权改造（按 Session 保存未发送附件，发送成功、显式移除、丢弃草稿、删除 Session、页面关闭时释放）必须与纯导航一起交付；只删搬运不做归属，是功能回退。[评审结论](conclusion.md#三上游-pr让导航不再破坏草稿)

若该路径丢附件，先设计独立的 runtime draft attachment ownership：让运行时附件随未发送草稿保留，而不是随输入壳销毁消失；明确移除、发送成功、草稿丢弃、Session 删除、上传取消与临时 URL 释放的所有者。不要为修补生命周期而把 Blob 塞进语义草稿。该改动可以单独实现和评审，但附件用例未通过前不能声称功能完整。

浏览器 reload / 应用重启后的 Blob 持久化另列范围：本方案要求文字和语义引用恢复，不承诺尚未落盘的 File / 图片跨重启恢复。产品应说明这一范围；若需要跨重启附件，另做持久化与清理设计。

## 实现与测试范围

优先查看 `apply.ts` 的 `selectWorkspace`、`ui-workspace/navigation.ts`、`stores.ts`、`input/hub.ts`、`input/facade.ts`，以及 New Session blank reuse 升级说明，具体固定链接见证据清单。

`apps/web/tests/draft-initialization.e2e.ts` 已有 A / B 草稿与 reload 场景（约 340–446 行）；约 570–596 行的搬运断言需要改成隔离断言。既有测试行为变化的理由是“项目切换应恢复目标草稿，而不迁移来源”，不能直接删掉回归覆盖。现有用例还缺两类：目标 blank Session 已有文字与引用时不得被覆盖；附件在真实导航后仍可预览、移除并发送。

验收使用 [D-01 至 D-08](acceptance.md#项目草稿)。仍待实测：真实导航使来源 scope 销毁后的附件保留；Desktop 与多窗口下的上传状态；发送失败恢复是否已有完整版本保护。本 PR 仅列出设计与验收，不执行这些产品测试。
