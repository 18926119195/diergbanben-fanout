# 实现状态审计（代码为准）

最后核对基准：`2801b10f262868381392381aeb76db5c3f078397`

本文档用于区分设计目标、部分实现与当前扇出主链，避免把“存在文件”误写成“完整能力已交付”。

## 状态标签

- **已实现**：当前可从应用主链进入并执行。
- **部分实现**：模块或基础行为已存在，但未覆盖完整目标。
- **未接主链**：有相关代码/协议，但不是当前扇出主入口。
- **未实现**：没有发现对应实现，或当前文档明确记为后续目标。

## 当前扇出主链

```text
PdfUploadPanel
  -> indexGate.finalizeIndex()
  -> pipelineA.buildBookIndex()/reembedBookIndex()
  -> buildSemanticIndex()
  -> prepareLetterDesk()
  -> executeRetrieve()
  -> executeCompose()
  -> buildMotionPlansForDesk()
  -> 双闸 probe / 人工批准
  -> executeLetterDesk()
  -> executeHarnessMotion() / inferWithMicroLoop()
  -> HarnessCompiler
  -> executeInferOps()
  -> /api/protocol/infer-ops
  -> validateFormalPath()
  -> FanoutPath / ActionRecord
  -> accept / reject / reuse
```

## 能力状态

| 模块 | 状态 | 证据入口与边界 |
|---|---|---|
| PDF 导入与 OCR | 已实现 | `docuverse/src/data/pdfImport.ts`、`ocrService.ts` |
| BookIndex 建库 | 已实现 | `pipelineA.ts`、`indexGate.ts` |
| 语义节基础索引 | 部分实现 | `semanticIndex.ts`；按页建立节节点与槽出处，不是完整目录树 |
| retrieve | 已实现 | `toolGateway.ts::executeRetrieve`；输出 draft 候选，不注入正文 |
| compose | 已实现 | `toolGateway.ts::executeCompose`、`fanoutCompose.ts` |
| 写信台三态 | 已实现 | `letterDesk.ts`、`fanoutRunner.ts` |
| MotionPlan | 已实现规则型流程 | `motionBrain.ts`；不应称为完整 LLM 规划器 |
| probe / 人工批准 | 已实现主要动作 | `harnessGateway.ts`、`DualGatePanel.tsx` |
| HarnessCompiler | 已实现基础版本 | `harnessCompiler.ts`；生成 blocks / AllowedKeys，不含完整章节树排版 |
| infer-ops | 已实现主链出口 | `toolGateway.ts::executeInferOps`、`api/protocol/infer-ops.ts` |
| FormalValidator | 已实现 | `formalValidator.ts`；结构检查，不是形式化数学证明 |
| micro loop | 部分实现 | `microLoop.ts`；默认最多 2 次重试，不等于完整增量补料架构 |
| accept / reject | 已实现主要流程 | `harnessContext.ts`、`FanoutHud.tsx` |
| reuse | 已实现主要流程 | `toolGateway.ts::executeReuse`、`toolArchive.ts` |
| DSH | 未桥接 | `FanoutHud.tsx` 明确显示尚未桥接 |
| 完整章节语义树 | 部分实现 | 当前语义索引是页级基础版本 |
| OCR 全过程统一 ActionRecord | 未实现 | 设计手册 §10.2 标记未做 |
| 写信人 LLM 自动生成木块/坐标 | 未实现 | 设计手册 §10.2 标记未做 |
| 跨书写信与 forbidDirections | 未实现 | 设计手册 §10.2 标记未做 |
| 旧 A/B 对照台 | 未接主链/文档滞后 | 当前主 HUD 未挂旧对照台；设计手册仍有旧组件引用 |

## 主链不变量（维护时应检查）

- retrieve 的 `premiseKeys` 为空，检索候选不等于已注入材料。
- `memberKeys` 是候选袋成员身份，不等同于实际注入文本。
- MotionPlan 的 key 必须受当前推理单元的成员 key 范围约束。
- Compiler 输出的 key 必须受计划和允许集合约束。
- `AllowedKeys` 是模型可以引用的上界；模型输出仍需 Validator 校验。
- accept 才进入 settled；reject 默认不进入永久记忆检索池。
- reuse 不应调用主模型，但仍应记录本轮复用动作。
- fingerprint 必须包含模型身份等影响推理结果的因素。

## 当前已知文档差异

`docs/扇出改造-设计共识与接续手册.md` 包含阶段性设计记录，部分实现状态未同步：

- 旧缺口表仍将 `buildMotionPlans`、semantic index、双闸和 micro loop 列为待做；当前代码已有基础实现。
- 旧代码地图仍引用 `GatewayFormalizeAbPanel.tsx`；当前主 HUD 使用 `DualGatePanel` 和 `WorkingMemoryPanel`。
- 设计目标中的完整多级章节语义树、按节层级编译和增量 fault-in 仍未完整落地。

修改架构文档时请保留历史决策，但显式标注“历史快照”“当前状态”和“目标设计”。

## 验证边界

此状态审计是源码和文件树检查，不代表已执行本地构建或端到端验收。运行验证：

```bash
cd docuverse
npm ci
npm run lint
npm run build
```
