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
