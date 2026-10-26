# ========================================================
# 第一阶段: 编译打包前端静态资源 (Builder)
# ========================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm 并配置国内镜像加速
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm config set registry https://registry.npmmirror.com

# 拷贝依赖配置并安装
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 拷贝前端代码并进行生产构建
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY .env.production ./
COPY src/ ./src/

RUN pnpm run build

# ========================================================
# 第二阶段: 基于 Nginx Alpine 的静态资源托管
# ========================================================
FROM nginx:alpine AS runner

# 设置东八区时区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

# 从构建阶段拷贝编译产物到 Nginx Web 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露 80 端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
