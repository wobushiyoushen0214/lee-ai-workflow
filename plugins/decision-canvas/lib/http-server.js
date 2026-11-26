import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { check, errorData } from './shared.js';

const MAX_BODY = 2 * 1024 * 1024;
function matches(a, b) {
  return typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function startHttpServer(service, { port = 0, assetRoot = new URL('../dist/', import.meta.url) } = {}) {
  const token = randomBytes(32).toString('base64url');
  let origin;
  const server = createServer(async (request, response) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      check(request.headers.host === new URL(origin).host, 'invalid-host', 'Host 不匹配');
      const path = new URL(request.url, origin).pathname;
      if (path === '/api/decision-canvas.invoke') {
        check(request.method === 'POST', 'method-not-allowed', '接口只接受 POST');
        check(!request.headers.origin || request.headers.origin === origin, 'invalid-origin', '请求来源不匹配');
        check(matches(request.headers['x-canvas-token'], token), 'unauthorized', '画布连接已失效，请从 Codex 重新打开');
        check(request.headers['content-type']?.split(';')[0] === 'application/json', 'invalid-input', '需要 JSON 请求');
        let size = 0; const chunks = [];
        for await (const chunk of request) {
          size += chunk.length;
          check(size <= MAX_BODY, 'too-large', '请求超过 2 MB');
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw Object.assign(new Error('请求不是有效 JSON'), { code: 'invalid-input' }); }
        check(body && typeof body === 'object' && !Array.isArray(body), 'invalid-input', '请求必须是对象');
        return send(200, { ok: true, result: await service.dispatch(body.action, body.input || {}) });
      }
      check(request.method === 'GET' || request.method === 'HEAD', 'method-not-allowed', '不支持此请求');
      const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
      const asset = assets[path];
      if (!asset) return send(404, { ok: false, error: { code: 'not-found', message: '页面不存在' } });
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
      const content = await readFile(new URL(asset[0], assetRoot));
      return send(200, request.method === 'HEAD' ? '' : content, asset[1]);
    } catch (error) {
      const status = ['unauthorized', 'invalid-origin', 'invalid-host'].includes(error.code) ? 403 : error.code === 'too-large' ? 413 : 400;
      if (!response.headersSent) send(status, { ok: false, error: errorData(error) });
      else response.end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, token,
    url(workspaceId, contextId) { const query = new URLSearchParams(); if(workspaceId) query.set('workspace',workspaceId); if(contextId) query.set('context',contextId); return `${origin}/?${query}#token=${token}`; },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); },
  };
}
