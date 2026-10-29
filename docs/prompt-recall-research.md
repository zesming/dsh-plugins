# 提示词召回（↑）：调研与取舍

输入框为空时按 ↑ 召回上一条提示词。这个手势在 Claude Code、Codex CLI、ChatGPT 桌面版里都有；本仓库把它放进 `dsh-conversation-assist` 插件。

本文件只记录**为什么这样做、以及在哪些地方与那些产品不同**。具体键位行为见 [插件 README](../packages/dsh-conversation-assist/README.md#prompt-recall)。

事实核对日期 2026-10-29，DSH 基线 `22ddee3`。

## 一、四个产品怎么做

| 问题 | Claude Code | Codex CLI | ChatGPT 桌面 | Gemini CLI |
|---|---|---|---|---|
| 触发条件 | 多行输入先移动光标；光标在首/末视觉行时才翻历史 | 文本为空直接翻；非空要求光标在行首/行尾**且**文本仍等于上次召回内容 | 输入框为空 | 单行直接翻；多行且光标已在首行时先 `move('home')`，再按一次才翻 |
| 召回内容 | 原始文本，含完整粘贴内容 | 持久历史仅文本；会话内历史保留附件 | 输入框的 prompt 文本 | `userMessages` 里的纯字符串 |
| 最旧边界 | 停住 | 静默停住（`Some(0) => return None // already at oldest`） | 未公开 | 停住 |
| 持久化 | 按工作目录跨会话 | 跨会话 + 会话内 | 未公开 | 仅当前会话 |
| 连续重复 | 合并为一条，↑ 跳到上一条不同的 | 相邻重复合并 | 未公开 | 合并 |

来源：[Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode#command-history)、[Codex `chat_composer_history.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/chat_composer_history.rs)、[ChatGPT commands 参考](https://learn.chatgpt.com/docs/reference/commands)、[Gemini `InputPrompt.tsx`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/components/InputPrompt.tsx)。

三者与 ChatGPT 桌面版的区别在于：Codex 与 Gemini 在输入为空时也直接翻历史，但它们另外允许在**已写入内容**的输入框里按光标边界继续往前翻；ChatGPT 桌面版只在输入框为空时响应。Claude Code 同样只在光标位于首/末视觉行时才翻，因此也能在已写内容的输入框里往上翻。

### 已知失败模式

四款产品的 issue 里反复出现四类问题，直接约束了本插件的行为：

| 问题 | 实例 |
|---|---|
| 输入法组合态按 ↑ 销毁正在输入的内容 | [claude-code#101294](https://github.com/anthropics/claude-code/issues/101294) |
| 召回覆盖正在写的草稿，且没有恢复路径 | [#55275](https://github.com/anthropics/claude-code/issues/55275)、[#81517](https://github.com/anthropics/claude-code/issues/81517)、[#102146](https://github.com/anthropics/claude-code/issues/102146) |
| ↑ 抢走排队消息而不是翻历史 | [codex#29088](https://github.com/openai/codex/issues/29088) |
| 历史作用域不当：串到别的会话，或按目录隔离失效串到别的项目 | 会话级串味 [codex#12085](https://github.com/openai/codex/issues/12085)；跨项目串味 [#65011](https://github.com/anthropics/claude-code/issues/65011) |

前两类在本插件里是硬性约束：组合态与带修饰键的方向键一律让位；首次召回暂存草稿，退出浏览时恢复。

## 二、为什么是插件，不是上游

上游 `CONTRIBUTING.md` 明示「we cannot accept external pull requests at the moment」，本插件因此不做上游分支路线，只在本仓库维护。

功能本身属于 `ui-conversation` 的输入层，放进上游源码更合适（能做出独立撤销步）；这一点在下面的取舍里说明。

## 三、与上游源码版的关键差别

上游源码可以拿到编辑器和它的撤销历史，插件拿不到。三处实际差距：

1. **召回不是独立撤销步。** 插件只能通过 `inputActions.setDraft` 整份写回草稿，而宿主的 `setDraft` 走 `HISTORY_MERGE_TAG`、从不压基线，所以在干净输入框里 Ctrl/Cmd+Z 撤不回召回。`insertText` 虽有独立撤销步，但它是「在光标处插入」而非「替换草稿」，多段落换行会落进同一个段落、段落结构丢失。退路是 ↓ 或 Esc 恢复暂存草稿。
2. **Esc 与宿主的「Esc Esc 停止」重叠。** 宿主只在存在运行中的轮次时消费 Esc；插件另外再判一次 `running`，因此仅在空闲时退出浏览。
3. **历史限于已加载的事件窗口。** 尾部页总是先加载，所以「上一条」一定有；更早的提示词要等用户已向上翻过历史。

## 四、与外部产品的一处有意偏离

四个产品里有三个允许在**已写入内容**的输入框上继续往前翻（光标在边界时）。本插件只在**空输入框**时进入。

原因是 DSH 的输入框是富文本编辑器，宿主 keymap 只在触发菜单关闭时放行方向键，不暴露光标所在行；判断「光标是否在首行」只能探进编辑器内部（内部 DOM 结构或内部 CSS 变量），而本仓库 `CONTRIBUTING.md` 明确禁止这种做法。取舍是放弃「在草稿上继续往前翻」，换取不误伤多行编辑。

这与下面「已知局限」里读 `[data-conversation-session]` 不矛盾，两者性质不同：那个属性是宿主给「哪个会话区域」打的**归属标记**，与编辑器内部结构无关，读它不会因为排版或编辑器实现变化而失效；而被放弃的那条依赖必须解析编辑器内部的行盒与光标位置。前者是一处已登记的脆弱点，后者是把第三方排版当契约。

若将来上游提供 composer 的行内 hint 或光标边界查询，这一条可以收回；届时「召回后再往前翻」也会一并可用。

## 五、已知局限

这些是实现本身带来的，不是外部产品的取舍：

- **一次召回之后无法再往前翻。** 真机验证发现：召回写入后 composer 已有内容，宿主把 ↑ 交给编辑器做光标移动（先 `preventDefault`），插件收不到「未被认领」的按键。所以「连续 ↑ 往前翻」实际不可达——这是第四节那条偏离的直接后果，此前只在文档里推断，现已有实测证据。
- **每个挂载的座位各注册一个监听。** 同一会话开两个面板时会有两个召回游标，各自写草稿，后者覆盖前者。快捷键派发以「已消费」标记后续监听者，因此顺序相关。
- **「编辑即退出浏览」是采样判断。** 插件在自己的监听里比较「当前草稿」与「自己上次写入的文本」，无法订阅草稿变化。非用户写入（草稿种子、提交后清空）会静默退出并丢掉暂存草稿；用户改回完全相同的文本则察觉不到。
- **依赖宿主的一个 DOM 属性。** 定位「这个按键属于哪个会话」读取 `[data-conversation-session]`，该属性目前只被宿主内部（`ConversationContent`、`stop-shortcut`）使用，不是公开契约，宿主改结构会失效。
- **座位拿到的 `useSession` 与 `runtime` 不是标准 slot props。** 它们来自插件自己的 inject 与其 `useSession` 参数，不属 `SessionStandardProps` 的承诺范围。

## 六、参考

- 宿主按键派发：[`shortcuts/src/client/dom.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/shortcuts/src/client/dom.ts)（本地窗口监听、本地 handler 之后派发、`defaultPrevented` 反映是否已被认领）
- 宿主 composer keymap：[`keymap.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/input/editor/keymap.ts)
- 宿主输入动作：[`contract/input.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/input.ts)
- 宿主会话绑定：[`contract/sessions.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/client/contract/sessions.ts)
- 本插件实现：[`recall.mjs`](../packages/dsh-conversation-assist/src/ui/recall.mjs)、[`recall-seat.js`](../packages/dsh-conversation-assist/src/ui/recall-seat.js)
- 相邻设计文档：[会话辅助：来源、展示与质量边界](conversation-assist-design.md)
