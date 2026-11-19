# diergbanben-fanout 入库指南

这个工程验证一问多路径的推理如何在有限调用预算内完成，并能追溯每个被批准注入的 key。先查 [功能审计](docs/IMPLEMENTATION_STATUS.md) 和本页的当前实测，再从 `docuverse/` 启动。审阅基线为 [main · 7f800f8](https://github.com/18926119195/diergbanben-fanout/commit/7f800f87f2d7075d15cde5ca39716af709fb7b0d)。

## 工作路径

| 要看的边界 | 入口 |
| --- | --- |
| 书页导入、可检索槽和候选袋 | [PdfUploadPanel](docuverse/src/ui/PdfUploadPanel.tsx) → [indexGate](docuverse/src/reasoning/indexGate.ts) → [toolGateway](docuverse/src/reasoning/toolGateway.ts) |
| 写信台三态与批准了哪些内容 | [FanoutHud](docuverse/src/ui/FanoutHud.tsx) → [fanoutRunner](docuverse/src/reasoning/fanoutRunner.ts) → [motionBrain](docuverse/src/reasoning/motionBrain.ts) → [harnessGateway](docuverse/src/reasoning/harnessGateway.ts) |
| 上下文和输出边界 | [harnessCompiler](docuverse/src/reasoning/harnessCompiler.ts) → [infer-ops](docuverse/api/protocol/infer-ops.ts) → [formalValidator](docuverse/src/reasoning/formalValidator.ts) → [harnessContext](docuverse/src/reasoning/harnessContext.ts) |

[启动手册](docs/LOCAL_SETUP.md) 面向本机运行。[旁路说明](FORK.md)、[设计共识](docs/扇出改造-设计共识与接续手册.md) 与 [开发时间线](DEVELOPMENT_HISTORY.txt) 说明各阶段沿革及原件定位。

## 从聊天到主链

| 时间与来源 | 当前实现和差距 |
| --- | --- |
| 8 月 23 日，写信台三态、运动脑与接受状态。聊天无逐轮日期，用相同记录的行定位。 [聊天 L4344](docs/chat-archive/fanout-chat-history.txt#L4344) · [提交 c5ac97c](https://github.com/18926119195/diergbanben-fanout/commit/c5ac97c) | 规则型 MotionPlan 和 accepted/rejected 分区已落码。生成模型自主规划与拟议的三态、运动脑交互合并仍待开发。 |
| 8 月 23 日，probe、人批、网关和微循环。 [聊天 L2856](docs/chat-archive/fanout-chat-history.txt#L2856) · [提交 4e916de](https://github.com/18926119195/diergbanben-fanout/commit/4e916de) | 编译后的 AllowedKeys 交给 infer-ops 并经 Validator 落 formalOps。部分动作进入微循环，完整增量补料仍是缺口。11 月 19 日的 [整理](https://github.com/18926119195/diergbanben-fanout/pull/1) 修复达到预算后的额外请求。 |
| 用户提出语义先限制范围再做向量 Top-K。 [聊天 L10091](docs/chat-archive/fanout-chat-history.txt#L10091) | 当前语义节点按页构建，代码先全书槽排名，Top-K 后相交过滤，无交集时回退到原候选。拟议的范围先行与完整章节语义树待做。 |
| 用户要求书侧、检索与模型上下文相互独立。 [聊天 L12512](docs/chat-archive/fanout-chat-history.txt#L12512) · [L12827](docs/chat-archive/fanout-chat-history.txt#L12827) | 编译器已限定注入范围，但 A1 槽仍带向量字段。独立索引分层、DSH 对话事件锚、跨书链与 OCR 全过程统一台账未接成完整主链。 |

## 验收与反馈

```sh
cd docuverse
npm ci --ignore-scripts
npm run build
npm run check:system
npm run dev
```

Node 24.22.1 实跑安装、构建、[微循环](docuverse/scripts/check-system.mjs)和[检索](docuverse/scripts/check-retrieval.mjs)通过。默认全失败调用 3 次、零重试失败 1 次、首次成功 1 次、重试成功 2 次，实际请求与计划台账一致。三槽夹具中 Top-K=1 回退到页外候选，Top-K=2 返回页内候选。真实 OCR、embedding、推理服务和生产部署待复核。`dev` 打开本机应用。

1. **保住现行边界**。固定书槽、问题、候选袋、审批 key、模型身份与预算。逐次记录 `draftKeys`、`memberKeys`、`faultInKeys`、AllowedKeys、Validator 结果、调用和采纳。验收要求批准外 key 的注入为 0，实际请求数等于台账，拒绝条目进入永久查询池为 0。加超时、坏返回和改预算作为扰动。
2. **把检索顺序变更做成对照**。保持相同页面 gold 和 Top-K，再加多页、无交集、页级命中条件。分别测页内命中、回退率、假阳性和成本。让检索负责人确认允许回退的条件和阈值，然后实现范围优先方案；保持原夹具可复验旧行为。
3. **分别完成上下文与动作集成**。给索引分层和增量补料各加显式输入输出契约。Harness 维护者先验 AllowedKeys 和人工审批协议，再接模型、缓存和记忆。发现越界时从首个产生非法 key 的步骤回查，发现复用错误时核对模型身份和采纳状态。变更 PR 要能由任务输入、审批、执行和证据追到同一版代码。

## 方法依据

本指南把总体设计落实为边界、目标和任务接口，把工程控制中的反馈落实为观测、判据和纠偏。维护者用原始协作记录、代码和固定样本共同核验定性判断与量化结果，据此决定下一轮行动。[《工程控制论》](https://openlibrary.org/books/OL49218199M/Engineering_cybernetics) · [《组织管理的技术——系统工程》](https://doi.org/10.13255/j.cnki.jusst.2011.06.020) · [《一个科学新领域——开放的复杂巨系统及其方法论》](https://cnki.istiz.org.cn/kcms/detail/detail.aspx?dbcode=CPFD&dbname=cpfd1999&filename=ZGXC199008001001)
