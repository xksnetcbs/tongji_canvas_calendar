**妈妈再也不用担心我的学习！**

# Tongji Canvas CalDAV Sync

填写好个人信息后，每15分钟爬取一次 同济Canvas 获取最新作业状态。有了新的作业立即通知，添加到邮箱的日历服务中。

若作业已完成，该任务的截止时间将被标注为应用第一次扫描到该任务已提交的时间；

若距离截止时间4小时该任务仍未完成，将会显示紧急字样。

## 最佳食用方法（搭配支持CalDAV的邮箱食用）：

为了达到最佳食用状态，你需要：

- 一台云服务器，部署自己的Radical日历服务，同时部署本应用（部署方法见后文）
- 手机上下载一个DAVx5，用于同步Radical日历和本机日历（**实测荣耀手机日历账户尽管支持CalDAV，但疑似对支持的域名做了限制，无法导入自己的CalDAV服务账户**）
- 在CalDAV上登录Radical账户，设置同步时间为15分钟一次。
- 此时，你的本机日历上就会自动同步Canvas的作业。
- 你还可以接一个Android应用，自动访问你的日历服务，将任务信息动态更新到手机的卡片上进行动态提醒。

（看起来确实挺复杂，但荣耀手机自带的系统日历实在是太好用了以至于我必须绕这么一大圈）

# 应用介绍(Codex生成)：

从 同济 Canvas 获取待办作业和近期事件，并通过 CalDAV 写入日历。脚本会为未完成作业添加提前 2 小时和 1 小时的提醒；距离截止不足 4 小时的作业会标记为紧急，已提交或已评分的作业会标记为已完成。

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
