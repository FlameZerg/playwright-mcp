# 项目上下文信息

- Smithery 持久化方案完成：1. smithery.yaml 添加 volumes 配置（24h 保留）2. Dockerfile 添加健康检查和目录初始化 3. proxy-server.js 实现浏览器自动安装 4. 用户数据目录 /home/node/.cache/ms-playwright-mcp 和输出目录 /tmp/playwright-output 持久化 5. 详细文档见 SMITHERY_DEPLOYMENT.md
- Playwright MCP 最终配置：1. 使用 --isolated + --shared-browser-context 组合 2. isolated 避免 ETXTBSY 文件锁错误 3. shared-browser-context 实现多客户端共享 4. 超时：action=30s, navigation=60s 5. 容器重启后需重新登录（临时目录） 6. 启用全部 6 个 capabilities: tabs, install, pdf, vision, testing, tracing
