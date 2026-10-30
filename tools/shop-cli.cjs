#!/usr/bin/env node
/**
 * Super admin command line for shop modules. Run from the repository root:
 *
 *   npm run shop -- list
 *   npm run shop -- new sharma-pharmacy --name "Sharma Pharmacy" [--package com.sharmapharmacy.app] [--api https://api.sharma.in] [--primary #0B8F6A]
 *   npm run shop -- check [id]                      what is missing before this shop can go live
 *   npm run shop -- use <id>                        the shop `npm run web` / `npm start` in mobile/ and the local API use
 *   npm run shop -- env <id>                        the backend .env template for this shop's server
 *   npm run shop -- web <id> | start <id>           run the app for a shop (web preview / dev client)
 *   npm run shop -- build <id> [preview|production] [android|ios|all]
 *   npm run superadmin                              the same things in a browser panel
 */
const path = require('path');
const { spawn } = require('child_process');
const shops = require('./shops.cjs');

const MOBILE = path.join(shops.ROOT, 'mobile');

function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) out[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    else out._.push(args[i]);
  }
  return out;
}

function printCheck(id) {
  const { errors, warnings } = shops.checkShop(id);
  console.log(`\n${id}: ${errors.length ? `${errors.length} problem(s)` : 'ready'}${warnings.length ? `, ${warnings.length} warning(s)` : ''}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  return errors.length === 0;
}

/** Runs a command in mobile/ for one shop. Shell mode so npx resolves on Windows too. */
function runInMobile(id, command, args) {
  const child = spawn(command, args, { cwd: MOBILE, stdio: 'inherit', shell: true, env: { ...process.env, SHOP: id } });
  child.on('exit', (code) => process.exit(code ?? 1));
}

/** The eas command for a shop build. Shared with the panel. */
function buildArgs(id, profile = 'preview', platform = 'android') {
  if (!['preview', 'production'].includes(profile)) throw new Error('Profile must be preview or production');
  if (!['android', 'ios', 'all'].includes(platform)) throw new Error('Platform must be android, ios or all');
  const [preview, production] = shops.ensureEasProfiles(id);
  return ['eas-cli', 'build', '--profile', profile === 'preview' ? preview : production, '--platform', platform];
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  const id = f._[0];
  switch (command) {
    case 'list': {
      const current = shops.defaultShopId();
      for (const s of shops.listShops()) {
        const shop = shops.readShop(s);
        const { errors } = shops.checkShop(s);
        console.log(`${s === current ? '*' : ' '} ${s.padEnd(30)} ${shop.name.padEnd(30)} ${shop.app.androidPackage.padEnd(36)} ${errors.length ? `${errors.length} problem(s)` : 'ready'}`);
      }
      console.log('\n* = default shop (npm run shop -- use <id> to change)');
      return;
    }
    case 'new': {
      if (!id) throw new Error('Usage: npm run shop -- new <id> --name "Shop Name"');
      const shop = shops.createShop({ id, name: f.name, nameHi: f['name-hi'], androidPackage: f.package, apiUrl: f.api, primary: f.primary, expoOwner: f.owner });
      console.log(`Created shops/${shop.id}/ (package ${shop.app.androidPackage}, EAS profiles ${shop.id}-preview / ${shop.id}-production).`);
      console.log('Next: replace the placeholder images in assets/, add google-services.json (and firebase-web.json), set apiUrl, then link an Expo project:');
      console.log(`  cd mobile && SHOP=${shop.id} npx eas-cli init     (writes nothing into the code: copy the projectId into shops/${shop.id}/shop.json → expo.projectId)`);
      printCheck(shop.id);
      return;
    }
    case 'check': {
      const ids = id ? [id] : shops.listShops();
      const ok = ids.map(printCheck).every(Boolean);
      process.exitCode = ok ? 0 : 1;
      return;
    }
    case 'use':
      if (!id) throw new Error('Usage: npm run shop -- use <id>');
      shops.setDefaultShop(id);
      console.log(`Default shop is now ${id}. Restart Metro with --clear (npm run shop -- web ${id} does this).`);
      return;
    case 'env':
      if (!id) throw new Error('Usage: npm run shop -- env <id>');
      process.stdout.write(shops.backendEnvTemplate(id));
      return;
    case 'web':
    case 'start':
      if (!id) throw new Error(`Usage: npm run shop -- ${command} <id>`);
      shops.readShop(id);
      return runInMobile(id, 'npx', ['expo', 'start', '--clear', ...(command === 'web' ? ['--web'] : ['--dev-client'])]);
    case 'build': {
      if (!id) throw new Error('Usage: npm run shop -- build <id> [preview|production] [android|ios|all]');
      if (!printCheck(id) && f.force !== 'true') throw new Error('Fix the problems above first (or pass --force)');
      return runInMobile(id, 'npx', buildArgs(id, f._[1], f._[2]));
    }
    default:
      console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 14).map((l) => l.replace(/^ \*\s?/, '')).join('\n'));
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
}

module.exports = { buildArgs };
