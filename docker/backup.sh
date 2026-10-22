#!/bin/bash
# ========================================================
# 企业级HR人事管理系统 数据库每日自动备份脚本
# ========================================================

BACKUP_DIR="/var/backups/hr_manage_pg"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hr_manage_db_${DATE}.sql.gz"
CONTAINER_NAME="hr_postgres"
DB_NAME="hr_manage_db"
DB_USER="hr_admin"
KEEP_DAYS=30

mkdir -p ${BACKUP_DIR}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行 PostgreSQL 数据库全量备份..."

# 通过 docker exec 执行 pg_dump 并 gzip 压缩
docker exec -t ${CONTAINER_NAME} pg_dump -U ${DB_USER} -d ${DB_NAME} | gzip > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份成功生成文件: ${BACKUP_FILE}"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份执行异常，请检查容器状态与存储空间"
    exit 1
fi

# 自动清理 30 天前的历史备份文件
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理超过 ${KEEP_DAYS} 天的历史备份文件..."
find ${BACKUP_DIR} -name "hr_manage_db_*.sql.gz" -type f -mtime +${KEEP_DAYS} -exec rm -f {} \;

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 数据库每日备份维护完成。"
