# diergbanben-fanout

从 `diergbanben-` **旁路复制**的独立改造库。

## 本库目标

提问 → 检索相关段落（`key*`）→ 并行推理 → **多路径**呈现；每条路径可回溯前提段落、结论、生成步骤。

## 已落地（相对原库）

- Docuverse **大球面排页 → 扑克绕圈**（书序）
- 工具网关 `retrieve` / `infer-ops` + `ActionRecord` 存档
- 扇出 runner + 右侧 HUD（提问 / 路径切换 / 采纳 / 步骤）
- 场景内 **箭头层**：前提页 → 分色步骤珠 → 结论端

## 边界

- **不要**把本库改动推回原库 `diergbanben-`
- 本版是编排扇出，不是完整 ReAct
- 单锁 Pilot 默认隐藏，可在 HUD 打开调试
