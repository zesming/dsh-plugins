# 完成后的提示词预测

## 最终体验

模型一轮完成、主会话进入可输入状态后，在输入框上方显示一条灰色建议，预测用户可能想发送的下一条提示词。点击“接受”或按 Tab / → 把整条建议变成可编辑草稿；用户仍需自己发送。接受、关闭或看到建议都不产生用户消息、不执行工具。

基线实现没有公开的行内 ghost text 接口：占位符是内部节点，真正的行内提示由内部变量 `--dsh-composer-hint` 驱动，外部无法稳定写入。`conversation.input.overlay` 是卡片内零高度锚点，想贴到输入文字上只能测量宿主 DOM，插件指南明确要求选择“已经分配空间”的占位。[评审结论](conclusion.md#12-提示词预测能做但不是-ghost-text) 因此首版用 `conversation.input.dock` 在卡片上方渲染一条建议行：左侧建议文字，右侧“接受”按钮与键帽提示。它不等于行内 ghost text；要拿到真正的行内体验，需要上游补一个 composer suggestion 接口，那是后续依赖。

这属于下一步意图预测，不是逐字续写用户正在输入的句子。建议首版只在输入为空、无附件、无语义引用芯片且没有提交锁时显示；用户开始输入即取消。点击接受是主入口，Tab / → 是产品要求的键盘路径，但必须支持退出与不劫持。

## 产品参考与可借鉴范围

[Composer Predictions](https://learn.chatgpt.com/docs/features/composer-predictions) 的官方说明支持“响应完成后出现、Tab 接受为可编辑草稿、用户自行发送”，只使用当前 thread 已有上下文，不主动查找 memory 或 apps。该页面目前描述 Codex desktop；本文保留用户所说的 ChatGPT desktop 体验意图，不推断其所有平台都支持同样行为。页面的产品额度政策不能推导出 DSH 辅助推理免费。[P1](evidence.md#提示词预测)

Claude Code 的 [Prompt suggestions](https://code.claude.com/docs/en/interactive-mode#prompt-suggestions) 和 [Accept a suggested prompt](https://code.claude.com/docs/en/desktop#accept-a-suggested-prompt) 明确支持 Tab / → 插入；桌面建议仅显示于无附件的空输入框。官方说明预测使用同模型的短后台请求，占用套餐额度或 API 费用。[P2–P3](evidence.md#提示词预测)

公开 Codex `thread_sample.rs` 的临时分叉、单次推理、拒绝工具调用、父历史变化后丢弃结果可以作为隔离思路参考。它只是公开实现的一部分，不能证明闭源产品使用相同模板、路由、触发阈值或完整实现。[P4](evidence.md#提示词预测)

## DSH 已有能力与缺口

已核实：`useInput` 的 `captureInsertion()` / `insertText(text, span)` 支持基于 draft revision 的异步安全插入，保留引用芯片并形成一个撤销步骤（CAS 只比较内容版本，接受前必须重新抓取 span）。`ctx.llm.prepareCall` / `stream`、`session.deriveMessages()` 与 `agent.model.current` 可用于准备辅助请求与已发送历史。[P5–P7](evidence.md#提示词预测)

也已核实：Tab / → 不需要 ghost text 或宿主 suggestion 接口。`ctx.shortcuts.observeFixedInput` 在 window 冒泡阶段收到按键，`gesture.defaultPrevented` 已反映编辑器与斜杠菜单的消费结果，`consume()` 可以阻止 Tab 的焦点跳转；编辑器根节点有稳定的 `[data-composer-input]` 标记，会话容器有 `[data-conversation-session]`。已发布的 Esc Esc 停止功能用的就是同一套观测方式。不必 `registerFixed`，因此不会把 Tab / → 写进快捷键目录或全局保留。[评审结论](conclusion.md#12-提示词预测能做但不是-ghost-text)

缺口有两个：行内 ghost text 没有公开绘制入口；辅助请求没有公共的 durable 日志写法。后者见下文“成本、日志与配置”。

因此首版可以在本仓库作为插件交付，不必等上游 suggestion 接口；前提是接受建议行（而不是行内 ghost text），并且辅助请求日志的规则选择允许它进首版。后者见下文。

## 建议数据流程

1. 观察主轮次的 durable `turn/end` 且原因为 `completed`，再确认没有排队输入、恢复中的生成或提交事务；记录 Session、binding generation、turn / history version、`draftRev` 与 model route。stream end、idle 与 `agent/turn-stopping` 都不足以证明轮次闭合；steering 可能继续这一轮。其他终态首版不自动预测。
2. 从已发送的当前会话历史构造有上限的上下文；不读取未发送草稿，不额外检索其他项目。历史截断、模板版本、路由和预算必须可重建。
3. 启动一次可取消、独立的辅助模型请求，禁用工具；有明确下一步才返回一条简短候选，不够确定时允许返回空结果。不编造跨厂商“已验证阈值”或内部模板。
4. 完成后核对全部绑定字段和输入 eligibility；任何切换、编辑、发送、新轮次、resume、模型切换或插件卸载都取消旧请求并丢弃迟到结果。相同轮次只保留一个候选。
5. hint 由宿主绘制，未接受前不写入 `DraftSnapshot`、编辑器正文、剪贴板或发送负载。接受时再次校验，并通过现有安全插入动作写入；失败则丢弃，不回退为覆盖整个草稿。

`agent.runMaintenance` 会阻塞新的 waking input，不适合本功能后台请求。禁止用 `followup` / `inject` 把预测变成主 agent 的新一轮。[P6](evidence.md#提示词预测)

## 键盘与无障碍仲裁

| 场景 | 建议行为 |
|---|---|
| IME composing 或候选窗打开 | 不展示、不接受预测；不截获组合输入按键 |
| 命令、提及、补全菜单打开 | 菜单优先；预测暂停 |
| 有选区、光标不在约定的接受位置、非空草稿 | 不接受；保留原光标与选择行为 |
| 可见候选且 editor 聚焦，单独 Tab / → | 整条接受为一个可撤销的编辑步骤；建议不可见时按键行为完全不变 |
| Shift+Tab、修饰键组合、候选不可见或已过期 | 保持原焦点导航和按键行为 |
| 需要跳过建议前往下一控件 | Esc 先隐藏建议，Shift+Tab 始终是焦点导航；接受建议不能形成焦点陷阱。若评审认为在输入框里按 Tab 接受仍会困住键盘用户，降级为可配置快捷键 + 点击入口 |
| 读屏与高对比模式 | 建议行有可读标签与具名“接受”按钮，焦点不自动移动；不用 assertive live region 打断当前朗读，不把未接受文字读成已输入 |

## 成本、日志与配置

建议默认关闭并允许用户显式开启；配置模型路由、最大上下文、最大输出、每轮最多一次、超时与会话预算。不同于参考产品的额度政策，DSH 按实际 provider 计费，不能宣传免费。不可用、超时或超预算时不显示候选，不妨碍继续输入。

辅助请求仍受 dsh-llm“model-visible 必须可由日志重建”的规则约束：需要记录输入来源、推理指令、模型路由、结果和 usage，且不把候选注入主历史。外部插件目前没有合规写法：`appendPluginRecord` 只允许 deepseek-harness 仓库内 `packages/experimental/`，明确禁止外部插件调用；自行追加新的 `SessionEventMap` 事件能写入，但事件不在 `KNOWN_SESSION_EVENT_TYPES` 里，下次读取会拒绝整份日志。`purpose` 也只接受 `compaction` / `session-title`，辅助调用无法分类。[P7–P8](evidence.md#提示词预测)

因此首版的处理是：输入由“Session 日志 + 代码内带版本号的固定模板 + 日志中的路由”确定性重建，插件另存审计记录（请求摘要、路由、输出、usage、时间），并在设置页说明。辅助调用不计入 `token-meter`，插件只把 token 数用于本地预算，**不展示、不估算货币成本**，也不声称免费。这是**需要评审确认的合规选择**：如果要求严格满足“所有模型请求都必须可由 Session 日志重建”，预测必须等上游公开日志 seam，插件首版只交付 recap 的 facts。

验收使用 [P-01 至 P-10](acceptance.md#提示词预测)。P-02 的“Tab 接受”需要按 `[data-composer-input]` 定位，同页多 composer 时不得全局接受。待实测：Desktop 原生快捷键与 DOM 观测的先后、斜杠菜单打开时的退让、IME 组合、迟到候选的光标位置。未决项：行内 ghost text 与辅助请求日志是否作为上游接口推进，见[评审结论](conclusion.md#七待决策)。
