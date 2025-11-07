#!/usr/bin/env node

/**
 * 独立的浏览器验证脚本
 * 用于在容器启动时快速检查浏览器是否可用
 */

const fs = require('fs');
const path = require('path');

const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';

function verifyBrowser() {
  console.log('🔍 验证浏览器安装...');
  
  // 检查浏览器路径存在
  if (!fs.existsSync(browsersPath)) {
    console.error(`❌ 浏览器路径不存在: ${browsersPath}`);
    process.exit(1);
  }
  
  console.log(`✅ 浏览器路径存在: ${browsersPath}`);
  
  // 列出浏览器目录内容
  try {
    const files = fs.readdirSync(browsersPath);
    console.log(`📂 目录内容: ${files.join(', ')}`);
    
    // 检查 chromium 目录
    const chromiumDirs = files.filter(f => f.startsWith('chromium'));
    if (chromiumDirs.length === 0) {
      console.error('❌ 未找到 Chromium 目录');
      process.exit(1);
    }
    
    console.log(`✅ 找到 Chromium: ${chromiumDirs.join(', ')}`);
    
    // 检查可执行文件
    for (const dir of chromiumDirs) {
      const chromiumPath = path.join(browsersPath, dir);
      const executableCandidates = [
        'chrome',
        'chromium',
        'chrome-linux/chrome',
        'chrome-win/chrome.exe',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
      ];
      
      let found = false;
      for (const candidate of executableCandidates) {
        const execPath = path.join(chromiumPath, candidate);
        if (fs.existsSync(execPath)) {
          try {
            const stats = fs.statSync(execPath);
            if (stats.isFile()) {
              console.log(`✅ 找到可执行文件: ${execPath}`);
              found = true;
              break;
            }
          } catch (err) {
            // 继续尝试下一个
          }
        }
      }
      
      if (!found) {
        console.warn(`⚠️  未在 ${chromiumPath} 中找到可执行文件`);
      }
    }
    
    console.log('✅ 浏览器验证完成');
    process.exit(0);
    
  } catch (err) {
    console.error(`❌ 读取浏览器目录失败: ${err.message}`);
    process.exit(1);
  }
}

// 执行验证
verifyBrowser();
