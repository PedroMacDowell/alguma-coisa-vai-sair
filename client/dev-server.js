import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { rollup } from 'rollup';

const ROOT = process.cwd();
const PORT = 5173;
const API_ORIGIN = 'http://127.0.0.1:3001';
const DIST_DIR = path.join(ROOT, 'dist-fallback');
const BUNDLE_FILE = path.join(DIST_DIR, 'bundle.js');
const CSS_FILE = path.join(ROOT, 'src', 'styles.css');

async function ensureDist() {
  await fs.mkdir(DIST_DIR, { recursive: true });
}

function babelJsxPlugin() {
  return {
    name: 'babel-jsx',
    async transform(code, id) {
      if (!id.endsWith('.jsx') && !id.endsWith('.js')) {
        return null;
      }

      if (id.includes('node_modules')) {
        return null;
      }

      const babelCore = await import('@babel/core');
      const presetReactMod = await import('@babel/preset-react');
      const presetReact = presetReactMod.default || presetReactMod;
      const result = await babelCore.transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: false,
        presets: [[presetReact, { runtime: 'classic' }]],
      });
      return result ? { code: result.code, map: null } : null;
    },
  };
}

function browserEnvPlugin() {
  return {
    name: 'browser-env',
    transform(code) {
      if (!code.includes('process.env.NODE_ENV')) {
        return null;
      }

      return {
        code: code.replaceAll('process.env.NODE_ENV', JSON.stringify(process.env.NODE_ENV || 'development')),
        map: null,
      };
    },
  };
}

async function bundleFallbackApp() {
  const resolveMod = await import('@rollup/plugin-node-resolve');
  const commonjsMod = await import('@rollup/plugin-commonjs');
  const resolve = resolveMod.nodeResolve || resolveMod.default;
  const commonjs = commonjsMod.commonjs || commonjsMod.default;

  await ensureDist();
  const bundle = await rollup({
    input: path.join(ROOT, 'src', 'main.jsx'),
    plugins: [browserEnvPlugin(), resolve({ extensions: ['.mjs', '.js', '.jsx', '.json'] }), commonjs(), babelJsxPlugin()],
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') {
        return;
      }
      warn(warning);
    },
  });

  await bundle.write({
    file: BUNDLE_FILE,
    format: 'iife',
    name: 'SchoolRegisterApp',
    sourcemap: false,
    intro: "var process = window.process || { env: { NODE_ENV: 'development' } };",
  });

  await bundle.close();
}

function htmlPage() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>School Register</title>
    <meta name="description" content="Sistema de cadastro de alunos e boletim escolar." />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="/fallback/bundle.js?v=${Date.now()}"></script>
  </body>
</html>`;
}

async function proxyApi(req, res, targetUrl) {
  const url = new URL(req.url, API_ORIGIN);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (key === 'host' || key === 'connection' || key === 'content-length') continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } else {
    res.end();
  }
}

async function serveStatic(filePath, res, contentType) {
  const data = await fs.readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(data);
}

async function startFallbackServer() {
  await bundleFallbackApp();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

      if (url.pathname.startsWith('/api/')) {
        await proxyApi(req, res, API_ORIGIN);
        return;
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlPage());
        return;
      }

      if (url.pathname === '/fallback/bundle.js') {
        res.setHeader('Cache-Control', 'no-store');
        await serveStatic(BUNDLE_FILE, res, 'application/javascript; charset=utf-8');
        return;
      }

      if (url.pathname === '/src/styles.css') {
        await serveStatic(CSS_FILE, res, 'text/css; charset=utf-8');
        return;
      }

      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: error.message || 'Unexpected error' }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  console.log(`Fallback React server running on http://127.0.0.1:${PORT}`);
}

async function start() {
  try {
    const viteMod = await import('vite');
    const vite = await viteMod.createServer({
      root: ROOT,
      server: {
        host: '127.0.0.1',
        port: PORT,
        proxy: {
          '/api': 'http://127.0.0.1:3001',
        },
      },
    });

    await vite.listen();
    console.log(`Vite server running on http://127.0.0.1:${PORT}`);
  } catch (error) {
    console.warn(`Vite could not start in this environment, using fallback server instead.`);
    console.warn(error.message);
    await startFallbackServer();
  }
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
