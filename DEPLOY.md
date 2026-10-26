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

### 2. 一键构建并启动所有服务
在项目根目录下直接执行：
```bash
docker compose up -d --build
```
> Docker 将会自动完成：
> 1. 拉取 PostgreSQL 16、Redis 7、MinIO 镜像；
> 2. 自动执行 `docker/init.sql`，初始化全部 19 张业务表结构、菜单权限与测试演示数据；
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
