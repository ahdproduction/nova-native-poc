// Serves the Exact web build and a React host page from one origin, then reads,
// in headless Chromium, what each embedding mode does to the host and to Exact.
// Run: bun build host.tsx --outdir out --target browser && bun check.ts
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve(import.meta.dir, '../target/web-dist');
const hostHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Host</title>
<style>
  body { margin: 0; font: 15px Georgia, serif; background: #f4f4f8; }
  .host { padding: 16px; }
  h2 { font-size: 28px; margin: 0 0 12px; font-weight: 700; }
  .host-bar { display: flex; gap: 8px; margin-bottom: 16px; }
  .host-input { border: 1px solid #888; padding: 6px 10px; font: 14px Arial; border-radius: 4px; }
  .host-button { padding: 8px 14px; background: #0b5fbd; color: #fff; border: 0; border-radius: 6px; font: 600 14px Arial; cursor: pointer; }
</style></head>
<body><div id="react-root"></div><script type="module" src="/__host/host.js"></script></body></html>`;

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const { pathname, searchParams } = new URL(req.url);
    if (pathname === '/host' || (pathname === '/' && searchParams.has('mode'))) return new Response(hostHtml, { headers: { 'content-type': 'text/html' } });
    if (pathname === '/__host/host.js') return new Response(Bun.file(join(import.meta.dir, 'out/host.js')));
    const file = join(dist, pathname === '/' ? 'index.html' : pathname);
    if (existsSync(file) && !file.endsWith('/')) return new Response(Bun.file(file));
    return new Response(readFileSync(join(dist, 'index.html')), { headers: { 'content-type': 'text/html' } });
  },
});
const origin = `http://127.0.0.1:${server.port}`;

const shell = join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? shell });

const hostProbe = () => {
  const style = (sel: string, props: string[]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)]));
  };
  return {
    url: location.pathname + location.search,
    hostTitle: style('#host-title', ['font-size', 'font-family']),
    hostButton: style('#host-button', ['background-color', 'padding-top', 'border-radius', 'font-family', 'display']),
    hostInput: style('#host-input', ['border-top-width', 'padding-left', 'font-family']),
    hostButtonText: document.querySelector('#host-button')?.textContent,
    exactRootChildren: document.querySelector('#exact-root')?.childElementCount ?? null,
    exactRendered: document.body.innerText.includes('Nova native'),
    exactRootHtml: document.querySelector('#exact-root')?.innerHTML.slice(0, 300) ?? null,
    importError: (window as any).__exactImportError ?? null,
  };
};

const results: Record<string, unknown> = {};
for (const mode of ['control', 'direct', 'iframe']) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  // Direct mode is also tried at `/`, the only route the Exact app declares.
  await page.goto(`${origin}${process.env.HOST_PATH ?? '/host'}?mode=${mode}`);
  await page.waitForTimeout(2500);
  const before = await page.evaluate(hostProbe);
  await page.click('#host-button').catch(e => errors.push(`host click: ${String(e).slice(0, 120)}`));
  let exactSend: string | null = null;
  if (mode === 'direct') {
    await page.getByText('Send', { exact: true }).click({ timeout: 2000 }).catch(e => errors.push(`exact click: ${String(e).slice(0, 120)}`));
    exactSend = await page.locator('body').innerText().then(t => /\d+ sent/.exec(t)?.[0] ?? null);
  }
  if (mode === 'iframe') {
    const frame = page.frameLocator('#exact-frame');
    await frame.getByText('Full name').first().waitFor({ timeout: 5000 }).catch(e => errors.push(`iframe wait: ${String(e).slice(0, 120)}`));
    await frame.getByPlaceholder('Jane Doe').fill('Jane').catch(e => errors.push(`iframe fill: ${String(e).slice(0, 120)}`));
    await frame.getByPlaceholder('jane@elia.be').fill('jane@elia.be').catch(e => errors.push(`iframe fill: ${String(e).slice(0, 120)}`));
    await frame.getByText('Send', { exact: true }).click({ timeout: 3000 }).catch(e => errors.push(`iframe click: ${String(e).slice(0, 120)}`));
    exactSend = await frame.locator('body').innerText().then(t => /\d+ sent/.exec(t)?.[0] ?? null).catch(() => null);
  }
  const after = await page.evaluate(hostProbe);
  await page.screenshot({ path: join(import.meta.dir, `../shots/embed-${mode}.png`) });
  results[mode] = { before, hostButtonAfterClick: after.hostButtonText, urlAfter: after.url, exactSend, errors: [...new Set(errors)].slice(0, 8) };
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
server.stop(true);
