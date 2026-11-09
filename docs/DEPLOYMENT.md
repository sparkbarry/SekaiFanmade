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
