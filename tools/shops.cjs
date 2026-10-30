/**
 * Shop modules: everything that makes one shop's app different from another's lives in shops/<id>/.
 * The app config, Metro, the shop CLI and the super admin panel all read and write modules through this file,
 * so the rules (ids, required files, defaults) are defined once.
 *
 *   shops/<id>/shop.json                 name, ids, API URL, theme colours
 *   shops/<id>/assets/*.png              icon, adaptive icon, splash, logo, favicon
 *   shops/<id>/google-services.json      Firebase Android app
 *   shops/<id>/GoogleService-Info.plist  Firebase iOS app
 *   shops/<id>/firebase-web.json         Firebase web app (web push on the admin website)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SHOPS_DIR = path.join(ROOT, 'shops');
const TEMPLATE_DIR = path.join(SHOPS_DIR, '_template');
const DEFAULT_FILE = path.join(SHOPS_DIR, 'default');
const EAS_FILE = path.join(ROOT, 'mobile', 'eas.json');

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/** Every file a module can hold. `size` is the square size of the generated placeholder image. */
const FILES = [
  { name: 'assets/icon.png', label: 'App icon (1024×1024)', kind: 'png', required: true, size: 1024 },
  { name: 'assets/adaptive-icon.png', label: 'Android adaptive icon (1024×1024, logo in the middle 66%)', kind: 'png', required: true, size: 1024 },
  { name: 'assets/splash-icon.png', label: 'Splash screen image', kind: 'png', required: true, size: 512 },
  { name: 'assets/logo.png', label: 'Logo (login screen, splash animation, invoice)', kind: 'png', required: true, size: 512 },
  { name: 'assets/favicon.png', label: 'Website favicon (48×48)', kind: 'png', required: false, size: 48 },
  { name: 'google-services.json', label: 'Firebase Android config (google-services.json)', kind: 'json', required: true },
  { name: 'GoogleService-Info.plist', label: 'Firebase iOS config (GoogleService-Info.plist)', kind: 'plist', required: false },
  { name: 'firebase-web.json', label: 'Firebase web app config (web push on the admin site)', kind: 'json', required: false },
];
/** Generated placeholder images carry this text chunk, so they can be told apart from the shop's real images. */
const PLACEHOLDER_TAG = 'shop-module-placeholder';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const template = () => readJson(path.join(TEMPLATE_DIR, 'shop.json'));

function assertId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`Shop id "${id}" is not valid: use 3-42 lowercase letters, digits and dashes (e.g. sharma-pharmacy)`);
}

const shopDir = (id) => { assertId(id); return path.join(SHOPS_DIR, id); };

function listShops() {
  if (!fs.existsSync(SHOPS_DIR)) return [];
  return fs.readdirSync(SHOPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && ID_RE.test(d.name) && fs.existsSync(path.join(SHOPS_DIR, d.name, 'shop.json')))
    .map((d) => d.name)
    .sort();
}

function defaultShopId() {
  return fs.existsSync(DEFAULT_FILE) ? fs.readFileSync(DEFAULT_FILE, 'utf8').trim() : '';
}

/** The shop this build or dev server is for: SHOP in the environment, otherwise shops/default. */
function activeShopId() {
  const id = (process.env.SHOP ?? '').trim() || defaultShopId();
  if (!id) throw new Error('No shop selected. Set SHOP=<shop id> or run: npm run shop -- use <shop id>');
  if (!fs.existsSync(path.join(SHOPS_DIR, id, 'shop.json'))) throw new Error(`Shop "${id}" not found. Shops: ${listShops().join(', ') || '(none)'}`);
  return id;
}

function setDefaultShop(id) {
  readShop(id);
  fs.writeFileSync(DEFAULT_FILE, id + '\n');
}

/** shop.json with the template's defaults filled in (theme colours the shop did not set, missing sections). */
function readShop(id) {
  const file = path.join(shopDir(id), 'shop.json');
  if (!fs.existsSync(file)) throw new Error(`Shop "${id}" not found`);
  const t = template();
  const s = readJson(file);
  return {
    ...t, ...s, id,
    app: { ...t.app, ...s.app },
    expo: { ...t.expo, ...s.expo },
    theme: { ...t.theme, ...s.theme },
  };
}

/** Absolute path of a module file, or null when it is not there. */
function shopFile(id, name) {
  const file = path.join(shopDir(id), name);
  return fs.existsSync(file) ? file : null;
}

