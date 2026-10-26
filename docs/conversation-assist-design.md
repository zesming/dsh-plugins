# 会话辅助：来源、展示与质量边界

本插件帮助用户读懂刚结束的一轮，并在有明确后续意图时准备下一条草稿。回顾与建议服务于用户当前任务；没有有用的下一步时，空结果是正常行为。

回顾只有一个显示开关。开启后，符合现有策略的正常最终回复会请求模型回顾；明显简短的回复会省略。回顾是附加信息而非刚需，所以只在有真实模型回顾可展示时才渲染：生成中、历史轮次、请求失败、额度用尽、上下文装不下、异常结束，一律什么都不显示。没有占位符、没有状态行、也没有回复摘录——上方正文已经说明了回复内容和结束方式，重复一遍只占纵向空间。下一条建议仍由独立开关控制。

## 为什么摘录和最近消息不足以实现目标

回顾只取最终回复开头，会系统性丢失后段的验证、限制和待决定事项；它可以是摘录，却不能承诺总结结论。截取最后一个文本块也会遗漏同一回复中的其他文本块。摘录直接重复上方正文，不提供新信息却占用纵向空间，因此不作为回顾的兜底展示。

对于建议，更严重的问题是选错来源。原来的整轮裁剪会跳过超过输入预算的最新轮，再选择更早的短轮，随后给结果附上最新轮标识。这会产生“新生成、内容却过时”的建议，清缓存无法解决。正确策略是保留当前轮身份与内容，不足时退化，不能拿旧轮顶替。

来源、生成与展示应分开验证：来源正确不保证模型读对；摘要没有编造也不代表保留了重要限制；界面上的省略又可能让正确结果无法完整阅读。

## 产品参考及可借鉴范围

以下资料在 2026-10-25 核对。产品文档可能更新；公开行为不能证明闭源模板或阈值。

