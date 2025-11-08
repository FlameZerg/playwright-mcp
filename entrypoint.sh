#!/bin/sh
# 骞惰鍚姩鍏ュ彛鑴氭湰
# 绛栫暐锛氬悗鍙板紓姝ュ垵濮嬪寲娴忚鍣紝涓昏繘绋嬬珛鍗冲惎鍔ㄤ唬鐞嗘湇鍔″櫒

set -e

echo "=========================================="
echo "馃殌 鍚姩 Playwright MCP Server"
echo "=========================================="

# 鍚庡彴寮傛鍒濆鍖栨祻瑙堝櫒
(
  ./init-browser.sh
) &

INIT_PID=$!

# 绔嬪嵆鍚姩浠ｇ悊鏈嶅姟鍣紙涓嶇瓑寰呮祻瑙堝櫒鍒濆鍖栵級
# 浠ｇ悊鏈嶅姟鍣ㄤ細澶勭悊 503 鍝嶅簲锛岀洿鍒板悗绔拰娴忚鍣ㄥ氨缁?
node proxy-server.js &

PROXY_PID=$!

# 绛夊緟浠讳竴杩涚▼閫€鍑?
wait -n $PROXY_PID $INIT_PID

# 濡傛灉浠讳竴杩涚▼閫€鍑猴紝娓呯悊骞堕€€鍑?
EXIT_CODE=$?
kill $PROXY_PID $INIT_PID 2>/dev/null || true
exit $EXIT_CODE
