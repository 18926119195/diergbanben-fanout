# diergbanben-fanout

面向文档推理、key* 注入监督和多路径扇出的独立工程仓库。

> 本仓库是从 `diergbanben-` 旁路复制的独立改造库，不推回原仓库。

## 项目定位

本项目不是通用 ReAct Agent，也不追求让模型自由调用任意工具。它围绕一条受约束的推理链工作：

```text
PDF 上传与 OCR
  -> BookIndex + slot 物理索引
  -> 节级检索与槽级 draftKeys
  -> ComposePolicy 生成候选推理袋
  -> 写信台选择 reuse / expand / deferred
  -> MotionPlan + 双闸批准
  -> HarnessCompiler 编译 AllowedKeys 与 blocks
  -> 网关调用 infer-ops
  -> FormalValidator 校验
  -> 路径展示、accept/reject 或 reuse
```

核心设计原则：

- 模型不能绕过网关私自读取全文。
- 棋子式 `key*` 是正文/槽位的稳定身份；标题和语义不能写入 key 身份公式。
- 检索只产生候选 key，真正注入由网关和用户批准的写信行决定。
- 推理结果通过 formalOps、ActionRecord、pathMarker 和 fingerprint 可回溯。
- accept 后才进入已结算记忆；reject 默认丢弃，重复拒绝模式进入 forbid 列表。
- 当前主推理模型固定为 DeepSeek-V4-Flash，Embedding 固定为 Qwen3-VL-Embedding-8B。

## 快速运行

```bash
cd docuverse
npm install
npm run dev
```

浏览器访问：

```text
http://127.0.0.1:5173/
```

详细步骤、密钥代理和脚本见：

- `docs/LOCAL_SETUP.md`
- `docuverse/scripts/setup-local.sh`
- `docuverse/scripts/setup-local.ps1`

## 面试演示建议

推荐演示下面一条路径：

1. 上传扫描 PDF，不勾选“PDF 有可用文字层”。
2. 等待索引就绪。
3. 在扇出 HUD 输入与 PDF 内容相关的问题。
4. 打开写信台，观察候选、成员键和三态决策。
5. 确认执行，观察正式推理、formalOps 和双闸行为。
6. 点击 key* 前提跳回原 PDF 页。
7. accept 一条路径，再问相似问题观察 reuse。
8. 尝试拒绝或打开双闸，观察 pending、settled 和 forbid 状态变化。

演示时重点解释：

- 为什么 retrieve 与 infer 是两层网关动作。
- 为什么 memberKeys 与 fingerprint 不是同一件事。
- 为什么 LLM 不能直接获得���意全文。
- 为什么结果校验在模型输出之后，不能只相信模型返回格式。
- 为什么 accept/reject 会改变下一轮的记忆投影。

## 架构入口

```text
docuverse/src/data/pdfImport.ts       PDF 导入与页图生成
docuverse/src/reasoning/indexGate.ts  OCR 后建库与索引就绪门
docuverse/src/reasoning/pipelineA.ts  BuildIndex / key* / embedding
docuverse/src/reasoning/semanticIndex.ts
                                      页级语义节与 SlotProvenance 基础实现
docuverse/src/reasoning/toolGateway.ts
                                      retrieve / compose / infer-ops / reuse 网关
docuverse/src/reasoning/fanoutRunner.ts
                                      prepareLetterDesk / executeLetterDesk
docuverse/src/reasoning/letterDesk.ts
                                      写信台三态与预算
docuverse/src/reasoning/motionBrain.ts
                                      MotionPlan 规则型生成
docuverse/src/reasoning/harnessGateway.ts
                                      probe / 人批 / gateway 执行
docuverse/src/reasoning/harnessCompiler.ts
                                      HarnessContext 编译为 blocks / AllowedKeys
docuverse/src/reasoning/microLoop.ts
                                      Validator reject 后的受限重试
docuverse/src/reasoning/formalValidator.ts
                                      key 白名单、前提覆盖、推理链校验
docuverse/src/ui/FanoutHud.tsx        用户主工作台
docuverse/src/ui/DualGatePanel.tsx    双闸批准界面
docuverse/src/ui/WorkingMemoryPanel.tsx
                                      expanded / collapsed 当前工作集
docuverse/src/ui/WorkingMemoryPanel.tsx
                                      当前工作集展示入口
docuverse/api/protocol/infer-ops.ts   服务端 infer-ops 路由
docuverse/api/_lib/protocol/inferOpsCore.ts
                                      服务端 infer-ops 核心协议
```

