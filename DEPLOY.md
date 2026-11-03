# 🚀 HR 人力资源数字化管理系统 · 生产部署指南

本指南支持 **纯公网 IP 零域名直接访问（免备案秒上线）** 以及 **自定义域名 + HTTPS** 两种部署模式。

---

## 📌 硬件与系统要求

* **推荐配置**：2核 2G 或 2核 4G 云服务器（阿里云轻量/腾讯云轻量）。
* **推荐操作系统**：Ubuntu 22.04 LTS / Ubuntu 24.04 LTS 或 Debian 12。
* **安全组端口放行**：
  * `22` (SSH 远程连接)
  * `80` (HTTP Web 访问，必须放行)
  * `443` (HTTPS，若配置 SSL 则放行)
  * *注：数据库 5432 与 Redis 6379 仅在 Docker 内部网络通信，严禁对外暴露以防黑客扫描爆破。*

---

## 🛠️ 第一步：服务器基础环境准备

登录你的云服务器终端，按顺序执行以下指令：

### 1. 更新系统并安装 Docker
```bash
# 更新软件包列表
sudo apt update && sudo apt upgrade -y

# 一键安装 Docker 与 Docker Compose 插件
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun

# 启动 Docker 并设置开机自启
sudo systemctl enable --now docker

# 验证安装 (有版本输出即成功)
docker --version
docker compose version
```

### 2. [关键推荐] 针对 2核2G 服务器开启 2GB 虚拟内存 (Swap)
> 💡 2G 内存的云服务器在同时运行数据库、Redis 与 Node 服务时，开启 Swap 可以彻底避免内存突发导致系统 OOM 崩溃！
```bash
# 创建 2GB 的交换文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 设置永久开机挂载
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 验证（Swap 列出现 2.0G 即生效）
free -h
```

---

## 📦 第二步：上传代码并一键部署

### 1. 将项目上传至服务器
可以使用 Git 克隆或通过 SCP/Xftp 将整个工程上传至 `/opt/hr_nest_project` 目录：
```bash
# 切换至项目所在根目录
cd /opt/hr_nest_project
```

### 2. 配置环境变量并一键构建启动所有服务
已有数据库升级前，先按下文“已有数据库增量升级”备份数据库；新版后端启动时会执行迁移。

在项目根目录下复制 `.env.example` 为 `.env`（如需启用右下角 AI 智能助手，请在 `.env` 中填入真实的 `LLM_API_KEY`），然后执行：
```bash
cp -n .env.example .env
# 按需编辑 .env 填写 LLM_API_KEY 及生产数据库/JWT强密码
docker compose up -d --build
```
> Docker 将会自动完成：
> 1. 拉取 PostgreSQL 16、Redis 7、MinIO 镜像；
> 2. 首次部署自动执行 `docker/init.sql`（初始化全部 21 张业务表结构、细粒度数据权限与测试演示数据）；若为已有旧库升级，后端启动时会自动执行幂等数据库迁移补齐新表与新字段；
> 3. 多阶段轻量化编译并构建 NestJS 后端镜像；
> 4. 自动编译 Vue3 前端并注入生产 Nginx 反向代理网关。

### 3. 查看容器健康状态
```bash
docker compose ps
```
所有容器状态显示 `running` 或 `healthy` 即表示全线部署成功！

---

## 🌐 第三步：即刻访问系统

打开电脑或手机浏览器，直接在地址栏输入：
```text
http://<你的服务器公网IP>
```
*无需等待域名解析，无需进行 ICP 备案审核，即可直接点开登录！*

### 🔑 默认内置演示账号

| 角色 | 登录账号 | 初始密码 | 权限范围 |
| :--- | :--- | :--- | :--- |
| **超级管理员** | `admin` | `123456` | 拥有全部管理后台权限（部门/员工/请假/薪资/考勤/绩效/运维审计） |
| **人事专员** | `hr_user` | `123456` | 负责 HR 业务全流程协同管理 |

---

## 🔧 常用日常运维指令

