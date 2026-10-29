import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';

const executeFile = promisify(execFile);
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const example = join(repository, 'apps/example');
const fixture = await mkdtemp(join(tmpdir(), 'open-emdash-package-'));
const previewSecret = randomBytes(32).toString('hex');
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('EMDASH_') && !['SITE_URL', 'PREVIEW_SECRET', 'AUTH_SECRET'].includes(name)));
const environment = { ...inheritedEnvironment, EMDASH_DATABASE_URL: 'file:./.data/emdash.db', EMDASH_PREVIEW_SECRET: previewSecret };
let productionServer;
let hasDevServer = false;

async function run(command, args, cwd = fixture, env = environment) {
  try {
    const result = await executeFile(command, args, { cwd, env, maxBuffer: 8 * 1024 * 1024, timeout: 180000 });
    return result.stdout;
  } catch (error) {
    // Do not print inherited env or signed preview URLs in command failures.
    console.error((error.stdout ?? '').slice(-4000), (error.stderr ?? '').slice(-4000));
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function waitForServer(origin) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(origin); return; } catch { await delay(250); }
  }
  throw new Error('The isolated host did not start');
}
async function checkPage(origin, path, status, expectedText = null) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, status, 'Unexpected response from the isolated host');
  const html = await response.text();
  if (expectedText !== null) assert.ok(html.includes(expectedText), 'Expected page content is missing');
  return { response, html };
}
async function jsonRequest(origin, path, token, body = null) {
  const response = await fetch(new URL(path, origin), {
    method: body === null ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });
  assert.ok(response.ok, 'Isolated host API request failed');
  return (await response.json()).data;
}
try {
  await run('vp', ['pm', 'pack', '--filter', '@open-emdash/site-builder', '--pack-destination', fixture], repository);
  const manifest = JSON.parse(await readFile(join(repository, 'packages/site-builder/package.json'), 'utf8'));
  const archive = join(fixture, `open-emdash-site-builder-${manifest.version}.tgz`);
  const contents = await run('tar', ['-tzf', archive]);
  for (const file of ['dist/plugin.js', 'dist/plugin.d.ts', 'dist/runtime.js', 'dist/server/page-response.js', 'src/pages/[...slug].astro', 'src/pages/preview/[id].astro', 'src/styles/site.css', 'src/admin.tsx']) {
    assert.ok(contents.includes(`package/${file}`), `Missing packaged file: ${file}`);
  }
  assert.doesNotMatch(contents, /\/(?:\.env(?:\.|\/|$)|\.data\/|\.astro\/|node_modules\/|apps\/|tests\/)/m);
  const localEnvironment = await readFile(join(example, '.env'), 'utf8').catch(() => '');
  const localSecret = localEnvironment.match(/^EMDASH_PREVIEW_SECRET=(.+)$/m)?.[1];
  if (localSecret) assert.ok(!gunzipSync(await readFile(archive)).includes(Buffer.from(localSecret)), 'Local secret found in package');
  console.log('PASS: npm archive includes its runtime, types, routes, admin and CSS, and excludes local state');

  const exampleManifest = JSON.parse(await readFile(join(example, 'package.json'), 'utf8'));
  const dependencies = { '@open-emdash/site-builder': `file:${archive}` };
  for (const name of Object.keys(exampleManifest.dependencies)) {
    if (name === '@open-emdash/site-builder') continue;
    const installed = JSON.parse(await readFile(join(example, 'node_modules', name, 'package.json'), 'utf8'));
    dependencies[name] = installed.version;
  }
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'isolated-emdash-host', private: true, type: 'module', dependencies, emdash: { seed: 'seed/seed.json' } }, null, 2));
  // The isolated consumer needs explicit build-script approval and the same
  // security fixes for upstream's exact transitive dependency pins.
  await cp(join(repository, 'pnpm-workspace.yaml'), join(fixture, 'pnpm-workspace.yaml'));
  await mkdir(join(fixture, 'src/pages'), { recursive: true });
  await mkdir(join(fixture, '.data'));
  await cp(join(example, 'astro.config.mjs'), join(fixture, 'astro.config.mjs'));
  await cp(join(example, 'tsconfig.json'), join(fixture, 'tsconfig.json'));
  await cp(join(example, 'src/live.config.ts'), join(fixture, 'src/live.config.ts'));
  await cp(join(example, 'seed'), join(fixture, 'seed'), { recursive: true });
  await writeFile(join(fixture, 'src/pages/existing.astro'), `---
Astro.response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
---
<html><body><h1>Existing host route</h1></body></html>`);
  await run('vp', ['install', '--prefer-offline']);
  const installedPlugin = await realpath(join(fixture, 'node_modules/@open-emdash/site-builder'));
  assert.ok(!installedPlugin.startsWith(repository), 'Consumer must use the archive, not a workspace link');
  await run(process.execPath, ['--input-type=module', '-e', `import { siteBuilder } from '@open-emdash/site-builder'; import { validateDocument } from '@open-emdash/site-builder/document'; if (siteBuilder().id !== 'site-builder' || validateDocument(null).success) process.exit(1);`]);
  console.log('PASS: a separate project installs and imports the package without workspace sources');

  const developmentPort = await freePort();
  const developmentOrigin = `http://127.0.0.1:${developmentPort}`;
  const astroCli = join(fixture, 'node_modules/astro/bin/astro.mjs');
  await run(process.execPath, [astroCli, 'dev', '--host', '127.0.0.1', '--port', String(developmentPort)]);
  hasDevServer = true;
  await waitForServer(developmentOrigin);
  const smokeOutput = await run(process.execPath, [join(example, 'scripts/smoke.mjs')], fixture, { ...environment, SMOKE_ORIGIN: developmentOrigin });
  process.stdout.write(smokeOutput);
  await checkPage(developmentOrigin, '/existing', 200, 'Existing host route');
  const setup = await jsonRequest(developmentOrigin, '/_emdash/api/setup/dev-bypass?token=1', '');
  const home = await jsonRequest(developmentOrigin, '/_emdash/api/content/pages/home', setup.token);
  const preview = await jsonRequest(developmentOrigin, '/_emdash/api/plugins/site-builder/preview', setup.token, { id: home.item.id });
  await run(process.execPath, [astroCli, 'dev', 'stop']);
  hasDevServer = false;
  await run(process.execPath, [astroCli, 'build']);
  console.log('PASS: installed package builds with the host and preserves its existing routes');

  const productionPort = await freePort();
  const productionOrigin = `http://127.0.0.1:${productionPort}`;
  productionServer = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: fixture, env: { ...environment, HOST: '127.0.0.1', PORT: String(productionPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const productionLog = [];
  productionServer.stderr.on('data', chunk => productionLog.push(String(chunk)));
  await waitForServer(productionOrigin);
  const homepage = await checkPage(productionOrigin, '/', 200, '話すたび');
  assert.doesNotMatch(homepage.html, /@vite\/client|data-astro-source-file|astro-island/);
  assert.match(homepage.response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  const existingPage = await checkPage(productionOrigin, '/existing', 200, 'Existing host route');
  assert.equal(existingPage.response.headers.get('content-security-policy'), "frame-ancestors 'none'");
  const inlineStylesheets = [...homepage.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  const hasInlineStylesheet = inlineStylesheets.some(stylesheet => stylesheet[1].includes('.section') && stylesheet[1].includes('--accent'));
  if (!hasInlineStylesheet) {
    const stylesheetPath = homepage.html.match(/href="([^"]+\.css)"/)?.[1];
    assert.ok(stylesheetPath, 'Packaged page must include its stylesheet');
    const stylesheet = await checkPage(productionOrigin, stylesheetPath, 200);
    assert.ok(stylesheet.html.includes('--accent'), 'Packaged stylesheet is missing');
  }
  await checkPage(productionOrigin, '/guide', 200, '会話から');
  const previewPage = await checkPage(productionOrigin, preview.url, 200, 'プレビュー — 保存済みの内容を表示しています');
  assert.match(previewPage.response.headers.get('cache-control'), /no-store/);
  await checkPage(productionOrigin, '/_emdash/api/setup/dev-bypass', 403);
  await checkPage(productionOrigin, '/_emdash/api/mcp', 401);
  assert.equal(productionLog.length, 0, 'Production server reported an error');
  console.log('PASS: installed package serves production SSR and previews, and rejects dev login and anonymous MCP');
} finally {
  if (hasDevServer) await run(process.execPath, [join(fixture, 'node_modules/astro/bin/astro.mjs'), 'dev', 'stop']).catch(() => {});
  if (productionServer && productionServer.exitCode === null) {
    productionServer.kill('SIGTERM');
    await once(productionServer, 'exit');
  }
  console.log(`Isolated test files: ${fixture}`);
}
