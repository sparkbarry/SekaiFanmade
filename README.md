# Sekai Fanmade

OpenSekai 的自制谱社区，线上地址 <https://sekai.ourtaiko.org>。上传、浏览、试听、下载 OpenSekai 自制谱，Reddit 式的赞踩和楼中楼评论。登录用 OurTaiko SSO。

参照 OurTaiko Fanmade 的做法：前后端在一个 Next.js 程序里，一个 Docker 镜像发布到 `ourtaiko-prod`；数据库是共享实例 `ourtaiko-postgres` 里单独的 `sekai_fanmade` 库；文件放在 `ourtaiko-public` 桶的 `sekai-fanmade/` 前缀下，经 CloudFront（`https://distrib.ourtaiko.org/sekai-fanmade/…`）公开读取。

## 谱面包

上传的是 OpenSekai 自制谱管理里「导出ZIP」得到的文件：一个文件夹，含 `manifest.json`、`score.json`（或 SUS）、音频（ogg / mp3 / wav）、封面（png / jpg，可选）和 MV（mp4，可选）。服务器按游戏 `FindEntryRoot` 的规则找 `manifest.json`，校验后**只保留这几个文件，分开存放，不再保存 ZIP**，丢掉其他内容。曲名、难度、等级、作者都取自 manifest；网站上只能改简介，要改曲目信息就上传新版本。

## ID 与存储

参照 OurTaiko Fanmade：

- 谱面 `id` 是 32 位随机小写十六进制（网址 `/charts/<id>`、API、游戏都用它）；另有递增的 `numberId`，给人手输（游戏的「譜面ID検索」、网站搜索 `#12`、`/charts/12` 会跳到 id 网址）。2026-11-09 之前的谱面保留了原来的数字作为 `numberId`。
- 对象按内容寻址，平铺在 `sekai-fanmade/` 下，名字是 `<sha256>.<扩展名>`，CDN 缓存一年：谱面 `.json`／`.sus`、音频 `.ogg`／`.mp3`／`.wav`、原始封面 `.png`／`.jpg`、512×512 JPEG 缩略图 `.jpg`（游戏只能解码 PNG／JPEG）、MV `.mp4`。
- 谱面包不存 ZIP：`charts.manifest`（jsonb）是重写过的 manifest.json，`score_file_id`／`audio_file_id`／`jacket_source_file_id`／`video_file_id` 是它引用的文件，`jacket_file_id` 是缩略图，`package_size` 是这些加起来的大小。单个谱面的接口返回 `package: { manifest, files: [{ role, name, url, size, sha256 }] }`：把 manifest.json 和各文件按 `name` 写进一个文件夹就是谱面。游戏这样下载后导入；网站的「下载 ZIP」在浏览器里用 JSZip 打包；两者都 `POST /api/v1/charts/<id>/downloads` 计数。这样音频只存一份，服务器不打包也不转发文件。
- `files` 表每个对象一行，谱面的各列引用它；内容相同的上传共用一行和一个对象（同一首歌的多张谱面共用音频）。
- 替换或删除谱面后，`releaseFiles` 删掉不再被任何谱面引用的对象；存入和删除同一个键时用 `pg_advisory_xact_lock` 串行。事务失败时，本次上传的对象若没有 `files` 行就删掉（`discardUnreferenced`）。删不掉的记进 `retired_objects`，后台每 10 分钟重试（`src/lib/jobs.ts`）。
- 迁移 0002 之前的谱面用的是 `charts/<number>/r<revision>/...`，由 `bb6954e` 的启动任务搬成哈希对象；迁移 0003 删掉了旧列，并加了 `charts_files_check`。迁移 0005 之前的谱面存的是重新打包的 ZIP，由 `b394da8` 的启动任务拆成各部分并删除 ZIP；迁移 0006 删掉了 `package_file_id`，`charts_files_check` 要求没删除的谱面有谱面文件、音频和 manifest。

## 代码结构

