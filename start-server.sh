#!/bin/sh

# Set the PORT environment variable if not set
export PORT=${PORT:-8081}

# 设置输出目录
export PLAYWRIGHT_MCP_OUTPUT_DIR=${PLAYWRIGHT_MCP_OUTPUT_DIR:-/tmp/playwright-output}

# Start the server with isolated mode and session persistence
exec node cli.js \
  --headless \
  --browser chromium \
  --no-sandbox \
  --port $PORT \
  --isolated \
  --shared-browser-context \
  --save-session \
  --timeout-action=60000 \
  --timeout-navigation=60000 \
  --output-dir=$PLAYWRIGHT_MCP_OUTPUT_DIR
