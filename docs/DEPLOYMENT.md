# 部署

## 生产环境一览

| 项 | 值 |
| --- | --- |
| 网址 | https://sekai.ourtaiko.org（Cloudflare DNS，仅 DNS，A 记录指向 ourtaiko-prod） |
| 服务器 | `ssh ourtaiko-prod`（用户 `kv`，无密码 sudo） |
| 反向代理 | 1Panel OpenResty 站点 `sekai.ourtaiko.org`，Let's Encrypt 证书由 1Panel 续期；`/opt/1panel/www/conf.d/sekai.ourtaiko.org.conf` 里手工加一行 `include /www/sites/sekai.ourtaiko.org/sekai.conf;`，该文件是 `deploy/sekai.locations.conf` 的副本。**在面板里改站点设置后检查这行 include 还在。** |
| 容器 | `sekai-fanmade`，镜像 `sekai-fanmade:release`（label `org.opencontainers.image.revision` 是提交号），`127.0.0.1:8094`，网络 `ourtaiko-shared`，只读根文件系统，`/tmp` tmpfs 1 GB |
| 目录 | `/opt/sekai-fanmade/`：`compose.yml`、`publish.sh`、`incoming/`（镜像包，发布成功后删除） |
| 环境 | `/etc/sekai-fanmade/app.env`（root，600），字段见 `deploy/app.env.example` |
| 数据库 | 共享实例 `ourtaiko-postgres`（PostgreSQL 18.6）里的库 `sekai_fanmade`，属主角色 `sekai_fanmade`；容器内经别名 `postgres:5432` 连接。迁移在容器启动时自动执行 |
| 查看数据 | CloudBeaver（https://postgre.ourtaiko.org）连接「Sekai Fanmade Production (read only)」，账号是共享只读角色 `ourtaiko_viewer`：能读除 `sessions` 外的所有表（默认权限覆盖以后的新表），不能写 |
| 文件 | 桶 `ourtaiko-public`（ap-northeast-1）的 `sekai-fanmade/` 前缀；CloudFront `https://distrib.ourtaiko.org/sekai-fanmade/…`；IAM 用户 `sekai-fanmade` 只能读写该前缀 |
| SSO 应用 | OAuth Application `sekai-fanmade-prod`（confidential、authorization code、RS256、不跳过授权），回调 `https://sekai.ourtaiko.org/auth/callback` |

## 日常发布

在本机仓库提交后运行：

```sh
deploy/release.sh
```

它在本机用 buildx 构建 linux/amd64 镜像（带提交号 label），gzip 后 scp 到 `/opt/sekai-fanmade/incoming/`，然后在服务器上运行 `publish.sh`：核对 SHA-256 和 label、`docker load`、把原来的 `release` 另标为 `previous`、换上新镜像、`compose up --wait`、检查 `/readyz`。

有结构变更的发布，先手动备份：

```sh
ssh ourtaiko-prod 'sudo docker exec ourtaiko-postgres pg_dump -U postgres -Fc sekai_fanmade' > sekai_fanmade-$(date -u +%Y%m%dT%H%M%SZ).dump
```

回退（只换代码，不动数据库）：

```sh
ssh ourtaiko-prod 'sudo docker tag sekai-fanmade:previous sekai-fanmade:release && sudo docker compose -f /opt/sekai-fanmade/compose.yml up -d --wait --no-deps web'
```

## 首次上线步骤

### 需要用户在各控制台完成