| 位置 | 内容 |
| --- | --- |
| `src/lib/package.ts` | 上传 ZIP 的校验与拆分（有单元测试） |
| `src/lib/charts.ts` | 谱面、列表排序、收藏、下载与游玩计数 |
| `src/lib/votes.ts`、`comments.ts`、`comment-folding.ts` | 赞踩、评论、karma、回复折叠（有单元测试） |
| `src/lib/session.ts`、`oidc.ts`、`crypto.ts` | SSO 登录与会话 |
| `src/lib/storage.ts` | S3 与本地开发存储 |
| `src/lib/file-store.ts`、`jobs.ts`、`src/instrumentation.ts` | 内容寻址文件、后台重试删除 |
| `src/lib/db/schema.ts`、`drizzle/` | 表结构与迁移（容器启动时自动执行） |
| `src/app/` | 页面、server actions、`/api/v1/*`、`/auth/*` |
| `src/app/globals.css`、`src/components/` | 界面：仿 Moesekai 的 Material 3 风格（浅灰底、青绿强调色、浮动侧栏、白卡片），颜色都是 `globals.css` 里的变量，跟随系统深浅色；侧栏 `side-nav.tsx`，顶栏 `page-bar.tsx`，基础组件 `ui.tsx`。设计稿在 Claude Design 画布「Sekai Fanmade redesign」 |
| `proto/sekai/multiplay/v1/`、`src/lib/multiplay/` | 協力ライブ的 gRPC 协议、房间状态机、服务（有单元测试和 gRPC 集成测试）；`proto/` 改了以后 `pnpm proto:generate` 重新生成 TS 类型 |
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
| `GET /api/v1/charts/<id 或 numberId>` | 单个谱面（`score`、`upvotes`、`downvotes`、`package`，登录时还有 `myVote`、`bookmarked`） |
| `PUT /api/v1/charts/<id>/vote` | `{ value: 1 \| 0 \| -1 }` → `{ score, upvotes, downvotes, myVote }` |
| `PUT`／`DELETE /api/v1/charts/<id>/bookmark` | 收藏（游戏的マイリスト） |
| `POST /api/v1/charts/<id>/plays` | 报一次游玩（同一人每小时一次） |
| `GET /api/v1/charts/<id>/comments?sort=&page=` | 顶层评论（每页 20）连同它们的回复 |
| `POST /api/v1/charts/<id>/comments` | `{ body, parentId? }` |
| `GET`／`PATCH`／`DELETE /api/v1/comments/<id>` | 单条评论及其回复；编辑 `{ body }`；删除 |
| `PUT /api/v1/comments/<id>/vote` | `{ value }` → `{ score, myVote }` |
| `GET /api/v1/me`、`/api/v1/me/bookmarks`、`/api/v1/tags` | 当前用户、收藏列表、标签 |
| `PUT /api/v1/uploads?chart=` | 上传谱面包（原始 ZIP 作为请求体；带 `chart` 时替换自己的这份谱面）。网站和游戏的「自制谱管理 › 上传」都用它 |
| `POST /api/v1/charts/<id>/downloads` | 计一次下载（网站和游戏自己从 CDN 取文件） |
| `GET /charts/<id 或 numberId>/download` | 旧链接，302 到谱面页 |
| `GET /readyz` | 健康检查 |

## 協力ライブ（gRPC 联机）

OpenSekai 的多人合作 live，仿照プロセカ的マルチライブ。协议在 `proto/sekai/multiplay/v1/multiplay.proto`：每个玩家一条双向流 `sekai.multiplay.v1.MultiLive/Connect`，第一条消息 `join`，之后服务器在房间每次变化时发完整快照 `room`。鉴权和 `/api/v1` 一样：metadata `authorization: Bearer <游戏会话>`。

