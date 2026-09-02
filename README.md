# Canvas CalDAV Sync

从 Canvas 获取待办作业和近期事件，并通过 CalDAV 写入日历。脚本会为未完成作业添加提前 2 小时和 1 小时的提醒；距离截止不足 4 小时的作业会标记为紧急，已提交或已评分的作业会标记为已完成。

## 环境要求

- Node.js 18 或更高版本
- 可访问 Canvas 与 CalDAV 服务的网络
- 一个支持 Basic Auth 和 `MKCALENDAR`/`PUT` 的 CalDAV 服务

## 安装

```bash
npm install
npx playwright install chromium
```

复制示例配置：

```bash
cp config.example.json config.json
```

Windows PowerShell：

```powershell
Copy-Item config.example.json config.json
```

编辑 `config.json`：

- `canvas.baseUrl`：Canvas 站点地址。
- `canvas.loginUrlPattern`：统一身份认证页面 URL 的正则表达式。
- `canvas.username` / `canvas.password`：Canvas 登录凭据。
- `caldav.collectionUrl`：目标日历集合 URL，必须以该账户可写的日历集合为目标。
- `caldav.username` / `caldav.password`：CalDAV 登录凭据。
- `calendar.uidDomain` / `calendar.productId`：生成 ICS 事件时使用的非敏感标识，可保持默认值。

`config.json`、浏览器登录状态和同步状态已加入 `.gitignore`，不要提交到 Git 仓库。

## 运行

```bash
npm run sync
```

也可以把配置放在其他位置：

```bash
CONFIG_PATH=/path/to/config.json npm run sync
```

首次运行会使用配置中的 Canvas 账户登录，并在本地生成 `browser-state.json` 和 `sync-state.json`。后续运行会复用登录状态，并更新相同 UID 的日历事件。

## 定时同步（可选）

Linux `cron` 示例，每 15 分钟运行一次：

```cron
*/15 * * * * cd /path/to/canvas-caldav-sync && /usr/bin/npm run sync >> sync.log 2>&1
```

Windows 可在“任务计划程序”中创建定时任务，将程序设为 `npm`，参数设为 `run sync`，起始目录设为项目目录。

## 上传 GitHub 前

仓库应只包含源码、`config.example.json`、依赖清单、`.gitignore` 和本文档。真实的 `config.json`、`browser-state.json`、`sync-state.json` 与日志文件不得提交。
