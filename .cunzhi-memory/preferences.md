# 用户偏好设置

- 超时配置标准：启动超时和请求超时固定为60秒（主流平台限制），健康检测间隔25秒
- 用户偏好：1) 不生成 Markdown 文档、测试脚本；2) 不执行编译和运行；3) 需要支持多用户并发使用；4) --isolated 模式无法满足多用户需求
- 统一服务端 HTTP 超时与保活：server.keepAliveTimeout=60000，server.headersTimeout=60000，server.requestTimeout=60000（多数平台最大 60 秒）。同时遵循：不生成总结性 Markdown 文档；不生成测试脚本；不执行编译；不执行运行。