| 来源 | 公开行为 | 对本插件的影响 |
|---|---|---|
| [Composer Predictions](https://learn.chatgpt.com/docs/features/composer-predictions) | 页面描述 Codex desktop：响应结束后建议，Tab 接受可编辑草稿，手动发送；使用当前 thread 已有上下文，不自行检索 memory/apps | 接受和发送分开，只用已发送内容。不能泛化为所有 ChatGPT 界面，也不能套用其用量政策 |
| [Claude prompt suggestions](https://code.claude.com/docs/en/interactive-mode#prompt-suggestions) | 同模型短后台请求，计套餐/API 用量；部分场景跳过，连续忽略后降频 | 不强制每轮出建议，用量要明确，有依据才展示 |
| [Claude desktop](https://code.claude.com/docs/en/desktop#accept-a-suggested-prompt) | 空输入且无附件展示；Tab/右箭头接受；未接受时 Enter 不发送建议 | 保留草稿、附件与命令的优先级；本插件沿用卡片与显式按钮，保留原生Tab导航，等宿主支持行内hint再考虑Tab接受 |
| [Claude session recap](https://code.claude.com/docs/en/interactive-mode#session-recap) | 面向离开后返回：会话至少三轮，上一轮结束至少三分钟，不连续两次显示；支持手动触发 | 是恢复上下文的参考，不是每轮回顾的同一产品定义 |

公开 Codex 还提供了可核验的隔离采样参考：固定提交的 [`thread_sample.rs`](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/app-server/src/thread_sample.rs#L126) 在临时 fork 中捕获一个模型响应；工具调用输出不被执行、样本文本返回空；要求源轮次是最新闭合轮，并在返回前再次比较父历史版本。它没有证明传输层绝不重试，也没有从请求中移除全部工具定义，不能把这种公开 Codex 机制等同于闭源 ChatGPT/Claude 的完整实现。

资料未公开完整生成提示词、置信阈值、裁剪算法或全部异步失效策略。这里的轮次校验和合并请求是本插件的设计，不能称为复刻闭源内部实现。

## DSH 扩展边界

核对的公开源码为 [`22ddee3`](https://github.com/deepseek-ai/deepseek-harness/tree/22ddee3792402c3e70ec5f86a63c3e3e895a2f60)，桌面安装版为 `0.2.1-rc.3`。升级宿主后应重验这些接口。

- [`conversation.input.dock` 和 `conversation.composer.dock`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/slots.ts#L289) 分别位于卡片上方和下方。公开输入契约没有通用行内预测接口。覆盖编辑器内部 DOM、占用命令 hint 或写内部 CSS 变量都不足以提供稳定的行内体验。
- [`captureInsertion` / `insertText`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/input.ts#L258) 支持版本保护的插入。通过 [`observeFixedInput`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/shortcuts/src/client/types.ts#L45) 接收本地控件仲裁后的按键，才可在正确 composer 上接受建议，并让输入法、命令菜单、焦点导航优先。
- [`SessionSnapshot`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/client/contract/snapshot.ts#L69) 没有最新轮号；标准 `useChat` 的 timeline 提供轮次边界。`turn.end.seq` 才是结束序号，turnTail 的 owner.seq 可能指向最后正文。
- [`assistant/message`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/src/types.ts#L340) 是每步消息，无 final 标志；带 `tool-call` 的说明或 `interrupted` 的前缀不等于最终答复。`user/message` 也可能是注入上下文，不能把所有 user-role 内容当人类意图。
- [`deriveMessages()`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/src/index.ts#L981) 是整个当前 model-visible surface，无法按历史 turn 安全切片。新逻辑使用实时轮次捕获，避开弃用的同步事件读取。

真正的行内预测适合由上游增加公开契约：候选与轮次绑定，宿主绘制文本，编辑器仲裁 IME/命令/选择与接受、撤销，插件只提交候选。该接口目前是上游方向，不是插件已有能力。

## 内容与生命周期原则

回顾优先保留结果、验证、限制、未决定事项。它是模型对本轮来源的整理，不是独立核验；本地检查不代表发布，轮次正常结束不代表整个任务完成。工具证据需要按调用与时间关联，“一次失败后重试通过”与“一个通过另一个失败”不能压成相同计数。

对明显只有一两句的简短正常回复，不再增加回顾。代码先过滤常见短文本，省去不必要生成；长句、列表、代码和表格交模型判断压缩价值，允许主动不返回回顾。省略是正常结果：模型不返回回顾、历史轮次没有缓存、预算耗尽、轮次异常结束时都直接不显示回顾行，也不补充任何状态文案。回顾开关关闭时不生成回顾专用请求；下一条建议打开后仍可独立生成。

建议只延续用户已有的明确意图，不重复已做工作，不把可选邀约当已授权，不替用户批准发布或合入。无法判断时不展示。词表无法识别任务是否完成，也容易误杀真实的插件开发任务。

回顾可以留在历史轮次；建议必须持续匹配最新轮次。接收结果和接受草稿时都要复核来源、模型选择与输入状态。辅助请求实际使用的推理档位与主会话选择分开记录，避免降低辅助用量反而被误判为切换模型。

短暂输入活动隐藏未消费候选；接受、关闭或失效后的候选不应复现。模型请求与正文生成隔离，无工具、无主会话写入，不阻塞继续输入。历史缓存读取不应变成批量模型回填。

## 如何判断改进有效

| 维度 | 检查方式 |
|---|---|
| 来源正确 | 当前超长轮不能被旧短轮替换；多文本块、人类输入、工具前说明、迟到结果分别测试 |
| 事实与遗漏 | 对照原文核对结果、验证、否定、时间条件、限制和待办；单独检查重要遗漏 |
| 建议价值 | 包含明确下一步、无下一步、等待批准、目标更新、真实插件开发等样例；允许空结果 |
| 生命周期 | 快速新轮、切会话、换模型、重连、重启、缓存与预算分别验证 |
| 展示与输入 | 长文本、窄窗、缩放、深浅色、中文输入法、附件、命令、Tab/Shift+Tab/Esc、一次撤销 |
| 成本 | 计数实际尝试、超时和失败，检查共享请求与重复读取；不只看输出长度 |

自动化协议测试不能证明真实模型的语义准确性；固定合成样例与 Harness 中的人工对照需要分别记录。接受率或点击率也不足以证明有用：错误建议可能被接受，关闭建议也可能只是用户已经完成任务。

## 研究依据

- [DialSummEval](https://aclanthology.org/2022.naacl-main.418/)、[对话摘要遗漏研究](https://aclanthology.org/2023.acl-long.798/)、[Faithfulness](https://aclanthology.org/2022.emnlp-main.325/) 支持将事实一致与重要遗漏分别评估，而非只比较措辞。
- [When to Show a Suggestion?](https://arxiv.org/abs/2306.04930) 与 [FQ-Eval](https://aclanthology.org/2025.emnlp-industry.188.pdf) 启发选择性展示、上下文相关与成对评估；研究任务和样本不能直接给本插件提供阈值。
- [LongMemEval](https://arxiv.org/html/2410.10813v2) 与 [Lost in the Middle](https://arxiv.org/abs/2307.03172) 提醒分别检查知识更新、弃答和证据位置，不把长上下文等同于可靠读取。
- [Anthropic context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) 强调保留决策与未解决问题；[Human–AI interaction guidelines](https://www.microsoft.com/en-us/research/uploads/prod/2019/03/AI_Guidelines_Poster_PrintQuality.pdf) 支持不确定时缩小服务范围、允许忽略和纠正。