- **进程**：gRPC 服务跑在网站同一个 Node 进程里（`src/instrumentation.ts` 启动 `src/lib/multiplay/start.ts`），端口 `MULTIPLAY_GRPC_PORT`（开发 50051，镜像里 3001，生产映射到 `127.0.0.1:8095`），由 OpenResty 以 `grpc_pass` 转发 `/sekai.multiplay.v1.MultiLive/`。`/api/v1/meta` 的 `multiplay.url` 告诉游戏连哪里（`MULTIPLAY_PUBLIC_URL`，默认 `APP_ORIGIN`）。房间只在内存里，重启进程会解散所有房间；只能单实例运行。
- **房间**：最多 5 人，5 位数字房间号。フリールーム（`quick_match`，进人最多的等待中的公开房间，没有就新开）或私人房间（`create_private`，只能凭房间号进；房主可「ルーム解放」改成公开）。第一个进来的是房主，房主走了顺延。房主按「メンバー決定」开始（至少 `MULTIPLAY_MIN_PLAYERS` 人，默认 2）；公开房间满 2 人后 30 秒自动开始，满 5 人立即开始。房主可以在等待时移出成员。
- **一局**：选曲 20 秒（社区谱面或おまかせ，选了什么在抽选前对别人隐藏）→ 从大家的选择里随机抽一首（おまかせ＝全站随机）→ 难度 10 秒：同一首歌＝**音频 SHA-256 相同**的谱面，每人各选一个，没选的用自己选的（若是这首歌）或抽中的那张 → 加载最多 90 秒，游戏下载谱面、进入 live、音频就绪后报 `loaded`，全员就绪才发 `start_live`（超时的人这局不参加）→ 演奏中每人约 5 次/秒报分数、连击、血量，服务器每 250 ms 广播一次 → 全员结束（或第一个人结束后 30 秒）出结果，10 秒后回到等待。
- **FEVER**：自制谱没有 FEVER 标记，所以 FEVER CHANCE 按曲长算：从 45% 处开始，长 `min(20 s, 15%)`；结束后 3 秒进入 FEVER，长度相同。每人在 FEVER CHANCE 结束时报自己这段的判定；2 人以上且全员这段没有 GOOD/BAD/MISS → SUPER FEVER，否则全队 PERFECT+GREAT ≥ 70% → FEVER。FEVER 中的音符 1.5 倍得分（游戏端 `CoopScoreLogic`）。
- **结果**：按分数排名（同分比 PERFECT、最大连击、血量），第一名 MVP，领先第二名 30% 以上则为 SUPER STAR（至少 2 人完成）；团队分是总和。血量归零不退出，继续打完（标「LIFE 0」）。
- **断线**：流断开后保留位置 10 秒，用同一房间号 `join` 即可回到房间（游戏自动重连 3 次）；live 中断线的人照样列在结果里（「切断」）。同一账号再连一次会把旧连接踢掉。
- **聊天**：只有スタンプ（`stamp_id` 0–15，每人每秒最多一个，live 中不能发），文字在游戏里。
- **限制**：客户端消息平均 40 条/秒，单条 64 KB；服务器最多 2000 个房间；所有客户端上报的数值都会被夹到合理范围。分数由客户端上报，服务器不验算。

## 本地开发

需要 Node 24+、pnpm、PostgreSQL，以及本地的 OurTaikoSSO（`127.0.0.1:8090`）。统一用 `127.0.0.1`，不要混用 localhost。

```sh
pnpm install
createdb -h 127.0.0.1 sekai_fanmade_dev
cp .env.example .env.local   # 填 SSO 客户端和密钥
set -a; . ./.env.local; set +a; pnpm db:migrate
pnpm dev                      # http://127.0.0.1:3000
```

協力ライブ的 gRPC 在 `127.0.0.1:50051`（h2c，`.env.example` 里的 `MULTIPLAY_*`）。游戏连本地时设 `OPENSEKAI_COMMUNITY_URL=http://127.0.0.1:3000`，gRPC 地址从 `/api/v1/meta` 取，也可以用 `OPENSEKAI_MULTIPLAY_URL` 直接指定。游戏登录要求 SSO 里有 `OurTaikoPlay` 游戏客户端：本地用隔离库启动 SSO，`DATABASE_URL=sqlite:///<本仓库>/.data/sso-dev.sqlite3 sh scripts/dev.sh`（库里有 `OurTaikoPlay`、`sekai-fanmade-dev` 和两个测试账号：`sekaiFanmadeTest` 见 `.data/dev-test-account.txt`，第二个玩家 `coopBot` 见 `.data/dev-coop-bot.txt`）。

本地 SSO 里要登记一个 confidential、authorization-code、RS256 的应用，回调 `http://127.0.0.1:3000/auth/callback`。本地存储写在 `.data/storage`，由 `/files/…` 提供。

检查：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。改了 `src/lib/db/schema.ts` 后用 `pnpm db:generate --name <名字>` 生成迁移。

## 部署

见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。日常发布：提交后在本机运行 `deploy/release.sh`。
