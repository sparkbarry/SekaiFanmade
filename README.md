# Sekai Fanmade

OpenSekai 的自制谱社区，线上地址 <https://sekai.ourtaiko.org>。上传、浏览、试听、下载 OpenSekai 自制谱，喜欢和评论。登录用 OurTaiko SSO。

参照 OurTaiko Fanmade 的做法：前后端在一个 Next.js 程序里，一个 Docker 镜像发布到 `ourtaiko-prod`；数据库是共享实例 `ourtaiko-postgres` 里单独的 `sekai_fanmade` 库；文件放在 `ourtaiko-public` 桶的 `sekai-fanmade/` 前缀下，经 CloudFront（`https://distrib.ourtaiko.org/sekai-fanmade/…`）公开读取。

## 谱面包

上传的是 OpenSekai 自制谱管理里「导出ZIP」得到的文件：一个文件夹，含 `manifest.json`、`score.json`（或 SUS）、音频（ogg / mp3 / wav）、封面（png / jpg，可选）和 MV（mp4，可选）。服务器按游戏 `FindEntryRoot` 的规则找 `manifest.json`，校验各文件后**只把这几个文件重新打包到 ZIP 根目录**，丢掉其他内容。曲名、难度、等级、作者都取自 manifest；网站上只能改简介，要改曲目信息就上传新版本。

存储键带版本号，对象不再改动、CDN 缓存一年：

```
sekai-fanmade/charts/<id>/r<revision>/package.zip   下载用（Content-Disposition 带文件名）
sekai-fanmade/charts/<id>/r<revision>/audio.<ext>    试听
sekai-fanmade/charts/<id>/r<revision>/jacket.webp    512×512 封面
```

替换或删除谱面时，旧版本的对象在数据库提交后删除；删不掉的记进 `retired_objects`。

## 代码结构

| 位置 | 内容 |
| --- | --- |
| `src/lib/package.ts` | ZIP 校验与重新打包（有单元测试） |
| `src/lib/charts.ts` | 谱面、喜欢、评论、下载计数 |
| `src/lib/session.ts`、`oidc.ts`、`crypto.ts` | SSO 登录与会话 |
| `src/lib/storage.ts` | S3 与本地开发存储 |
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
- `GET /api/v1/charts/<id>` → 单个谱面（含 `packageUrl`、`audioUrl`、`jacketUrl`）
- `GET /charts/<id>/download` → 计一次下载，302 到 CDN 上的 ZIP
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
