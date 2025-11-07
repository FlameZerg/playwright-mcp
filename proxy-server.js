#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8081;
const HOST = '0.0.0.0';
const BACKEND_PORT = 8082;
const STARTUP_TIMEOUT = 60000; // 60秒启动超时
const HEALTH_CHECK_INTERVAL = 25000; // 25秒健康检查
const REQUEST_TIMEOUT = 60000; // 60秒请求超时
const RETRY_DELAYS = [1000, 2000, 5000]; // 重试延迟：1s, 2s, 5s（指数退避）

let isBackendReady = false;
let isBrowserInstalled = false;
let isInstallingBrowser = false;
let startupTimer = null;

console.log('========================================');
console.log(`🚀 启动 Playwright MCP 代理服务器 ${HOST}:${PORT}`);
console.log(`   环境: ${process.env.NODE_ENV || 'production'}`);
console.log(`   浏览器路径: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
console.log('========================================');

// 浏览器检查与安装
const fs = require('fs');
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';

function checkBrowserInstalled() {
  if (!fs.existsSync(browsersPath)) {
    return false;
  }
  try {
    const files = fs.readdirSync(browsersPath);
    const hasChromium = files.some(f => f.startsWith('chromium'));
    if (hasChromium) {
      console.log(`✅ 浏览器已就绪: ${browsersPath}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`❌ 浏览器检查失败: ${err.message}`);
    return false;
  }
}

// 浏览器同步安装（阻塞式，确保完成后才启动服务）
function installBrowserSync() {
  return new Promise((resolve, reject) => {
    if (checkBrowserInstalled()) {
      isBrowserInstalled = true;
      resolve();
      return;
    }

    console.warn('⚠️  浏览器未安装，开始自动安装...');
    isInstallingBrowser = true;

    const installProcess = spawn('npx', ['-y', 'playwright-core', 'install', '--no-shell', 'chromium'], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    installProcess.on('exit', (code) => {
      isInstallingBrowser = false;
      if (code === 0) {
        if (checkBrowserInstalled()) {
          console.log('✅ 浏览器安装成功');
          isBrowserInstalled = true;
          resolve();
        } else {
          console.error('❌ 安装完成但浏览器未找到');
          reject(new Error('Browser not found after installation'));
        }
      } else {
        console.error(`❌ 浏览器安装失败 (退出码: ${code})`);
        reject(new Error(`Installation failed with code ${code}`));
      }
    });

    installProcess.on('error', (err) => {
      isInstallingBrowser = false;
      console.error(`❌ 安装进程启动失败: ${err.message}`);
      reject(err);
    });
  });
}

// 进程锁管理
const LOCK_FILE = '/tmp/playwright-mcp.lock';

function cleanupLocks() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    // 静默失败
  }
}

cleanupLocks();

let playwrightProcess = null;
let isStarting = false;
let healthCheckTimer = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

function startPlaywrightBackend() {
  if (playwrightProcess || isStarting) {
    return;
  }
  
  isStarting = true;
  console.log('🚀 启动 Playwright MCP 后端...');
  
  playwrightProcess = spawn('node', [
    'cli.js',
    '--headless',
    '--browser', 'chromium',
    '--no-sandbox',
    '--port', BACKEND_PORT,
    '--isolated',
    '--shared-browser-context',
    '--save-session',
    '--timeout-action=60000',
    '--timeout-navigation=60000',
    '--output-dir=/tmp/playwright-output'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  playwrightProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    // 仅记录关键启动信息
    if (message.includes('listening') || message.includes('started') || message.includes(BACKEND_PORT)) {
      isBackendReady = true;
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      console.log('✅ 后端服务已就绪');
    }
  });

  playwrightProcess.stderr.on('data', (data) => {
    const errorMsg = data.toString().trim();
    // 仅记录关键错误
    if (errorMsg.includes('ETXTBSY')) {
      console.error('❌ 浏览器文件锁冲突 (ETXTBSY)');
      cleanupLocks();
    } else if (errorMsg.includes('not installed') || errorMsg.includes('Executable doesn')) {
      console.error('❌ 浏览器缺失错误');
    }
  });

  playwrightProcess.on('error', (error) => {
    console.error(`❌ 后端启动失败: ${error.message}`);
    isStarting = false;
    playwrightProcess = null;
  });

  playwrightProcess.on('exit', (code, signal) => {
    isStarting = false;
    playwrightProcess = null;
    if (code !== 0 && code !== null) {
      console.error(`❌ 后端异常退出 (code: ${code}, signal: ${signal})`);
    }
  });

  isStarting = false;
  startHealthMonitoring();
}

// 健康监控
function startHealthMonitoring() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }
  
  healthCheckTimer = setInterval(() => {
    if (!playwrightProcess || !isBackendReady) {
      return;
    }
    
    checkBackendHealth((healthy) => {
      if (healthy) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`❌ 后端健康检查失败 ${MAX_CONSECUTIVE_FAILURES} 次，重启中...`);
          consecutiveFailures = 0;
          
          if (playwrightProcess) {
            playwrightProcess.kill('SIGTERM');
            playwrightProcess = null;
          }
          
          isBackendReady = false;
          cleanupLocks();
          
          setTimeout(() => {
            startPlaywrightBackend();
          }, 3000);
        }
      }
    });
  }, HEALTH_CHECK_INTERVAL);
}


