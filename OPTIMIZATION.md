# 方案 A 优化实施说明

## 已完成的优化

### 1. 浏览器持久化验证强化

#### Dockerfile 改进
- **严格验证浏览器安装**：在 `browser` stage 添加了强制验证逻辑
  - 检查 chromium 目录存在
  - 验证可执行文件存在且可执行
  - 构建失败时立即退出，避免生成无效镜像

- **运行时验证**：在 `runtime` stage 再次验证浏览器
  - 确保浏览器成功复制到最终镜像
  - 启动前即可发现问题

#### 关键代码
```dockerfile
# 安装时验证
RUN npx -y playwright-core install --no-shell chromium && \
  test -d ${PLAYWRIGHT_BROWSERS_PATH}/chromium-* || (echo "❌ Chromium not found" && exit 1) && \
  find ${PLAYWRIGHT_BROWSERS_PATH}/chromium-* -name chrome -o -name chromium | head -n 1 | xargs test -x

# 运行时验证
RUN test -d ${PLAYWRIGHT_BROWSERS_PATH}/chromium-* || (echo "❌ Browser missing in runtime" && exit 1)
```

---

### 2. Smithery 配置优化

#### volumes 双重保护
```yaml
volumes:
  # 浏览器缓存 - 挂载到镜像内置路径（冗余保护）
  - name: "playwright-browsers"
    mountPath: "/ms-playwright"
    retention: "24h"
  # 输出目录
  - name: "playwright-output"
    mountPath: "/tmp/playwright-output"
    retention: "24h"
```

**策略**：
- 即使 Smithery 清空 volume，浏览器已经 baked 到镜像层
- volume 作为额外缓存层，提高冷启动速度

---

### 3. 浏览器预热机制

#### 新增功能
- **启动时验证**：使用独立脚本 `verify-browser.js` 检查浏览器
- **主动预热**：后端就绪后发送测试请求，确保浏览器可用
- **智能安装**：仅在浏览器不健康时触发安装

#### 启动流程
```
验证浏览器 → (不健康则)安装 → 启动后端 → 启动代理 → 预热浏览器 → 完全就绪
```

---

### 4. 独立浏览器验证脚本

**文件**：`verify-browser.js`

**功能**：
- 检查浏览器路径存在
- 验证 chromium 目录
- 查找可执行文件（跨平台）
- 详细日志输出

**使用场景**：
- 容器启动时快速检查
- 调试浏览器问题
- 手动验证：`node verify-browser.js`

---

### 5. 超时配置标准化

**调整为平台标准**：
```js
STARTUP_TIMEOUT = 60000       // 60秒（平台标准）
REQUEST_TIMEOUT = 60000       // 60秒
HEALTH_CHECK_INTERVAL = 25000 // 25秒
```

**原因**：
- Smithery 等平台通常限制 60 秒超时
- 避免超时被平台中断

---

## 预期效果

### ✅ 解决的问题
1. **冷启动稳定**：浏览器固化到镜像，不依赖运行时安装
2. **消除 ETXTBSY**：启动阻塞机制确保浏览器就绪后才接受请求
3. **更快响应**：预热机制避免首次请求慢启动
4. **更好排查**：独立验证脚本便于诊断

### ⚠️ 潜在问题
- 如果 Smithery 不支持 volumes，冗余保护失效
- 预热请求可能在某些配置下失败（非致命）

---

## 验证步骤

### 本地验证
```bash
# 1. 构建镜像
docker build -t playwright-mcp .

# 2. 运行容器
docker run -p 8081:8081 playwright-mcp

# 3. 观察启动日志
# 应该看到：
# 🔍 检查浏览器状态...
# ✅ 浏览器验证完成
# ✅ 后端就绪，开始预热...
# ✅ 浏览器预热成功
# ✅ 服务完全就绪，可以接受请求

# 4. 测试健康检查
curl http://localhost:8081/health
```

### Smithery 验证
1. 推送代码到仓库
2. 在 Smithery 触发构建
3. 部署后等待 24 小时不使用
4. 再次调用，观察是否需要重新安装浏览器
5. 测试多并发请求

---

## 回滚方案

如果优化引入问题，可以：

### 1. 禁用预热
注释 `proxy-server.js` 中的预热调用：
```js
// await warmupBrowser();  // 临时禁用
```

### 2. 禁用启动验证
```js
// const browserHealthy = await verifyBrowserHealth();  // 跳过验证
```

### 3. 恢复旧配置
使用 git 回退到优化前版本

---

## 下一步

如果问题仍然存在，考虑：
- **方案 B**：探索 WebSocket 模式（已记忆）
- **方案 C**：自定义浏览器池（彻底重构）

---

## 文件清单

**新增文件**：
- `verify-browser.js` - 浏览器验证脚本
- `OPTIMIZATION.md` - 本文档

**修改文件**：
- `proxy-server.js` - 添加预热、健康检查
- `Dockerfile` - 强化验证逻辑
- `smithery.yaml` - 优化 volumes 配置
