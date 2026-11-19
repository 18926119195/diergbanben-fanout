# 实现状态审计（代码为准）

最后核对提交：`2801b10f262868381392381aeb76db5c3f078397`

本文档用于避免把设计稿、部分实现和实际主链混在一起。

## 状态标签

- `已实现`：当前可从代码主链进入并执行。
- `部分实现`：有类型或模块，但未覆盖完整目标。
- `未接主链`：存在相关代码或文档，但不是当前扇出主入口。
- `未实现`：没有发现对应代码，或明确由现有文档标记为下一阶段。

## 主链状态

| 模块 | 状态 | 证据入口 |
|---|---|---|
| PDF 导入/OCR | 已实现 | `docuverse/src/data/pdfImport.ts`、`ocrService.ts` |
| BookIndex | 已实现 | `pipelineA.ts`、`indexGate.ts` |
| 语义节基础索引 | 部分实现 | `semanticIndex.ts`、`indexGate.ts` |
| retrieve | 已实现 | `toolGateway.ts::executeRetrieve` |
| compose | 已实现 | `toolGateway.ts::executeCompose` |
| 写信台三态 | 已实现 | `letterDesk.ts`、`fanoutRunner.ts` |
| MotionPlan | 已实现规则型流程 | `motionBrain.ts` |
| probe/human gate | 已实现主要动作 | `harnessGateway.ts`、`DualGatePanel.tsx` |
| HarnessCompiler | 已实现基础版本 | `harnessCompiler.ts` |
| infer-ops | 已实现主链出口 | `toolGateway.ts::executeInferOps`、`api/protocol/infer-ops.ts` |
| FormalValidator | 已实现 | `formalValidator.ts` |
| micro loop | 部分实现 | `microLoop.ts`，`MAX_MICRO_LOOPS=2` |
| accept/reject | 已实现主要流程 | `harnessContext.ts`、`FanoutHud.tsx` |
| reuse | 已实现主要流程 | `toolGateway.ts::executeReuse`、`toolArchive.ts` |
| DSH | 未实现 | `FanoutHud.tsx` 明确标记未桥接 |
| A/B 对照台 | 未接主链 | 当前主链未挂载该组件；旧手册引用滞后 |
| 完整章节语义树 | 部分实现 | 只有页级节与启发式标题基础结构 |
| 自动多轮 FAULT_IN | 部分实现 | micro loop 存在，但目标增量循环未完整落地 |

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
  -> DualGatePanel / 人工批准
  -> executeLetterDesk()
  -> executeHarnessMotion()/inferWithMicroLoop()
  -> HarnessCompiler
  -> executeInferOps()
  -> /api/protocol/infer-ops
  -> validateFormalPath()
  -> FanoutPath/ActionRecord
  -> accept/reject/reuse
```

## 主链不变量

- retrieve 的 `premiseKeys` 必须为空。
- `memberKeys` 是候选袋身份，不能等同于实际注入文本。
- MotionPlan 输出不允许包含所有候选袋之外的 key。
- Compiler 每个 `key` 都必须来自批准后的 faultIn/expand 集或 reuse 指针集。
- `AllowedKeys` 是推理使用集合的上界。
- 模型的 `usedKeys` 和所有 formalOps `keys` 都不得超出 AllowedKeys。
- accept 后才进入 settled；reject 不进入永久记忆检索池。
- reuse 不调用主推理模型，仍创建新 ActionRecord。
- 换模型必须改变 fingerprint，不得误命中旧结论。

## 文档同步规则

未来提交如果改动以下模块，应同步审计文档：

- `toolGateway.ts`
- `fanoutRunner.ts`
- `motionBrain.ts`
- `harnessGateway.ts`
- `harnessCompiler.ts`
- `microLoop.ts`
- `formalValidator.ts`
- `harnessContext.ts`
- `/api/protocol/infer-ops.ts`

提交文档时使用状态标签，不用“已完成”的绝对措辞描述部分实现。
