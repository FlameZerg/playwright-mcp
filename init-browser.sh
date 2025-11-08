#!/bin/sh
# 娴忚鍣ㄦ櫤鑳藉垵濮嬪寲鑴氭湰
# 鐢ㄩ€旓細妫€鏌ュ嵎鍐呮祻瑙堝櫒鏄惁瀛樺湪锛屼笉瀛樺湪鍒欎粠闀滃儚澶囦唤澶嶅埗

set -e

BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
BACKUP_PATH="${PLAYWRIGHT_BROWSERS_BACKUP:-/tmp/playwright-browsers-backup}"

echo "=========================================="
echo "馃攳 娴忚鍣ㄥ垵濮嬪寲妫€鏌?
echo "鐩爣璺緞: ${BROWSERS_PATH}"
echo "澶囦唤璺緞: ${BACKUP_PATH}"
echo "=========================================="

# 妫€鏌ュ嵎鍐呮槸鍚﹀凡鏈夋祻瑙堝櫒
if [ -d "${BROWSERS_PATH}" ] && [ "$(ls -A ${BROWSERS_PATH} 2>/dev/null | grep -c 'chromium')" -gt 0 ]; then
  echo "鉁?鍗峰唴娴忚鍣ㄥ凡瀛樺湪锛岃烦杩囧垵濮嬪寲"
  ls -lh "${BROWSERS_PATH}"
else
  echo "鈿狅笍  鍗峰唴娴忚鍣ㄤ笉瀛樺湪锛屽紑濮嬩粠澶囦唤澶嶅埗..."
  
  # 纭繚鐩爣鐩綍瀛樺湪
  mkdir -p "${BROWSERS_PATH}"
  
  # 浠庡浠藉鍒跺埌鍗?
  if [ -d "${BACKUP_PATH}" ] && [ "$(ls -A ${BACKUP_PATH} 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "馃摝 澶嶅埗娴忚鍣ㄦ枃浠?.."
    cp -r "${BACKUP_PATH}"/* "${BROWSERS_PATH}/"
    
    # 楠岃瘉澶嶅埗缁撴灉
    if [ "$(ls -A ${BROWSERS_PATH} 2>/dev/null | grep -c 'chromium')" -gt 0 ]; then
      echo "鉁?娴忚鍣ㄥ垵濮嬪寲鎴愬姛"
      ls -lh "${BROWSERS_PATH}"
    else
      echo "鉂?澶嶅埗鍚庢湭鎵惧埌娴忚鍣ㄦ枃浠?
      exit 1
    fi
  else
    echo "鉂?澶囦唤鐩綍涓虹┖鎴栦笉瀛樺湪"
    exit 1
  fi
fi

echo "=========================================="
echo "鉁?娴忚鍣ㄥ垵濮嬪寲瀹屾垚"
echo "=========================================="
