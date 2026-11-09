# Sekai Fanmade

OpenSekai 的自制谱社区，线上地址 <https://sekai.ourtaiko.org>。上传、浏览、试听、下载 OpenSekai 自制谱，Reddit 式的赞踩和楼中楼评论。登录用 OurTaiko SSO。

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
| `src/lib/charts.ts` | 谱面、列表排序、收藏、下载与游玩计数 |
| `src/lib/votes.ts`、`comments.ts`、`comment-folding.ts` | 赞踩、评论、karma、回复折叠（有单元测试） |
| `src/lib/session.ts`、`oidc.ts`、`crypto.ts` | SSO 登录与会话 |
| `src/lib/storage.ts` | S3 与本地开发存储 |
| `src/lib/file-store.ts`、`jobs.ts`、`src/instrumentation.ts` | 内容寻址文件、后台重试删除 |
| `src/lib/db/schema.ts`、`drizzle/` | 表结构与迁移（容器启动时自动执行） |
| `src/app/` | 页面、server actions、`/api/v1/*`、`/auth/*` |
| `src/app/globals.css`、`src/components/` | 界面：仿 Moesekai 的 Material 3 风格（浅灰底、青绿强调色、浮动侧栏、白卡片），颜色都是 `globals.css` 里的变量，跟随系统深浅色；侧栏 `side-nav.tsx`，顶栏 `page-bar.tsx`，基础组件 `ui.tsx`。设计稿在 Claude Design 画布「Sekai Fanmade redesign」 |
| `deploy/` | 生产 Compose、OpenResty 片段、发布脚本、环境变量示例 |

## 登录

OIDC 授权码 + S256 PKCE，confidential client（HTTP Basic），scope `openid profile`，见 OurTaikoLogs 的 `OurTaikoSSO/docs/INTEGRATION.md`。

- 登录尝试（state、nonce、PKCE verifier）加密存在 10 分钟的 HttpOnly Cookie 里，回调时一次性取出。
- 会话：Cookie 里是随机令牌，数据库只存其 SHA-256；上游 access / refresh token 用 `SESSION_ENCRYPTION_KEY` 做 AES-256-GCM 加密。会话最长 `SESSION_DAYS` 天（默认 7），不因活动延长。
- 每 `SESSION_RECHECK_SECONDS` 秒（默认 60）用 UserInfo 复核一次，顺带更新昵称和头像；access token 快过期时用 refresh token 轮换（行锁串行）。SSO 说 token 无效就删会话；SSO 不可达时页面照常显示，写操作返回 503。
- 退出只退出本站，并撤销本站持有的 token。SSO 的发现文档没有列出 `revocation_endpoint`，代码里补成 `/o/revoke/`。
- 写操作：server actions 由 Next.js 检查 Origin；`POST /auth/logout` 自己检查 `Origin` 等于 `APP_ORIGIN`；`/api/v1/*` 的写接口用 Cookie 时同样检查，用游戏会话（Bearer）时不检查。
- 管理员：`ADMIN_USER_IDS` 里的 SSO 用户 ID，可以管理所有谱面和评论。

## 赞踩与评论

照 OurTaiko Fanmade 的 Reddit 式做法：

- 谱面和评论都能赞（+1）或踩（−1），再点一次撤销。得分 = 赞 − 踩。发表评论时作者自动赞一次，所以新评论 1 分。
- 谱面排序：热门（`hot`）是 Reddit 的 hot，`sign(s)·log10(max(|s|,1)) + 发布秒数/45000`，得分多 10 倍相当于新 12.5 小时；得分最高（`top`）就是得分。`popular`、`recommended` 是 `hot` 的别名（游戏的「人気」「おすすめ」）。
- 评论排序：最佳（`best`，赞踩的 Wilson 下界，80% 置信度）、最高、最新、最早、争议（`(赞+踩)^(少/多)`）。回复按根评论成组取出，前端用 `planReplies` 折叠深楼和长楼；得分 ≤ −5 的评论默认收起。
- 评论可编辑、删除。有回复的评论删除后留一个「已删除」占位，最后一条回复删掉时占位一起清除；管理员删除显示为「已移除」。每人每分钟最多 8 条评论，正文最多 10000 字，最多 1000 层。
- 用户页显示 karma：别人对此人谱面和评论的赞减踩（自己的票不算）。

## 接口

`/api/v1/*`，网站和游戏共用。读取不需要登录；写入用网站 Cookie（检查 `Origin`）或游戏会话（`Authorization: Bearer`，向 SSO introspect）。

| 接口 | 说明 |
| --- | --- |
| `GET /api/v1/meta` | 站点信息与游戏会话要用的 service |
| `GET /api/v1/charts?q=&tag=&difficulty=&sort=&seed=&page=` | `sort`：`hot`、`new`、`top`、`comments`、`daily`、`plays`、`downloads`、`updated`、`hard`、`random`（配 `seed`）及别名 → `{ items, total, page, pages }` |
| `GET /api/v1/charts/<id 或 numberId>` | 单个谱面（`score`、`upvotes`、`downvotes`，登录时还有 `myVote`、`bookmarked`） |
| `PUT /api/v1/charts/<id>/vote` | `{ value: 1 \| 0 \| -1 }` → `{ score, upvotes, downvotes, myVote }` |
| `PUT`／`DELETE /api/v1/charts/<id>/bookmark` | 收藏（游戏的マイリスト） |
| `POST /api/v1/charts/<id>/plays` | 报一次游玩（同一人每小时一次） |
| `GET /api/v1/charts/<id>/comments?sort=&page=` | 顶层评论（每页 20）连同它们的回复 |
| `POST /api/v1/charts/<id>/comments` | `{ body, parentId? }` |
| `GET`／`PATCH`／`DELETE /api/v1/comments/<id>` | 单条评论及其回复；编辑 `{ body }`；删除 |
| `PUT /api/v1/comments/<id>/vote` | `{ value }` → `{ score, myVote }` |
| `GET /api/v1/me`、`/api/v1/me/bookmarks`、`/api/v1/tags` | 当前用户、收藏列表、标签 |
| `PUT /api/v1/uploads?chart=` | 上传谱面包（原始 ZIP 作为请求体；带 `chart` 时替换自己的这份谱面）。网站和游戏的「自制谱管理 › 上传」都用它 |
| `GET /charts/<id 或 numberId>/download` | 计一次下载，302 到 CDN 上的 ZIP |
| `GET /readyz` | 健康检查 |

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
