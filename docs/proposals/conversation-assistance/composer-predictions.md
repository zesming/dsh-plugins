# 完成后的提示词预测

## 最终体验

模型一轮完成、主会话进入可输入状态后，在空输入框中显示一条灰色 hint，预测用户可能想发送的下一条提示词。Tab 或 → 将整条建议接受为可编辑草稿；用户仍需自己发送。接受、关闭或看到建议都不产生用户消息、不执行工具。

这属于下一步意图预测，不是逐字续写用户正在输入的句子。建议首版只在输入为空、无附件、无语义引用芯片且没有提交锁时显示；用户开始输入即取消。点击接受可作为辅助交互，不能替代 Tab / → 的最终需求。

## 产品参考与可借鉴范围

[Composer Predictions](https://learn.chatgpt.com/docs/features/composer-predictions) 的官方说明支持“响应完成后出现、Tab 接受为可编辑草稿、用户自行发送”，只使用当前 thread 已有上下文，不主动查找 memory 或 apps。该页面目前描述 Codex desktop；本文保留用户所说的 ChatGPT desktop 体验意图，不推断其所有平台都支持同样行为。页面的产品额度政策不能推导出 DSH 辅助推理免费。[P1](evidence.md#提示词预测)

Claude Code 的 [Prompt suggestions](https://code.claude.com/docs/en/interactive-mode#prompt-suggestions) 和 [Accept a suggested prompt](https://code.claude.com/docs/en/desktop#accept-a-suggested-prompt) 明确支持 Tab / → 插入；桌面建议仅显示于无附件的空输入框。官方说明预测使用同模型的短后台请求，占用套餐额度或 API 费用。[P2–P3](evidence.md#提示词预测)

公开 Codex `thread_sample.rs` 的临时分叉、单次推理、拒绝工具调用、父历史变化后丢弃结果可以作为隔离思路参考。它只是公开实现的一部分，不能证明闭源产品使用相同模板、路由、触发阈值或完整实现。[P4](evidence.md#提示词预测)

## DSH 已有能力与缺口

已核实：`useInput` 的 `captureInsertion()` / `insertText(text, span)` 支持基于 draft revision 的异步安全插入，保留引用芯片并形成一个撤销步骤。`ctx.llm.prepareCall` / `stream`、`session.deriveMessages()` 与 `agent.model.current` 可用于准备辅助请求与已发送历史。[P5–P7](evidence.md#提示词预测)

待接口：尚未核实公开的 ghost text 绘制与 Tab / → 仲裁入口。Lexical、`ComposerKeyboard` 和编辑器内部结构不能当成外部插件 API；`conversation.input.activity` 是单占位，不是通用预测扩展点。不要替换整个 composer 或抢占这个 slot。

建议先在 DSH 仓库内验证第一方可选插件，核心只增加通用 composer suggestion 接口，分别定义宿主提供者、预测消费者和可释放的注册方式。需要覆盖候选 ID、绑定版本、预览文本、取消、接受与键盘优先级；这里描述的是接口要求，不声明这些 API 已存在。本仓库能否独立实现完整外部插件，取决于这些接口与日志机制是否开放。

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
| 可见候选且 editor 聚焦，单独 Tab / → | 整条接受为一个可撤销的编辑步骤 |
| Shift+Tab、修饰键组合、候选不可见或已过期 | 保持原焦点导航和按键行为 |
| 需要跳过建议前往下一控件 | 提供明确的键盘退出方式，例如 Esc 隐藏后 Tab 正常导航；接受建议不能形成焦点陷阱 |
| 读屏与高对比模式 | 宣告“建议，可接受”，不把未接受文字读成用户已输入；不反复抢读 |

## 成本、日志与配置

建议默认关闭并允许用户显式开启；配置模型路由、最大上下文、最大输出、每轮最多一次、超时与会话预算。不同于参考产品的额度政策，DSH 按实际 provider 计费，不能宣传免费。不可用、超时或超预算时不显示候选，不妨碍继续输入。

辅助请求仍受 dsh-llm“model-visible 必须可由日志重建”的规则约束：需要记录输入来源、推理指令、模型路由、结果和 usage，且不把候选注入主历史。`appendPluginRecord` 文档仅允许 deepseek-harness 仓库内 `packages/experimental/`，明确禁止外部插件调用。独立插件的持久化日志接口是开发前置，不能把直接调用 `ctx.llm` 当成已经满足规则。[P7–P8](evidence.md#提示词预测)

验收使用 [P-01 至 P-10](acceptance.md#提示词预测)。待验证：通用 suggestion 接口、独立辅助调用的日志所有权、实际 provider 成本与延迟、接受率与错误建议样本。这些不阻止文档评审，但阻止宣称外部插件已可交付。