```bash
# 1. 查看后端实时运行日志
docker compose logs -f backend

# 2. 查看 Nginx 访问与错误日志
docker compose logs -f frontend

# 3. 停止所有服务
docker compose down

# 4. 更新代码后平滑重新构建上线
docker compose up -d --build
```

### 启用或更新 AI 配置

后端容器需要 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 三项配置。网关地址、密钥和模型必须属于同一供应商，模型需支持 Chat Completions 的工具调用参数。应用日志中的“AI Agent 初始化完成”只表示本地客户端已初始化，还需通过实际对话验证上游连通性。

使用新版根目录 `docker-compose.yml` 时，在根目录 `.env` 中填写这三项后执行 `docker compose up -d --no-deps --force-recreate backend`，再执行 `docker compose exec -T frontend nginx -s reload`。环境变量在容器创建时注入，单纯 `docker restart` 不会加载修改后的配置。

已部署旧版 Compose 的服务器也可使用独立的私有覆盖文件 `docker/ai.compose.local`，其中只包含 `services.backend.environment` 下的三项 AI 配置，不包含本地数据库、Redis 或 JWT 配置。该文件由 `.gitignore` 的 `*.local` 规则忽略，上传后在服务器项目目录执行：

```bash
chmod 600 docker/ai.compose.local &&
docker compose -f docker-compose.yml -f docker/ai.compose.local config --quiet &&
docker compose -f docker-compose.yml -f docker/ai.compose.local up -d --no-deps --force-recreate backend &&
docker compose exec -T frontend nginx -s reload
```

这种部署方式后续更新或重建后端时也需要带上上述两个 `-f` 参数，确保私有 AI 配置继续加载。完成后在系统 AI 助手发送“你好，请告诉我你可以做什么”，验证完整对话链路。配置文件中包含密钥，不要将文件内容或展开后的 Compose 配置粘贴到聊天或日志中。

### 已有数据库增量升级

如果验证码接口正常，但登录返回 500，且 `sys_user` 缺少 `employee_id`、`sys_role` 缺少 `data_scope` / `scope_dept_ids`，需要执行增量迁移。以下命令在**服务器终端**运行，以实际部署目录 `/opt/hr_project` 为例；本机不需要安装 Docker。

```bash
cd /opt/hr_project &&
umask 077 &&
hr_backup="hr-db-before-upgrade-$(date +%Y%m%d-%H%M%S).dump" &&
docker exec hr_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$hr_backup" &&
docker exec -w /app hr_backend node node_modules/typeorm/cli.js migration:run -d dist/config/typeorm.config.js --transaction all &&
docker restart hr_backend
```

备份保存在服务器项目目录。备份失败会停止后续操作；迁移在事务中执行，失败会回滚，成功才重启后端。正常输出包含 `Migration AccessIsolation1793610000000 has been executed successfully`；已执行过则显示 `No migrations are pending`。生产镜像只包含编译后的 JavaScript，因此使用上述 CLI 命令，不运行依赖 TypeScript 源文件的 `npm run migration:run`。

迁移保留现有业务记录，不会自动扩大普通角色的数据范围。旧角色默认范围为“仅本人”，需要管理员按职责配置；账号与员工仅在用户名和工号完全一致时自动关联，其余由管理员核实绑定。完成后刷新登录页并重新输入验证码登录。

不要在已有业务库上重跑 `docker/init.sql`，其中包含删表语句。迁移若提示业务唯一索引冲突，应核对重复记录后处理，不要删除数据库卷或开启 `DB_SYNCHRONIZE` 绕过迁移。

---

## 🔒 进阶：如何绑定域名与开启 HTTPS（可选）

当你后续申请并备案了域名（如 `hr.yourdomain.com`）：

1. **解析域名**：在云厂商 DNS 控制台将域名添加 A 记录指向服务器公网 IP。
2. **申请免费 SSL 证书**：
   ```bash
   sudo apt install -y certbot
   sudo certbot certonly --standalone -d hr.yourdomain.com
   ```
3. **启用 HTTPS**：
   将生成的证书映射进 Nginx 目录，取消 `docker/nginx.conf` 底部 HTTPS 注释并执行 `docker compose restart frontend` 即可升级为绿色安全锁全站 HTTPS！
