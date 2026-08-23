# 克隆与本机推送 GitHub

## 本仓库说明

- 目录名：`diergbanben-fanout`
- 性质：从 `diergbanben-` **旁路复制**的扇出改造独立库（见根目录 `FORK.md`）
- 设计共识接续：[扇出改造-设计共识与接续手册.md](./扇出改造-设计共识与接续手册.md)

---

## 在另一台电脑克隆

**私有库（已推送）：** https://github.com/18926119195/diergbanben-fanout

```bash
git clone https://github.com/18926119195/diergbanben-fanout.git
cd diergbanben-fanout

cd docuverse
cp .env.example .env.local   # 填入 Key，勿提交
npm install
npm run dev
```

文档入口：

- `docs/扇出改造-设计共识与接续手册.md` — **对话共识汇总（接续探讨首选）**
- `docs/内禀坐标与指向性推理控制-大模型厂商工程规格.md` — 厂商规格 V3.4
- `docuverse/REASONING_PILOT.md` — 试点操作

---

## 首次推送到 GitHub（本机执行）

当前仓库状态：**已有 git 初始化，可能尚无 commit / 尚无 remote**。按顺序执行。

### 1. 检查勿提交密钥

确认未暂存：

- `.env`、`.env.local`
- 含 API Key 的私有配置

根目录 `.gitignore` 已忽略 `.env`、`*.local`、`node_modules/`。

### 2. 暂存并首次提交

在仓库根目录（PowerShell）：

```powershell
cd C:\Users\Administrator\Projects\diergbanben-fanout

# 暂存全部（含未跟踪的扇出代码与本文档）
git add -A

# 查看将要提交的内容
git status

# 首次提交
git commit -m "feat: 扇出改造独立库 — 网关/写信台/扇出 runner 与设计共识文档"
```

若不想把根目录大 PDF 进库，可先：

```powershell
git restore --staged "System for exploring connections between data pages.pdf"
git restore --staged "US20130174003A1（新）.pdf"
```

或把它们加入 `.gitignore`。

### 3. 在 GitHub 创建空仓库

浏览器打开 [https://github.com/new](https://github.com/new)：

- Repository name：例如 `diergbanben-fanout` 或 `hypertext-interact-fanout`
- **不要**勾选 “Add a README”（本地已有）
- 创建后记下 HTTPS 或 SSH URL

或用 GitHub CLI（已登录 `gh auth login`）：

```powershell
gh repo create diergbanben-fanout --private --source=. --remote=origin --push
```

一条命令可完成创建远程 + 推送。

### 4. 手动添加 remote 并推送

若不用 `gh repo create`：

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

SSH 示例：

```powershell
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

### 5. 另一台电脑接续

```powershell
git clone https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>
# 打开 docs/扇出改造-设计共识与接续手册.md 继续探讨
```

---

## 与旧 CLONE 说明的关系

此前 `docs/CLONE.md` 曾指向 `hypertext-interact` 私库。本扇出库为**独立旁路改造**，建议使用**新 GitHub 仓库**或单独分支，避免与原库混淆。若你仍希望推到同一 GitHub 账号下的 monorepo，可新建分支 `fanout` 再推送，但勿覆盖原 `main` 除非有意为之。

---

## 常见问题

| 问题 | 处理 |
|------|------|
| `No commits yet` | 先 `git commit` 再 `push` |
| `remote origin already exists` | `git remote set-url origin <新 URL>` |
| 推送要登录 | HTTPS 用 Personal Access Token；或配置 SSH key |
| 文件太大被拒 | GitHub 单文件 >100MB 需 Git LFS；大 PDF 建议不进库 |
