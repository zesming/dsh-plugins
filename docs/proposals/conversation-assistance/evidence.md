# 证据清单

研究日期：2026-10-24。DSH 链接全部固定在 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，避免将开发中的 `main` 当作研究时状态。行号仅帮助定位，文件内容和类型声明是依据。外部产品文档会更新，引用仅说明检查时的公开行为。

## 项目草稿

| ID | 来源 | 已核实内容与限制 |
|---|---|---|
| D1 | [stores.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/stores.ts)、[draft-editor.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/draft-editor.ts) | Session 级语义 `DraftSnapshot` 保存文字与引用；不等于 File / Blob 附件持久化 |
| D2 | [New Session blank reuse guide](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/upgrade-guide/v0.2.1-rc.2/new-session-blank-reuse/guide.md) | workspace 内 eligible blank Session 复用；不能据此声称所有项目切换都已隔离 |
| D3 | [navigation.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-workspace/src/client/navigation.ts) | `openWorkspace` 是统一导航的复用基础 |
| D4 | [apply.ts:364–387](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/apply.ts#L364-L387) | `selectWorkspace` 额外搬运草稿 / 附件并清空来源，是需求冲突位置 |
| D5 | [draft-initialization.e2e.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/web/tests/draft-initialization.e2e.ts#L340-L446)、[搬运断言](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/web/tests/draft-initialization.e2e.ts#L570-L596) | 已有隔离 / reload 覆盖，也有需要改变的旧搬运预期；未在本次运行 |
| D6 | [input/hub.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/input/hub.ts) | Session scope 清理涉及运行时附件；last-reference 导航必须实测 |
| D7 | [input/facade.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/input/facade.ts)、[input.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/input.ts) | 输入版本、异步提交、附件 ID 与浏览器对象的职责需一起核对 |

## 提示词预测

| ID | 来源 | 已核实内容与限制 |
|---|---|---|
| P1 | [Composer Predictions](https://learn.chatgpt.com/docs/features/composer-predictions) | 完成后 hint、Tab 接受成可编辑草稿、手动发送；只用当前 thread 已有上下文，不主动取 memory / apps；产品免费策略不适用于 DSH |
| P2 | [Interactive mode — Prompt suggestions](https://code.claude.com/docs/en/interactive-mode#prompt-suggestions) | Tab / → 接受；同模型后台请求，计入套餐额度 / API 费用；内部模板和阈值未公开 |
| P3 | [Desktop application — Accept a suggested prompt](https://code.claude.com/docs/en/desktop#accept-a-suggested-prompt) | 空输入且无附件时展示灰色建议；未接受前 Enter 不发送建议 |
| P4 | [Codex — thread_sample.rs](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/app-server/src/thread_sample.rs) | 2026-10-24 核对的公开采样实现：ephemeral fork、单次推理、拒绝工具调用、父历史变化后丢弃；不能外推为闭源产品全部实现 |
| P5 | [InputActions](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/input.ts#L253-L280) | `captureInsertion` / `insertText` 有 revision 保护和单步 undo；不是 ghost text / 键盘接受接口 |
| P6 | [Agent README](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent/README.md)、[Core subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/core.md) | `agent.model.current`、`runMaintenance` 的行为；后者阻塞 waking input，不适合后台预测 |
| P7 | [LLM README](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm/README.md)、[Session README](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/README.md) | `prepareCall` / `stream` 与 `deriveMessages` 可复用；辅助输入也须可由日志重建 |
| P8 | [Session README](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/README.md#write-experimental-plugin-records) | `appendPluginRecord` 只准上游仓库内 experimental 包，外部插件不能调用；新代码不能用已弃用的历史读取方式 |
| P9 | [UI conversation README](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/README.md)、[slot 定义](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/apply.ts#L463-L471) | input activity 是 single；没有核实公开 ghost text / Tab seam |

## 轮次 recap

| ID | 来源 | 已核实内容与限制 |
|---|---|---|
| R1 | [Interactive mode — Session recap](https://code.claude.com/docs/en/interactive-mode#session-recap) | 失焦、上轮完成 3 分钟、至少 3 轮、返回展示、不连续两次；手动 `/recap`、可关闭、非交互不自动显示、400 字符；不等于 turn-end recap |
| R2 | [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) | 2.1.108 引入，2.1.110 扩展到 telemetry 关闭用户，2.1.113 修复编辑时触发，2.1.257 修复配置 advisor 模型的会话的后台请求缓存遗漏；移动链接，具体版本号用于查找 |
| R3 | [Manage costs — Background token usage](https://code.claude.com/docs/en/costs#background-token-usage) | 没有给出 recap 固定价格，不能从提示词预测费用推导 recap 的具体模型、模板或单次费用 |
| R4 | [Session types — TurnEndReasonMap](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/src/types.ts#L203-L238)、[turn/end](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/src/types.ts#L294-L303) | completed / aborted / blocked / error / max-tokens / interrupted / forked；completed 只是轮次闭合，恢复与继承截断不应触发新摘要 |
| R5 | [Chat slots](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-chat/src/client/contract/slots.ts#L446-L451)、[TurnTailNodeView](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-chat/src/client/chat/TurnTailNodeView.tsx#L47-L70) | Session list slot `conversation.chat.turnTail` 位于正文后、动作行前；owner.seq 不总是实际 endSeq |
| R6 | [UI deliverables](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-deliverables/src/client/index.ts)、[Conversation subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/conversation.md) | 已有 turnTail 使用实例与 UI 组成说明；不证明 recap 数据流程已存在 |
| R7 | [Session title service](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-title/README.md)、[Session title LLM](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-title-llm/README.md) | 辅助请求的输入、路由、预算、取消、精确日志与 stream 组装可参考；title provider 唯一，不能占用或伪造事件 |

## 仓库约定与证据边界

已检查目标仓库 [README](../../../README.md) 与 [CONTRIBUTING](../../../CONTRIBUTING.md)。目标基线没有 `AGENTS.md`、`.agents/skills` 或 `SKILL.md`；根级规则以现有两份说明为准。

为判断后续上游实现方向，同时只读检查了固定基线的 [AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/AGENTS.md)、[docs/AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/AGENTS.md) 及 `.agents/skills/` 中的 [dsh-prose-standard](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/.agents/skills/dsh-prose-standard/SKILL.md)、[dsh-pr-description](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/.agents/skills/dsh-pr-description/SKILL.md)、[dsh-pre-push-checks](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/.agents/skills/dsh-pre-push-checks/SKILL.md)。这些是上游背景资料；本 PR 遵循目标仓库组织，不创建上游 Issue、翻译对或上游 PR。

建议项包括默认开关、长度预算、suggestion 接口字段、辅助请求调度和缓存选择；它们没有被当作既有 API。未验证项包括附件 last-reference 行为、公开 suggestion 接口、外部插件日志与增量读取接口、recap 异常布局、质量与成本测量。验收矩阵是未来测试要求，不是功能已通过的证据。
