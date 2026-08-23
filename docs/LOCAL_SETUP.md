# 本机部署与浏览器测试

在**你自己的电脑**上跑 Docuverse 扇出推理（扫描 PDF → OCR → 建库 → infer-ops 扇出）。

> Cloud Agent 里的 `127.0.0.1:5173` 是云端 VM，不是你的本机。本机测试请按本文操作。

---

## 前置条件

| 项 | 要求 |
|----|------|
| Node.js | **18+**（推荐 20 LTS） |
| npm | 随 Node 安装 |
| Git | 用于 clone |
| 浏览器 | Chrome / Edge 最新版 |
| 网络 | 可访问硅基流动、智谱 API（经 Vite 代理） |

检查：

```bash
node -v
npm -v
```

---

## 1. 克隆仓库

```bash
git clone https://github.com/18926119195/diergbanben-fanout.git
cd diergbanben-fanout/docuverse
```

---

## 2. 安装依赖

```bash
npm install
```

---

## 3. 环境变量（可选）

本地 `npm run dev` 时，Vite 会使用 `vite.config.ts` 里的代理密钥连接 OCR / LLM（与云端 demo 相同栈）。

若你有自己的 Key，或 demo 密钥失效，复制并编辑：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写（**勿提交 git**）：

```env
ZHIPU_API_KEY=你的智谱密钥
LLM_API_KEY=你的硅基流动密钥
```

不填也能先试跑；OCR / 推理失败时再补 Key。

---

## 4. 启动开发服务器

```bash
npm run dev
```

成功输出示例：

```text
VITE v8.x  ready
➜  Local:   http://127.0.0.1:5173/
```

---

## 5. 浏览器打开

在本机浏览器访问：**http://127.0.0.1:5173/**

- 不要用 Cursor Cloud Agent 的 Preview（那是云端）
- 若白屏：DevTools → Network 看 `main.tsx` 是否 **200**；Console 看红色报错

---

## 6. 推荐测试流程（扫描 PDF + 扇出推理）

1. 左上角 **上传 PDF**
   - **不要勾选**「PDF 有可用文字层」（扫描件走 OCR）
   - 等待「索引就绪」绿色提示
2. 右侧 **扇出 HUD**
   - 输入与 PDF 相关的问题
   - **打开写信台** → 查看组合单元 → **确认执行**
3. 检查
   - 多条推理路径、formalOps 步骤条
   - 点击 key* 跳转到 PDF 页
   - 双闸（若有 faultIn/scopeRequest）批准后再执行
   - 采纳一条路径后，换类似问题看是否 **reuse**

---

## 7. 一键脚本

**macOS / Linux：**

```bash
cd diergbanben-fanout/docuverse
chmod +x scripts/setup-local.sh
./scripts/setup-local.sh
```

**Windows PowerShell：**

```powershell
cd diergbanben-fanout\docuverse
.\scripts\setup-local.ps1
```

脚本会：`npm install` → 若无 `.env.local` 则从 example 复制 → 启动 `npm run dev`。

---

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| `ERR_CONNECTION_REFUSED` | 未运行 `npm run dev`，或不在 `docuverse/` 目录 |
| 端口 5173 被占用 | 关掉占用进程，或 `npm run dev -- --port 5174` |
| OCR / Embedding 失败 | 检查 `.env.local` 密钥；看终端 Vite 代理报错 |
| 页面白屏、#root 空 | Network 中 JS 是否 Pending；Console 红色错误 |
| WebGL 警告 | 一般可忽略，不影响扇出 HUD |

---

## 9. 生产构建（可选）

```bash
npm run build
npm run preview
```

完整协议 API 部署见 `docuverse/docs/VERCEL_BACKEND.md`（Vercel）。

---

## 10. 与 Cloud Agent 协作

| 场景 | 做法 |
|------|------|
| Agent 在云端改代码 | 本机 `git pull` 后重新 `npm run dev` |
| 稳定 UI 测试 | **始终在本机浏览器** 打开 `127.0.0.1:5173` |
| 设计文档 | `docs/扇出改造-设计共识与接续手册.md` |
