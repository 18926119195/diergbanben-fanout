# diergbanben-fanout 入库指南

[一分钟定位](#一分钟定位) · [沿聊天时间线看灵感](#沿聊天时间线看灵感) · [从代码反查来由](#从代码反查来由) · [走读与维护记录](#走读与维护记录)

## 一分钟定位

这是 Docuverse 的扇出旁路实验。一道问题可提出几组候选材料，写信台给出复用、扩展或暂缓的建议，批准后编译器才把指定材料送给推理模型。代码在 `docuverse/`。阅读基线为 [main · 7f800f8](https://github.com/18926119195/diergbanben-fanout/commit/7f800f87f2d7075d15cde5ca39716af709fb7b0d)。[旁路说明](FORK.md) · [开发沿革](DEVELOPMENT_HISTORY.txt)

## 沿聊天时间线看灵感

**如何读状态。** 已实现表示在所列版本找到与灵感相符的代码路径。部分实现表示已有其中一段。未实现表示已查的入口尚无对应实现。证据不足时标待确认。归档与设计文稿按资料本身的状态描述。

[本地聊天归档](docs/chat-archive/fanout-chat-history.txt) 缺逐轮时间，以下按原件顺序，以行号定位。代码日期来自 8 月 23 日与 11 月 19 日的提交。

| 编号与聊天原件 | 当时提出或观察的思路 | 当前状态与代码证据 |
| --- | --- | --- |
| <a name="idea-i01"></a>I01 · 8 月归档，[双闸界面 L2856–2860](docs/chat-archive/fanout-chat-history.txt#L2856-L2860) | 助手建议材料，先查看 key 是否存在，用户再批，之后网关才请求模型。原件保留了用户贴回的双闸界面。 | **已接主链。** 实际分为 probe、人工批准、执行，编译器生成 AllowedKeys，模型结构交给 Validator 检查。 [双闸](docuverse/src/reasoning/harnessGateway.ts) · [编译](docuverse/src/reasoning/harnessCompiler.ts) · [验证](docuverse/src/reasoning/formalValidator.ts) |
| <a name="idea-i02"></a>I02 · 8 月归档，[动作链 L4344](docs/chat-archive/fanout-chat-history.txt#L4344) | 先固定对象，再由工具推荐，写信台给三态，网关执行。 | **已实现三态。** 运动脑按规则编制计划，采纳路径落到已结算记忆。 [计划](docuverse/src/reasoning/motionBrain.ts) · [记忆](docuverse/src/reasoning/harnessContext.ts) |
| <a name="idea-i03"></a>I03 · 8 月归档，[对话事件锚 L4355](docs/chat-archive/fanout-chat-history.txt#L4355) | 用户贴出的界面区分书侧 PDF 与对话事件锚 DSH。 | **未桥接 DSH。** 当前 HUD 仍显示未桥接状态。 [HUD](docuverse/src/ui/FanoutHud.tsx) |
| <a name="idea-i04"></a>I04 · 8 月归档，[三态交互 L8317](docs/chat-archive/fanout-chat-history.txt#L8317) · [小模型预览 L8908](docs/chat-archive/fanout-chat-history.txt#L8908) | 把三态建议下钻到具体袋和 key，请小模型预览后给出逐项理由。 | **未落地于当前链。** 仍有独立的双闸组件，计划及建议来自规则型运动脑。 [双闸 UI](docuverse/src/ui/DualGatePanel.tsx) · [计划生成](docuverse/src/reasoning/motionBrain.ts) |
| <a name="idea-i05"></a>I05 · 8 月归档，[检索顺序 L10091](docs/chat-archive/fanout-chat-history.txt#L10091) | 用语义表先定章节范围，再在范围内按向量找前五个 key。 | **未落地为当前检索顺序。** 语义索引按页建节，主链先做全书槽排序，Top-K 后过滤；无交集回退。 [语义索引](docuverse/src/reasoning/semanticIndex.ts) · [检索网关](docuverse/src/reasoning/toolGateway.ts) · [离线夹具](docuverse/scripts/check-retrieval.mjs) |
| <a name="idea-i06"></a>I06 · 8 月归档，[索引分层 L12117](docs/chat-archive/fanout-chat-history.txt#L12117) · [L12512](docs/chat-archive/fanout-chat-history.txt#L12512) · [L12827](docs/chat-archive/fanout-chat-history.txt#L12827) | 书侧 OCR、工具索引和每个模型各有上下文，统一通过键关联；工具嵌入独立索引回原槽。 | **部分实现。** 编译器已把本轮输入投影为独立块，但书侧槽仍包含 `vBook`，完整上下文分层未落地。 [书侧类型](docuverse/src/reasoning/pipelineA.ts#L31-L58) · [编译器](docuverse/src/reasoning/harnessCompiler.ts) |

现有微循环覆盖若干动作分支，11 月维护版本修复了超过重试上限的额外请求；完整增量补料仍处于部分实现。 [微循环](docuverse/src/reasoning/microLoop.ts) · [整理 PR](https://github.com/18926119195/diergbanben-fanout/pull/1)

## 从代码反查来由

- [FanoutHud](docuverse/src/ui/FanoutHud.tsx) → [fanoutRunner](docuverse/src/reasoning/fanoutRunner.ts) 回看 [I01](#idea-i01)–[I04](#idea-i04)，串起三态、审批、infer-ops 与采纳。
- [toolGateway](docuverse/src/reasoning/toolGateway.ts) 回看 [I05](#idea-i05)。检索结果的 `draftKeys` 是候选，`faultInKeys` 则来自批准后实际打开的内容。
- [pipelineA](docuverse/src/reasoning/pipelineA.ts) → [harnessCompiler](docuverse/src/reasoning/harnessCompiler.ts) 回看 [I06](#idea-i06)，分别负责书槽和模型输入投影。[详细实现审计](docs/IMPLEMENTATION_STATUS.md)

## 走读与维护记录

想看“语义范围命中，为什么仍返回页外”，打开 [三槽夹具](docuverse/scripts/check-retrieval.mjs)，直接比较同一语义范围下 Top-K=1 的页外回退与 Top-K=2 的页内结果，再回 [I05](#idea-i05) 查最初设想。若要复跑，可在 `docuverse/` 按 [本地手册](docs/LOCAL_SETUP.md) 安装依赖后运行 `node scripts/check-retrieval.mjs`。本次 Node 24 的生产构建和 `npm run check:system` 通过；真实 OCR、embedding、推理与部署未实跑。更新条目时保留原件行号和编号，补充可以查看的实际调用点及所在版本。

**指南如何更新。** 以仓库和版本划定范围，从聊天提取原始目标，再用代码与产物校正对当时决策的理解。新证据出现时，回到原编号修订记录。这种读法借鉴了钱学森的系统工程和工程控制论。 [《组织管理的技术——系统工程》](https://doi.org/10.13255/j.cnki.jusst.2011.06.020) · [《工程控制论》](https://openlibrary.org/books/OL49218199M/Engineering_cybernetics)
