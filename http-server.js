#!/usr/bin/env node

const http = require('http');
const { createConnection } = require('./index.js');

const PORT = process.env.PORT || 8081;
const HOST = '0.0.0.0';

console.log(`Starting Playwright MCP HTTP server on ${HOST}:${PORT}`);

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-*');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/.well-known/mcp-config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configSchema: {
        type: 'object',
        properties: {
          browserName: {
            type: 'string',
            enum: ['chromium', 'firefox', 'webkit'],
            description: 'Browser type to use for automation',
            default: 'chromium'
          },
          headless: {
            type: 'boolean',
            description: 'Run browser in headless mode',
            default: true
          }
        }
      }
    }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', async () => {
    try {
      const message = JSON.parse(body);
      
      // Create MCP connection (stdio simulation via memory)
      const connection = await createConnection({
        browserName: process.env.BROWSER_NAME || 'chromium',
        headless: true
      });

      // Handle the message
      const response = await connection.handleMessage(message);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message
        },
        id: null
      }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HTTP MCP server listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