function fileStatus(id) {
  return FILES.map((f) => {
    const file = shopFile(id, f.name);
    const bytes = file ? fs.statSync(file).size : 0;
    return { ...f, present: !!file, bytes, placeholder: !!file && f.kind === 'png' && fs.readFileSync(file).includes(PLACEHOLDER_TAG) };
  });
}

/** What still stops this shop from going live (errors) and what should be looked at (warnings). */
function checkShop(id) {
  const errors = [];
  const warnings = [];
  let s;
  try { s = readShop(id); } catch (e) { return { errors: [e.message], warnings }; }

  if (!s.name) errors.push('Shop name is empty');
  if (!s.app.androidPackage) errors.push('Android package id is empty');
  else if (!PACKAGE_RE.test(s.app.androidPackage)) errors.push(`Android package "${s.app.androidPackage}" is not valid (like com.sharmapharmacy.app)`);
  if (s.app.iosBundleId && !PACKAGE_RE.test(s.app.iosBundleId)) errors.push(`iOS bundle id "${s.app.iosBundleId}" is not valid`);
  if (!/^[a-z][a-z0-9+.-]*$/.test(s.app.scheme || '')) errors.push('URL scheme must be lowercase letters/digits, starting with a letter');
  if (!s.apiUrl) errors.push('API URL is empty (the address of this shop\'s backend)');
  else if (!/^https:\/\/\S+$/.test(s.apiUrl)) warnings.push('API URL should start with https:// for a live app');
  if (!s.expo.slug) errors.push('Expo slug is empty');
  if (!s.expo.projectId) warnings.push('Expo projectId is empty: run "eas init" for this shop (see the README) before building in the cloud');
  for (const [key, value] of Object.entries(s.theme)) if (!HEX_RE.test(value)) errors.push(`Theme colour ${key} = "${value}" is not a #RRGGBB colour`);
  if (!HEX_RE.test(s.splashBackground)) errors.push('Splash background must be a #RRGGBB colour');

  for (const f of fileStatus(id)) {
    if (!f.present) (f.required ? errors : warnings).push(`Missing ${f.name}: ${f.label}`);
    else if (f.placeholder) warnings.push(`${f.name} is still the generated placeholder: upload the shop's real image`);
  }

  const gs = shopFile(id, 'google-services.json');
  if (gs) {
    try {
      const packages = (readJson(gs).client ?? []).map((c) => c.client_info?.android_client_info?.package_name);
      if (s.app.androidPackage && !packages.includes(s.app.androidPackage)) errors.push(`google-services.json has no Android app for ${s.app.androidPackage} (it has: ${packages.join(', ') || 'none'}). Add this package in Firebase and download the file again.`);
    } catch { errors.push('google-services.json is not valid JSON'); }
  }
  const web = shopFile(id, 'firebase-web.json');
  if (web) {
    try {
      const c = readJson(web);
      if (!c.apiKey || !c.projectId || !c.appId) errors.push('firebase-web.json needs apiKey, projectId and appId (copy the web app\'s firebaseConfig from the Firebase console)');
    } catch { errors.push('firebase-web.json is not valid JSON'); }
  }
  return { errors, warnings };
}

/** Values a new shop gets from its id and name unless given. */
function suggestedIds(id) {
  const compact = id.replace(/-/g, '');
  return { scheme: compact, androidPackage: `com.${compact}.app`, slug: id };
}

function createShop(input) {
  const id = String(input.id ?? '').trim();
  assertId(id);
  const dir = path.join(SHOPS_DIR, id);
  if (fs.existsSync(dir)) throw new Error(`Shop "${id}" already exists`);
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Shop name is required');

  const t = template();
  const ids = suggestedIds(id);
  const shop = {
    ...t,
    id,
    name,
    nameHi: input.nameHi?.trim() || '',
    apiUrl: input.apiUrl?.trim() || '',
    app: { ...t.app, scheme: input.scheme?.trim() || ids.scheme, androidPackage: input.androidPackage?.trim() || ids.androidPackage },
    expo: { ...t.expo, slug: ids.slug, owner: input.expoOwner?.trim() || '' },
    theme: { ...t.theme, ...(input.primary && HEX_RE.test(input.primary) ? { primary: input.primary } : {}) },
  };
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeJson(path.join(dir, 'shop.json'), shop);
  for (const f of FILES) if (f.kind === 'png' && f.required) fs.writeFileSync(path.join(dir, f.name), solidPng(f.size, shop.theme.primary));
  ensureEasProfiles(id);
  return readShop(id);
}

