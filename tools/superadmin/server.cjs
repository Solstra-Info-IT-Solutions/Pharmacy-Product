#!/usr/bin/env node
/**
 * Super admin panel: a small local web app for creating and editing shop modules (shops/<id>/) and starting builds.
 * It only listens on 127.0.0.1 and writes nothing but shop module files and the shop's EAS profiles.
 *
 *   npm run superadmin            → http://127.0.0.1:4900
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const shops = require('../shops.cjs');
const { buildArgs } = require('../shop-cli.cjs');

const PORT = Number(process.env.SUPERADMIN_PORT ?? 4900);
const HOST = '127.0.0.1';
const MAX_UPLOAD = 10 * 1024 * 1024;
const INDEX = path.join(__dirname, 'index.html');

/** Builds started from the panel, with their output, kept while the panel runs. */
const jobs = new Map();
let nextJob = 1;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'File is too large (10 MB max)')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req) => { try { return JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Invalid JSON'); } };

function shopSummary(id) {
  const s = shops.readShop(id);
  const { errors, warnings } = shops.checkShop(id);
  return { id, name: s.name, androidPackage: s.app.androidPackage, primary: s.theme.primary, isDefault: shops.defaultShopId() === id, errors: errors.length, warnings: warnings.length };
}

function shopDetail(id) {
  return {
    shop: shops.readShop(id),
    files: shops.fileStatus(id).map(({ name, label, kind, required, present, bytes, placeholder }) => ({ name, label, kind, required, present, bytes, placeholder })),
    check: shops.checkShop(id),
    envTemplate: shops.backendEnvTemplate(id),
    isDefault: shops.defaultShopId() === id,
  };
}

function startBuild(id, profile, platform) {
  const args = [...buildArgs(id, profile, platform), '--non-interactive', '--no-wait'];
  const job = { id: nextJob++, shop: id, command: `SHOP=${id} npx ${args.join(' ')}`, status: 'running', log: '', startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  const child = spawn('npx', args, { cwd: path.join(shops.ROOT, 'mobile'), shell: true, env: { ...process.env, SHOP: id, CI: '1' } });
  const append = (d) => { job.log = (job.log + d.toString()).slice(-200_000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (e) => { append(`\n${e.message}\n`); job.status = 'failed'; });
  child.on('exit', (code) => { job.status = code === 0 ? 'done' : 'failed'; append(`\n[exit ${code}]\n`); });
  return job;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method;

  if (method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync(INDEX), 'text/html; charset=utf-8');
  if (parts[0] !== 'api') throw new HttpError(404, 'Not found');

  if (parts[1] === 'meta' && method === 'GET') {
    const t = shops.readShop(shops.listShops()[0] ?? shops.defaultShopId());
    return send(res, 200, { themeKeys: Object.keys(t.theme), files: shops.FILES.map(({ name, label, kind, required }) => ({ name, label, kind, required })) });
  }
  if (parts[1] === 'jobs' && parts[2] && method === 'GET') {
    const job = jobs.get(Number(parts[2]));
    if (!job) throw new HttpError(404, 'No such build');
    return send(res, 200, job);
  }
  if (parts[1] !== 'shops') throw new HttpError(404, 'Not found');

  const id = parts[2];
  if (!id) {
    if (method === 'GET') return send(res, 200, shops.listShops().map(shopSummary));
    if (method === 'POST') { const shop = shops.createShop(await readJson(req)); return send(res, 201, shopDetail(shop.id)); }
    throw new HttpError(405, 'Method not allowed');
  }
  if (!shops.listShops().includes(id)) throw new HttpError(404, `Shop "${id}" not found`);
  const action = parts[3];

  if (!action) {
    if (method === 'GET') return send(res, 200, shopDetail(id));
    if (method === 'PUT') { shops.updateShop(id, await readJson(req)); return send(res, 200, shopDetail(id)); }
  }
  if (action === 'file') {
    const name = url.searchParams.get('name') ?? '';
    const spec = shops.FILES.find((f) => f.name === name);
    if (!spec) throw new HttpError(400, 'Unknown file');
    if (method === 'GET') {
      const file = shops.shopFile(id, name);
      if (!file) throw new HttpError(404, 'Not uploaded');
      return send(res, 200, fs.readFileSync(file), spec.kind === 'png' ? 'image/png' : 'text/plain; charset=utf-8');
    }
    if (method === 'PUT') { shops.writeShopFile(id, name, await readBody(req, MAX_UPLOAD)); return send(res, 200, shopDetail(id)); }
  }
  if (action === 'default' && method === 'POST') { shops.setDefaultShop(id); return send(res, 200, shopDetail(id)); }
  if (action === 'build' && method === 'POST') {
    const { profile, platform } = await readJson(req);
    const { errors } = shops.checkShop(id);
    if (errors.length) throw new HttpError(400, `Fix these first: ${errors.join('; ')}`);
    return send(res, 202, startBuild(id, profile, platform));
  }
  throw new HttpError(405, 'Method not allowed');
}

const server = http.createServer(async (req, res) => {
  try {
    // Only this machine's browser: refuse other Host names (DNS rebinding) and cross-site writes (a custom header
    // cannot be sent cross-origin without a CORS preflight, which this server never approves).
    const host = String(req.headers.host ?? '');
    if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) throw new HttpError(403, 'Forbidden host');
    if (req.method !== 'GET' && req.headers['x-superadmin'] !== '1') throw new HttpError(403, 'Missing x-superadmin header');
    await route(req, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 400;
    send(res, status, { error: e.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Super admin panel: http://${HOST}:${PORT}  (Ctrl+C to stop)`));
