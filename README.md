首次接手请读[入库指南](ONBOARDING.md)，其中列有开发时间线、当前实现和第一项验收任务。

## 先看这里

**第一次访问这个仓库，请从此处开始。** 这个仓库的工程目标是写信台多路径推理可追踪且有调用预算。

- [开发聊天、实现沿革和代码定位](DEVELOPMENT_HISTORY.txt) 按菜单编号阅读。每项可回到原句、Git 提交、源码行及验证结果。
- [维护入口与六库关系](MAINTAINERS.txt) 用来定位应用入口、同类实验和读码顺序。
- [历史文件路径](docs/archive/PATHS.txt) 用来回查原件搬迁和内容相同的旧路径。
- [六库总菜单](https://github.com/18926119195/docuverse/blob/main/MAINTAINERS.txt) 按要解决的问题选择仓库。

### 怎样观测和纠偏

借用钱学森《工程控制论》的工程视角，把开发目标、输入、可观测状态、反馈和纠偏落实到协作与验收。每次变更都应能沿这条链回查。

| 项目 | 本仓库的检查点 |
| --- | --- |
| 输入 | 问句、候选袋、工作集和计划预算 |
| 输出 | MotionPlan、证据块、formalOps 和尝试记录 |
| 可观测验收 | 实际调用数等于台账尝试数，零重试全失败只有 1 次调用；Top-K 范围重合与回退可复现 |
| 偏差处理 | 如果次数对不上，先查 microLoop 和计划台账。改变检索顺序时，记录候选池、页范围、Top-K 与最终 keys，保留相同夹具作对照。 |

进入 `docuverse/`运行以下命令。当前离线夹具覆盖微循环调用计数、提前成功、终止失败、页级过滤与回退。真实模型、OCR 和生产部署的行为需要有相应环境才能验证。

```sh
cd docuverse
npm ci --ignore-scripts
npm run build
npm run check:system
```

提交 PR 时附时间线编号、基线提交、实际入口、预期与实测。如果实测偏离预期，用同一输入记录最小复现并附相关台账或模型请求中的非敏感字段。行为修正通过同一检查后，将决定、代码和结果补回时间线。已发布版本出现回归时，先保留失败证据，再由维护者评估回退对应变更或修正向前。

---

# diergbanben-fanout

> 面向文档推理、key* 注入监督与多路径扇出的独立工程仓库。

本仓库不是通用 ReAct Agent，而是一个受约束的 Agent Harness / 推理编排实验：检索、组合、人工批准、网关执行、编译、校验和记忆回流被拆为可审计阶段。

## 仓库导航

| 我要做什么 | 从这里进入 |
|---|---|
| 先快速理解项目 | [项目定位与演示流程](#项目定位) |
| 本机运行和测试 | [运行指南](#运行应用) · [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) |
| 面试讲解与演示 | [docs/INTERVIEW_GUIDE.md](docs/INTERVIEW_GUIDE.md) |
| 核对什么已实现、什么没有 | [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) |
| 阅读完整设计与接续记录 | [docs/扇出改造-设计共识与接续手册.md](docs/扇出改造-设计共识与接续手册.md) |
| 查看推理试点说明 | [docuverse/REASONING_PILOT.md](docuverse/REASONING_PILOT.md) |
| 查看后端部署说明 | [docuverse/docs/VERCEL_BACKEND.md](docuverse/docs/VERCEL_BACKEND.md) |
| 了解旁路库边界 | [FORK.md](FORK.md) |
| 查看工程交接说明 | [docuverse/HANDOFF.md](docuverse/HANDOFF.md) |

## 项目定位

主链为：

```text
PDF / OCR
  -> BookIndex 与 slot key*
  -> 全书槽级混合排序、Top-K 的页级过滤及 draftKeys
  -> ComposePolicy 候选推理袋
  -> 写信台 reuse / expand / deferred
  -> MotionPlan 与双闸批准
  -> HarnessCompiler 编译 blocks 与 AllowedKeys
  -> 网关调用 infer-ops
  -> FormalValidator 校验
  -> 路径展示、采纳、拒绝或复用
```

核心边界：

- 模型不能绕过网关私自读取全文。
- `draftKeys` 是检索候选，不等于已注入正文。
- `memberKeys` 描述候选袋，`faultInKeys` 描述本轮批准打开的 key。
- `AllowedKeys` 是编译后允许模型引用的 key 上界。
- `infer-ops` 是扇出推理的主执行出口，不把 classic infer 作扇出主链。
- accepted 路径进入 settled memory；rejected 路径默认不进入永久记忆检索池。
- 当前推理模型与 embedding 模型在 `docuverse/src/reasoning/modelRuntimeConfig.ts` 锁定。

## 运行应用

```bash
cd docuverse
npm install
npm run dev
```

本机浏览器访问：

```text
http://127.0.0.1:5173/
```

完整环境变量、扫描件测试和一键脚本见 [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)。

## 推荐演示路径

1. 上传扫描 PDF，不勾选“PDF 有可用文字层”。
2. 等待“索引就绪”。
3. 在扇出 HUD 输入与文档有关的问题。
4. 打开写信台，查看候选 memberKeys 和 reuse/expand/deferred 决策。
5. 确认执行，观察 MotionPlan、双闸、formalOps 和 Validator。
6. 点击 key* 前提跳回对应 PDF 页。
7. accept 一条路径，再询问相似问题观察 reuse。

## 核心代码入口

| 职责 | 文件 |
|---|---|
| PDF 导入与 OCR | `docuverse/src/data/pdfImport.ts`、`docuverse/src/data/ocrService.ts` |
| 建库与索引门禁 | `docuverse/src/reasoning/pipelineA.ts`、`indexGate.ts` |
| 语义索引基础实现 | `docuverse/src/reasoning/semanticIndex.ts` |
| 检索、组合、推理、复用网关 | `docuverse/src/reasoning/toolGateway.ts` |
| 写信台与扇出编排 | `docuverse/src/reasoning/letterDesk.ts`、`fanoutRunner.ts` |
| MotionPlan 与双闸 | `docuverse/src/reasoning/motionBrain.ts`、`harnessGateway.ts` |
| 上下文编译 | `docuverse/src/reasoning/harnessCompiler.ts` |
| Validator 与 formalOps | `docuverse/src/reasoning/formalValidator.ts`、`formalPath.ts` |
| 用户主界面 | `docuverse/src/ui/FanoutHud.tsx`、`DualGatePanel.tsx` |
| infer-ops 服务入口 | `docuverse/api/protocol/infer-ops.ts` |

## 实现状态概览

| 能力 | 状态 |
|---|---|
| PDF / OCR / `BookIndex` | 已实现 |
| retrieve / compose / 写信台三态 | 已实现 |
| MotionPlan 与双闸主要流程 | 已实现 |
| HarnessCompiler 与 infer-ops 主链 | 已实现 |
| FormalValidator | 已实现 |
| Accept / Reject / Reuse | 已实现主要流程 |
| 完整章节语义树与 provenance | 部分实现 |
| Micro loop 增量补料 | 部分实现 |
| DSH 对话事件锚 | 未桥接 |
| OCR 全过程统一网关账本 | 未实现 |
| 跨书阶段与多书写信 | 未实现 |

完整状态和证据入口见 [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)。

## 工程原则

1. 文档区分已实现、部分实现、未接主链和未实现。
2. 运动脑、网关、编译器和主推理脑职责分离。
3. 模型输出经过 FormalValidator 后才进入有效推理结果链。
4. 换模型或身份策略不得误命中旧 reuse 资产。
5. 未采纳或 rejected 结果不得被描述成永久记忆。
6. 核心状态机、网关和校验边界优先补测试。

## 面向面试工程评审

面试讲解、关键技术问题、演示脚本和已知限制汇总在：

- [面试导览](docs/INTERVIEW_GUIDE.md)
- [实现状态审计](docs/IMPLEMENTATION_STATUS.md)

讲解时应明确项目定位：这是受约束的 Agent Harness 原型，不是完整自治 ReAct 系统。