const EDITABLE = ['name', 'nameHi', 'tagline', 'taglineHi', 'invoiceTagline', 'apiUrl', 'splashBackground'];

/** Saves the editable parts of shop.json. Unknown keys are ignored; the id never changes. */
function updateShop(id, patch) {
  const file = path.join(shopDir(id), 'shop.json');
  const current = readJson(file);
  const next = { ...current };
  for (const key of EDITABLE) if (typeof patch[key] === 'string') next[key] = patch[key].trim();
  for (const section of ['app', 'expo']) {
    if (patch[section] && typeof patch[section] === 'object') {
      next[section] = { ...current[section] };
      for (const [k, v] of Object.entries(patch[section])) if (k in template()[section] && typeof v === 'string') next[section][k] = v.trim();
    }
  }
  if (patch.theme && typeof patch.theme === 'object') {
    next.theme = { ...current.theme };
    for (const [k, v] of Object.entries(patch.theme)) {
      if (!(k in template().theme)) continue;
      if (typeof v !== 'string' || !HEX_RE.test(v)) throw new Error(`Theme colour ${k} must be #RRGGBB`);
      next.theme[k] = v.toUpperCase();
    }
  }
  writeJson(file, next);
  return readShop(id);
}

/** Stores an uploaded module file after checking it is what its name says. */
function writeShopFile(id, name, buffer) {
  const spec = FILES.find((f) => f.name === name);
  if (!spec) throw new Error(`"${name}" is not a shop module file`);
  if (spec.kind === 'png' && !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error(`${name} must be a PNG image`);
  if (spec.kind === 'json') { try { JSON.parse(buffer.toString('utf8').replace(/^﻿/, '')); } catch { throw new Error(`${name} is not valid JSON`); } }
  if (spec.kind === 'plist' && !buffer.toString('utf8').includes('<plist')) throw new Error(`${name} does not look like a plist file`);
  const file = path.join(shopDir(id), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

/** Every shop gets its own EAS build profiles (<id>-preview, <id>-production) that set SHOP on the build server. */
function ensureEasProfiles(id) {
  const eas = readJson(EAS_FILE);
  let changed = false;
  for (const base of ['preview', 'production']) {
    const name = `${id}-${base}`;
    if (!eas.build[name]) { eas.build[name] = { extends: base, env: { SHOP: id } }; changed = true; }
  }
  if (changed) writeJson(EAS_FILE, eas);
  return [`${id}-preview`, `${id}-production`];
}

/** The backend .env a shop's server needs. Secrets are left empty: they go into the hosting dashboard, never into git. */
function backendEnvTemplate(id) {
  const s = readShop(id);
  let firebaseProject = '';
  const gs = shopFile(id, 'google-services.json');
  if (gs) { try { firebaseProject = readJson(gs).project_info?.project_id ?? ''; } catch { /* reported by checkShop */ } }
  return [
    `# Backend for ${s.name}. Each shop runs its own server and its own database.`,
    `SHOP=${id}`,
    'NODE_ENV=production',
    'PORT=4000',
    'DATABASE_URL=',
    'JWT_SECRET=',
    'AUTH_MODE=firebase',
    `FIREBASE_PROJECT_ID=${firebaseProject}`,
    'FIREBASE_SERVICE_ACCOUNT_JSON=',
    'BOOTSTRAP_ADMIN_PHONES=',
    'CLOUDINARY_CLOUD_NAME=',
    'CLOUDINARY_API_KEY=',
    'CLOUDINARY_API_SECRET=',
    'RAZORPAY_KEY_ID=',
    'RAZORPAY_KEY_SECRET=',
    'RAZORPAY_WEBHOOK_SECRET=',
    'CORS_ORIGINS=',
    'SENTRY_DSN=',
    '',
  ].join('\n');
}

/** A square PNG of one colour, used as a placeholder until the shop's real images are uploaded. */
function solidPng(size, hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Comment\0' + PLACEHOLDER_TAG, 'latin1')), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

module.exports = {
  ROOT, SHOPS_DIR, FILES, ID_RE, HEX_RE,
  listShops, defaultShopId, activeShopId, setDefaultShop, readShop, shopDir, shopFile, fileStatus, checkShop,
  suggestedIds, createShop, updateShop, writeShopFile, ensureEasProfiles, backendEnvTemplate,
};
