#!/bin/sh
# 浏览器缓存初始化脚本
# 作用：将镜像内备份浏览器复制到持久卷（首次/卷为空时）。

set -eu

BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
BACKUP_PATH="${PLAYWRIGHT_BROWSERS_BACKUP:-/tmp/playwright-browsers-backup}"

echo "=========================================="
echo "🔧 浏览器初始化检查"
echo "目标路径: ${BROWSERS_PATH}"
echo "备份路径: ${BACKUP_PATH}"
echo "=========================================="

# 若持久卷已有 chromium，则跳过复制
if [ -d "${BROWSERS_PATH}" ] && ls -A "${BROWSERS_PATH}" 2>/dev/null | grep -q chromium; then
  echo "✅ 已检测到已存在的浏览器缓存，跳过初始化"
  exit 0
fi

# 确保目标目录存在
mkdir -p "${BROWSERS_PATH}"

# 从镜像内备份复制到持久卷
if [ -d "${BACKUP_PATH}" ] && [ "$(ls -A "${BACKUP_PATH}" 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "📦 正在复制浏览器文件..."
  cp -r "${BACKUP_PATH}"/* "${BROWSERS_PATH}/"

  # 验证复制结果
  if ls -A "${BROWSERS_PATH}" 2>/dev/null | grep -q chromium; then
    echo "✅ 浏览器初始化完成"
  else
    echo "❌ 未在 ${BROWSERS_PATH} 找到 chromium 目录"
    exit 1
  fi
else
  echo "❌ 备份目录为空或不存在：${BACKUP_PATH}"
  exit 1
fi