1. **Cloudflare**：`ourtaiko.org` 加 A 记录 `sekai` → `154.64.230.124`，仅 DNS（灰云）。
2. **1Panel**：新建静态站点 `sekai.ourtaiko.org`，申请 Let's Encrypt 证书（不要勾 IP 证书）。
3. **AWS IAM**：新建用户 `sekai-fanmade`（不需要控制台登录），内联策略：

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::ourtaiko-public/sekai-fanmade/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::ourtaiko-public",
         "Condition": { "StringLike": { "s3:prefix": ["sekai-fanmade/*"] } }
       }
     ]
   }
   ```

   为它创建访问密钥，自己填进服务器 `/etc/sekai-fanmade/app.env` 的 `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` 两行（`sudo nano /etc/sekai-fanmade/app.env`），然后 `sudo docker compose -f /opt/sekai-fanmade/compose.yml up -d --wait`。
4. **CloudFront**（分发 `E29SNWDH0GYCHC`）：照 `database/*` 复制一条行为，路径 `sekai-fanmade/*`，源站、OAC、缓存策略、源站请求策略、响应头策略（CORS）都和 `database/*` 相同。如果 `ourtaiko-public` 的桶策略按前缀放行 CloudFront，也给 `sekai-fanmade/*` 放行。

### 服务器上

1. 建库与角色（密码直接写进环境文件，不显示）。
2. 在 SSO 登记 OAuth 应用 `sekai-fanmade-prod`（明文密钥直接写进环境文件）。
3. 写 `/etc/sekai-fanmade/app.env`，`SESSION_ENCRYPTION_KEY` 用 `openssl rand -hex 32`。
4. 放 `sekai.conf`，站点配置加 include，`openresty -t` 通过后 reload：
   `sudo docker exec 1Panel-openresty-kHwB openresty -t && sudo docker exec 1Panel-openresty-kHwB openresty -s reload`
5. `deploy/release.sh`。

## 还没有接入

- 每日备份：Fanmade 仓库 `deploy/backup/` 的共享备份程序还没有加 `sekai_fanmade` 库。
- CI：仓库还没有 GitHub 远端，发布靠本机 `deploy/release.sh`。

## 记录

### 2026-11-09 首次部署（`e4cff24`）

- 服务器：建了库 `sekai_fanmade` 和同名属主角色（`REVOKE ALL … FROM PUBLIC`，只给该角色 CONNECT/TEMPORARY）；它对其他四个库的表都没有读权限（`ourtaiko_sso`、`ourtaiko_fanmade` 对 PUBLIC 开放 CONNECT 是原有设置，没改）。在生产 SSO 登记了 `sekai-fanmade-prod`（密钥哈希保存，明文只在 `app.env`）。`/etc/sekai-fanmade/app.env` 已写好，`ADMIN_USER_IDS` 与 AWS 密钥两行留空。
- `deploy/release.sh` 发布：镜像包 81 MB，容器 healthy，内存约 80 MiB，迁移建了 6 张表；本机 `127.0.0.1:8094` 首页、`/api/v1/charts` 200，`/auth/login` 303 到 `sso.ourtaiko.org/o/authorize/`（回调 `https://sekai.ourtaiko.org/auth/callback`，`__Host-` Secure Cookie）。其他容器状态不变。
- 本机验证（不是生产）：本地 SSO（隔离的 SQLite 库）上走通登录、授权、回调、上传真实谱面、替换（旧版本对象删除）、喜欢、评论、删除、退出（refresh 与 access token 都撤销）；伪造 Origin 的上传与退出 403；浅色、深色、375 px 宽度看过。生产镜像在只读根文件系统下本机跑过。
- 用户随后加了 DNS（灰云）、在 1Panel 建了静态站点并签了 Let's Encrypt 证书（2027-02-07 到期）。我备份站点配置为同目录 `sekai.ourtaiko.org.conf.before-include-<时间>`，在 `root` 下一行加 include，放 `sekai.conf`，`openresty -t` 通过后 reload。公网核对：首页、`/readyz`、`/api/v1/charts`、`/upload` 200，HTTP 301 到 HTTPS，`/auth/login` 303 到 SSO（回调正确），未登录上传 401；fanmade、database、profile 200，sso 302（登录页），与之前相同。
- 用户建了 IAM 用户 `sekai-fanmade`（内联策略同上）并把密钥填进 `app.env`、重启了容器。核对：容器内两个变量长度 20／40；从容器里经应用自己的 S3 客户端写一个临时对象 `sekai-fanmade/__healthcheck/…` 成功，经 `distrib.ourtaiko.org` 读回 200、内容一致、`Access-Control-Allow-Origin: *`，随后删除成功；往 `database/` 写被拒（AccessDenied），权限没有超出前缀。CloudFront 现在走的是默认行为，没有单独的 `sekai-fanmade/*` 行为。
- 还没做：`ADMIN_USER_IDS`；生产上还没用真实账号登录或上传过。

### 2026-11-09 游戏接口（`32eb96d`，迁移 0001）

- 内容：游戏用的 API（游玩次数、每日／总排行、おすすめ、标签、二次利用OK、親譜面、マイリスト、游戏令牌登录）与 JPEG 封面。游戏端是 OpenSekai `136f60f`（Home 与 CommunityCharts 场景）。
- 发布前：库里 1 首谱面、1 个用户，迁移 1 条，无 `idle in transaction`。备份 `/var/backups/sekai-fanmade/pre-0001-20261109T044734Z.dump`（root 600，`pg_restore --list` 正常）。
- `deploy/release.sh` 发布，容器 healthy，迁移变 2 条，新表 `chart_plays`、`bookmarks` 和新列都在，原谱面数据不变。
- `docker exec sekai-fanmade node scripts/backfill-jpeg-jackets.mjs`：谱面 1 的封面 `jacket.webp` → `jacket.jpg`（19 KB），旧对象已删。经 CDN 读回 200 `image/jpeg`。
- SSO：`sekai-fanmade-prod` 原本没有 ApplicationAccess 记录，新建并打开 `allow_game`（允许游戏登录和会话接口）、`allow_account_tokens`（允许游戏账号换取本应用的游戏会话），其余开关保持关闭。
- 核对：`/api/v1/meta` 指向生产 SSO；六种排序与 `/api/v1/tags` 200；伪造的游戏令牌 401 `AUTH_REQUIRED`（说明本站用 Application 凭据调 introspect 正常，权限不足时会是 503）；SSO `/api/v1/game/tokens` 对伪造账号令牌 401；fanmade、database、profile 200，sso 302，与之前相同。
- 没有验证：没用真实账号在游戏里登录生产、点喜欢、登録或报游玩次数（本地开发环境全部走通过）。

### 2026-11-09 CloudBeaver 只读连接

- 给 `ourtaiko_viewer` 授 `sekai_fanmade` 的 CONNECT、`public` 与 `drizzle` 的 USAGE 和全部表的 SELECT，撤掉 `sessions`；`ALTER DEFAULT PRIVILEGES FOR ROLE sekai_fanmade` 让以后新建的表也可读。
- CloudBeaver：停容器，备份 `data-sources.json` 为 `data-sources.json.before-sekai-fanmade-20261109T045923Z`，复制 Fanmade 只读连接的配置（同一账号与已保存的密码）新增 `postgres-jdbc-sekai_fanmade`，重启后 `/status` 200。服务器 README 已补一行。
- 核对：用该账号连库能读 `charts`、`users`；读 `sessions` 被拒；UPDATE 报只读事务。没有登录 CloudBeaver 网页界面查看。

### 2026-11-09 随机 ID 与内容寻址文件（`bb6954e`，迁移 0002）

- 内容：谱面 `id` 改为 32 位随机十六进制，原数字留作 `number_id`；对象改为平铺的 `sekai-fanmade/<sha256>.<ext>`，`files` 表与引用计数式删除（见 README「ID 与存储」）。游戏端是 OpenSekai `11422bc`。
- 发布前：1 首谱面（旧键 `charts/1/r1/...`，下载 5 次）、1 个用户，其余表为空，迁移 2 条，无 `idle in transaction`。备份 `/var/backups/sekai-fanmade/pre-0002-20261109T051628Z.dump`（root 600，`pg_restore --list` 正常）。
- 发布后：迁移 3 条；启动任务 `moved chart 1 (35300290027345d2a997e81dcc247e78)`，`{ moved: 1, cleared: 0, failed: 0 }`。`files` 3 行（zip 7565962、ogg 7146133、jpg 19024 字节），`retired_objects` 0。桶内 `sekai-fanmade/` 只剩这 3 个对象，旧键已删。
- 核对：经 CDN 下载 3 个对象的 SHA-256 与键名一致；ZIP 的 Content-Disposition 是「言って。 [MASTER 30].zip」，`immutable` 一年缓存，CORS `*`；`/api/v1/charts/1` 与按 id 都 200，`/charts/1` 307 到 id 网址，`/charts/1/download` 302 到哈希 ZIP，`#1` 搜得到；伪造游戏令牌 401；fanmade、database、profile 200，sso 302。
- 旧键 `charts/1/r1/package.zip` 经 CDN 仍是 200：CloudFront 边缘缓存（旧对象带一年缓存头），S3 上已删。没有地方再引用它；要立即清掉需在 CloudFront 对 `/sekai-fanmade/charts/*` 做 invalidation（本站 IAM 用户没有这个权限）。
- 还没做：没用真实账号在游戏里对新版本登录、下载、游玩。

### 2026-11-09 删除旧存储列（`47b29d5`，迁移 0003）

- 发布前：没有「未删除却没有文件」的谱面（0 行），1 首谱面、3 个文件，迁移 3 条。备份 `/var/backups/sekai-fanmade/pre-0003-20261109T051942Z.dump`（root 600，`pg_restore --list` 正常）。
- 0003 先检查没有谱面还靠旧键（否则报错、整个迁移回滚），再删 `package_key`、`package_size`、`package_sha256`、`audio_key`、`jacket_key`，加 `charts_files_check`。启动搬迁任务 `legacy-files.ts` 一并删除。
- 发布后：迁移 4 条，旧列不在，约束存在；谱面 1 的 id、大小、哈希 ZIP 不变，`/charts/1` 307、下载 302、`/readyz` 200；相邻站点不变。

### 2026-11-09 Reddit 式赞踩与评论（`b24ec0c`，迁移 0004）

- 内容：谱面和评论的赞踩、楼中楼评论（五种排序、编辑、删除占位、折叠）、karma；`hot` 为 Reddit hot，`top` 为得分（见 README「赞踩与评论」）。游戏端是 OpenSekai 分支 `reddit-votes`（`325c91e`、`778e5e4`）：▲／▼ 按钮，おすすめ・人気 用 `hot`，ランキング 総合 用 `top`。
- 发布前：1 首谱面、1 个用户、0 个喜欢、0 条评论，迁移 4 条，无 `idle in transaction`。备份 `/var/backups/sekai-fanmade/pre-0004-20261109T054202Z.dump`（root 600，`pg_restore --list` 正常）。
- 发布后：迁移 5 条；`chart_likes` 已删，`chart_votes`、`comment_votes` 与函数 `comment_confidence`、`comment_controversy` 存在；谱面 1 得分 0、评论 0。
- 核对：首页（默认热门）、`?sort=top`、谱面页、`/readyz` 200，`/charts/1` 307；`hot`、`popular`、`plays` 列表与评论列表 200，返回 `score`／`upvotes`／`downvotes`、不再有 `likeCount`；旧的 `/like` 404；未登录投票 401，伪造 Origin 403。网页上赞踩与评论按钮正常显示（未登录）。
- 旧版游戏仍能浏览、下载、排序，但喜欢数显示 0、点喜欢会报错，直到用上 `reddit-votes` 的版本。
- 没有验证：没用真实账号在生产上投票、评论（本地开发库与游戏 Editor 全部走通过）。