## 已实现与未实现边界

| 能力 | 状态 | 说明 |
|---|---|---|
| PDF/OCR/建 `BookIndex` | 已实现 | 扫描件走 OCR，索引就绪后可检索 |
| 节级到槽级检索 | 基础实现 | 当前为页级语义节与启发式标题，不是完整章节树 |
| ComposePolicy | 已实现 | 单槽、同页、邻接窗、跨页组合 |
| 写信台三态 | 已实现 | reuse / expand / deferred |
| MotionPlan | 已实现规则型流程 | 人可审阅并改写决策，尚无完整 LLM Motion Brain |
| 双闸 probe / approval | 已实现主要动作 | scopeRequest、faultIn、部分 expand 可进入人批 |
| HarnessCompiler | 已实现基础版本 | 读取 `BookIndex` ��生成 blocks / AllowedKeys |
| infer-ops 主链 | 已实现 | 扇出执行入口使用 `/api/protocol/infer-ops` |
| FormalValidator | 已实现 | 校验偷键、前提丢失、薄推理和最小结构 |
| Micro loop | 部分实现 | 最大重试数可配置；不是完整增量 fault-in 编译器循环 |
| Accept/Reject/Reuse | 已实现主要流程 | 需要结合持久化边界做进一步产品化 |
| DSH 对话事件锚 | 未桥接 | UI 中明确标记尚未桥接 |
| 完整章节/节树与 provenance | 部分实现 | 当前基础是按页建立语义节和槽归属 |
| OCR 全过程与网关账本统一 | 未实现 | OCR 和推理账本尚未完全统一 |
| 跨书检索与写信 | 未实现 | 当前以单文档执行为主 |
| LLM 自动提出木块坐标 | 未实现 | 自动规划仍以规则型状态为主 |
| classic infer 扇出主链 | 未使用 | 扇出代码主入口为 infer-ops；仓库仍可能保留其他协议接口 |

## 不要混淆的概念

- `draftKeys`：检索草稿候选，不是已注入正文。
- `memberKeys`：候选推理袋由哪些 key组成。
- `AllowedKeys`：编译和模型推理中允许使用的 key 上界。
- `faultInKeys`：本轮请求打开并注入的 key。
- `fingerprint`：由推理方式、成员键和模型组成的复用身份。
- `pathMarker`：压缩后的结算路径标记，不是完整聊天记录。
- `pending`：推理已生成但尚未 accept/reject。
- `settled`：accept 后进入已结算资产。
- `discarded`：reject 后不进入后续记忆检索池。

## 文档导航

- 本机运行：`docs/LOCAL_SETUP.md`
- 项目边界：`FORK.md`
- 架构与接续：`docs/扇出改造-设计共识与接续手册.md`
- 推理试点说明：`docuverse/REASONING_PILOT.md`
- 后端部署：`docuverse/docs/VERCEL_BACKEND.md`
- 交接说明：`docuverse/HANDOFF.md`

## 工程原则

面向维护与面试评审时，应优先遵循以下原则：

1. 文档只记录状态，不把设计草案伪装成已实现。
2. 只有网关能注入 key 对应全文；运动脑和编译器职责分离。
3. 模型返回未经过 FormalValidator，不进入 accepted 结果链。
4. 新模型/新身份策略不得误命中旧 reuse 资产。
5. reject 和未采纳结果不进入永久记忆检索池。
6. 核心模块必须保留类型、作用、入口和退出不变量。
7. 每次改动优先补状态机或网关边界测试，再做 UI 优化。