// 健康检查
function checkBackendHealth(callback) {
  const req = http.request({
    hostname: 'localhost',
    port: BACKEND_PORT,
    path: '/',
    method: 'GET',
    timeout: 2000
  }, (res) => {
    callback(true);
    req.destroy();
  });

  req.on('error', () => callback(false));
  req.on('timeout', () => {
    callback(false);
    req.destroy();
  });

  req.end();
}

// 等待后端就绪
function waitForBackend(callback) {
  if (isBackendReady) {
    callback();
    return;
  }

  const startTime = Date.now();
  const checkInterval = setInterval(() => {
    checkBackendHealth((healthy) => {
      if (healthy) {
        clearInterval(checkInterval);
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        isBackendReady = true;
        callback();
      }
    });
  }, 5000);

  startupTimer = setTimeout(() => {
    clearInterval(checkInterval);
    console.error('⚠️  后端启动超时');
    callback();
  }, STARTUP_TIMEOUT);
}

// 浏览器预热（验证浏览器可用性）
async function warmupBrowser() {
  return new Promise((resolve) => {
    const warmupReq = http.request({
      hostname: 'localhost',
      port: BACKEND_PORT,
      path: '/mcp',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ 浏览器预热成功');
        }
        resolve();
      });
    });

    warmupReq.on('error', () => {
      console.warn('⚠️  预热失败，但继续运行');
      resolve();
    });

    warmupReq.on('timeout', () => {
      warmupReq.destroy();
      console.warn('⚠️  预热超时');
      resolve();
    });

    warmupReq.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 'warmup'
    }));
    warmupReq.end();
  });
}

// 验证浏览器健康（使用独立脚本）
function verifyBrowserHealth() {
  return new Promise((resolve) => {
    const testProcess = spawn('node', ['verify-browser.js'], {
      stdio: 'inherit',
      timeout: 10000,
      env: { ...process.env }
    });

    testProcess.on('exit', (code) => {
      resolve(code === 0);
    });

    testProcess.on('error', (err) => {
      console.error(`❌ 验证进程启动失败: ${err.message}`);
      resolve(false);
    });
  });
}

// 转发请求（带指数退避重试）
function forwardRequest(req, res, retryCount = 0) {
  const proxyHeaders = { ...req.headers };
  proxyHeaders.host = `localhost:${BACKEND_PORT}`;

  const proxyReq = http.request({
    hostname: 'localhost',
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: proxyHeaders,
    timeout: REQUEST_TIMEOUT
  }, (proxyRes) => {
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    const canRetry = retryCount < RETRY_DELAYS.length && 
                     (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT');
    
    if (canRetry) {
      const delay = RETRY_DELAYS[retryCount];
      setTimeout(() => {
        forwardRequest(req, res, retryCount + 1);
      }, delay);
    } else {
      console.error(`❌ 请求失败: ${error.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Backend unavailable',
          message: error.message
        }));
      }
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timeout' }));
    }
  });

  req.pipe(proxyReq);
}

// 代理服务器
const proxyServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 健康检查
  if (req.url === '/health' || req.url === '/healthz') {
    if (isBackendReady && isBrowserInstalled) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
    } else if (isInstallingBrowser) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'installing', message: '浏览器安装中，请稍候...' }));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'starting' }));
    }
    return;
  }

  // 移除浏览器安装阻塞，让 Playwright 自己处理
  // 如果浏览器缺失，Playwright 会返回错误信息

  // 后端未就绪
  const isMcpEndpoint = req.url === '/mcp' || req.url.startsWith('/mcp/');
  if (!isMcpEndpoint && !isBackendReady) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '10' });
    res.end(JSON.stringify({
      error: 'Service starting',
      message: '服务启动中，请稍后重试'
    }));
    return;
  }

  forwardRequest(req, res);
});

// 快速启动流程：直接启动，后台验证
(async () => {
  try {
    // 直接检查浏览器是否存在
    isBrowserInstalled = checkBrowserInstalled();
    
    if (!isBrowserInstalled) {
      console.warn('⚠️  浏览器未检测到，将在后台自动安装');
      // 后台异步安装，不阻塞启动
      installBrowserSync().then(() => {
        isBrowserInstalled = true;
        console.log('✅ 后台安装完成');
      }).catch(err => {
        console.error(`❌ 后台安装失败: ${err.message}`);
      });
    }
    
    // 立即启动后端（不等待浏览器）
    startPlaywrightBackend();
    
    // 启动代理服务器
    proxyServer.listen(PORT, HOST, () => {
      console.log(`✅ 代理服务器已启动: http://${HOST}:${PORT}`);
      
      // 后台等待后端就绪
      waitForBackend(() => {
        console.log('✅ 服务就绪');
      });
    });
  } catch (err) {
    console.error(`❌ 启动失败: ${err.message}`);
    process.exit(1);
  }
})();

// 进程清理
process.on('SIGTERM', () => {
  console.log('🛑 服务关闭中...');
  cleanupLocks();
  if (playwrightProcess) playwrightProcess.kill();
  proxyServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 服务关闭中...');
  cleanupLocks();
  if (playwrightProcess) playwrightProcess.kill();
  proxyServer.close();
  process.exit(0);
});

process.on('exit', cleanupLocks);
