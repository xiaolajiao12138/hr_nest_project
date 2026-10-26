# ========================================================
# 第一阶段: 编译打包阶段 (Builder)
# ========================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm 并配置国内镜像加速
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm config set registry https://registry.npmmirror.com

# 拷贝依赖描述文件
COPY package.json pnpm-lock.yaml ./

# 完整安装依赖 (含 devDependencies)
RUN pnpm install --frozen-lockfile

# 拷贝源代码并编译
COPY tsconfig.json nest-cli.json ./
COPY src/ ./src/
RUN pnpm run build

# 剔除开发依赖，只保留生产运行依赖
RUN pnpm prune --prod

# ========================================================
# 第二阶段: 极简生产运行镜像 (Runner)
# ========================================================
FROM node:20-alpine AS runner

WORKDIR /app

# 设置生产环境及统一东八区时区
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

# 仅从构建阶段拷贝编译产物与生产依赖
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 暴露 NestJS 服务端口
EXPOSE 3000

# 生产环境启动指令
CMD ["node", "dist/main.js"]
