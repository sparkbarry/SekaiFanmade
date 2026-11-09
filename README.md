# Sekai Fanmade

OpenSekai 的自制谱社区，线上地址 <https://sekai.ourtaiko.org>。上传、浏览、试听、下载 OpenSekai 自制谱，喜欢和评论。登录用 OurTaiko SSO。

参照 OurTaiko Fanmade 的做法：前后端在一个 Next.js 程序里，一个 Docker 镜像发布到 `ourtaiko-prod`；数据库是共享实例 `ourtaiko-postgres` 里单独的 `sekai_fanmade` 库；文件放在 `ourtaiko-public` 桶的 `sekai-fanmade/` 前缀下，经 CloudFront（`https://distrib.ourtaiko.org/sekai-fanmade/…`）公开读取。

## 谱面包

上传的是 OpenSekai 自制谱管理里「导出ZIP」得到的文件：一个文件夹，含 `manifest.json`、`score.json`（或 SUS）、音频（ogg / mp3 / wav）、封面（png / jpg，可选）和 MV（mp4，可选）。服务器按游戏 `FindEntryRoot` 的规则找 `manifest.json`，校验各文件后**只把这几个文件重新打包到 ZIP 根目录**，丢掉其他内容。曲名、难度、等级、作者都取自 manifest；网站上只能改简介，要改曲目信息就上传新版本。

## ID 与存储

参照 OurTaiko Fanmade：

- 谱面 `id` 是 32 位随机小写十六进制（网址 `/charts/<id>`、API、游戏都用它）；另有递增的 `numberId`，给人手输（游戏的「譜面ID検索」、网站搜索 `#12`、`/charts/12` 会跳到 id 网址）。2026-11-09 之前的谱面保留了原来的数字作为 `numberId`。
- 对象按内容寻址，平铺在 `sekai-fanmade/` 下，名字是 `<sha256>.<扩展名>`，CDN 缓存一年：谱面包 `.zip`（重新打包的 ZIP 时间戳固定，同样的内容得到同样的哈希；Content-Disposition 是第一次存入时的文件名）、音频 `.ogg`／`.mp3`／`.wav`、512×512 JPEG 封面 `.jpg`（游戏只能解码 PNG／JPEG）。
- `files` 表每个对象一行，`charts.package_file_id`／`audio_file_id`／`jacket_file_id` 引用它；内容相同的上传共用一行和一个对象。与 Fanmade 不同，谱面包 ZIP 也存进桶里，游戏从 CDN 下载，不在服务器上现场打包。
- 替换或删除谱面后，`releaseFiles` 删掉不再被任何谱面引用的对象；存入和删除同一个键时用 `pg_advisory_xact_lock` 串行。事务失败时，本次上传的对象若没有 `files` 行就删掉（`discardUnreferenced`）。删不掉的记进 `retired_objects`，后台每 10 分钟重试（`src/lib/jobs.ts`）。
- 迁移 0002 之前的谱面用的是 `charts/<number>/r<revision>/...`，由 `bb6954e` 的启动任务搬成哈希对象；迁移 0003 删掉了旧列，并加了 `charts_files_check`（没删除的谱面必须有谱面包和音频）。

## 代码结构

| 位置 | 内容 |
| --- | --- |
| `src/lib/package.ts` | ZIP 校验与重新打包（有单元测试） |
| `src/lib/charts.ts` | 谱面、喜欢、评论、下载计数 |
| `src/lib/session.ts`、`oidc.ts`、`crypto.ts` | SSO 登录与会话 |
| `src/lib/storage.ts` | S3 与本地开发存储 |
| `src/lib/file-store.ts`、`jobs.ts`、`src/instrumentation.ts` | 内容寻址文件、后台重试删除 |
| `src/lib/db/schema.ts`、`drizzle/` | 表结构与迁移（容器启动时自动执行） |
| `src/app/` | 页面、server actions、`/api/v1/*`、`/auth/*` |
| `deploy/` | 生产 Compose、OpenResty 片段、发布脚本、环境变量示例 |

## 登录

OIDC 授权码 + S256 PKCE，confidential client（HTTP Basic），scope `openid profile`，见 OurTaikoLogs 的 `OurTaikoSSO/docs/INTEGRATION.md`。

- 登录尝试（state、nonce、PKCE verifier）加密存在 10 分钟的 HttpOnly Cookie 里，回调时一次性取出。
- 会话：Cookie 里是随机令牌，数据库只存其 SHA-256；上游 access / refresh token 用 `SESSION_ENCRYPTION_KEY` 做 AES-256-GCM 加密。会话最长 `SESSION_DAYS` 天（默认 7），不因活动延长。
- 每 `SESSION_RECHECK_SECONDS` 秒（默认 60）用 UserInfo 复核一次，顺带更新昵称和头像；access token 快过期时用 refresh token 轮换（行锁串行）。SSO 说 token 无效就删会话；SSO 不可达时页面照常显示，写操作返回 503。
- 退出只退出本站，并撤销本站持有的 token。SSO 的发现文档没有列出 `revocation_endpoint`，代码里补成 `/o/revoke/`。
- 写操作：server actions 由 Next.js 检查 Origin；`PUT /api/v1/uploads` 和 `POST /auth/logout` 自己检查 `Origin` 等于 `APP_ORIGIN`。
- 管理员：`ADMIN_USER_IDS` 里的 SSO 用户 ID，可以管理所有谱面和评论。

## 公开接口

供 OpenSekai 以后在游戏里浏览下载用，不需要登录：

- `GET /api/v1/charts?q=&difficulty=&sort=new|updated|popular|downloads&page=&uploader=` → `{ items, total, page, pages }`
- `GET /api/v1/charts/<id 或 numberId>` → 单个谱面（含 `id`、`numberId`、`packageUrl`、`audioUrl`、`jacketUrl`）
- `GET /charts/<id 或 numberId>/download` → 计一次下载，302 到 CDN 上的 ZIP
- `GET /readyz`

## 本地开发

需要 Node 24+、pnpm、PostgreSQL，以及本地的 OurTaikoSSO（`127.0.0.1:8090`）。统一用 `127.0.0.1`，不要混用 localhost。

```sh
pnpm install
createdb -h 127.0.0.1 sekai_fanmade_dev
cp .env.example .env.local   # 填 SSO 客户端和密钥
set -a; . ./.env.local; set +a; pnpm db:migrate
pnpm dev                      # http://127.0.0.1:3000
```

本地 SSO 里要登记一个 confidential、authorization-code、RS256 的应用，回调 `http://127.0.0.1:3000/auth/callback`。本地存储写在 `.data/storage`，由 `/files/…` 提供。

检查：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。改了 `src/lib/db/schema.ts` 后用 `pnpm db:generate --name <名字>` 生成迁移。

## 部署

见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。日常发布：提交后在本机运行 `deploy/release.sh`。
