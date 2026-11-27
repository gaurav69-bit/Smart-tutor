// Review evidence, not automatic approval. Reference code remains outside this repository.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const referenceCommit = '3a9f2bf618d10ef8d03df9e18e00b801b69c83f5';
const root = process.cwd();
const reference = process.env.SMARTTUTOR_REFERENCE_DIR;
if (!reference) throw new Error('Set SMARTTUTOR_REFERENCE_DIR to the checkout of the pinned reference repository.');
if (execFileSync('git', ['-C', reference, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== referenceCommit) throw new Error('The visual reference must be pinned to ' + referenceCommit);
const output = path.join(root, 'test-results-visual', 'st23-visual-review');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const sources = [
  { name: 'reference', base: 'http://127.0.0.1:4176', cwd: path.join(reference, 'apps/web'), vite: path.join(reference, 'node_modules/vite/bin/vite.js'), hash: false },
  { name: 'implementation', base: 'http://127.0.0.1:4175', cwd: root, vite: path.join(root, 'node_modules/vite/bin/vite.js'), hash: true },
];
const fontCss = (await readFile(path.join(root, 'public/fonts/fonts.css'), 'utf8')).replaceAll('url("/fonts/', 'url("http://127.0.0.1:4175/fonts/');
const processes = [];
let browser;
const results = [];
try {
  for (const source of sources) {
    const server = spawn(process.execPath, [source.vite, '--host', '127.0.0.1', '--port', new URL(source.base).port, '--strictPort'], { cwd: source.cwd, stdio: 'ignore' });
    processes.push(server);
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(source.base)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(source.name + ' Vite server did not start.');
  }
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const width of [390, 768, 1440]) {
    for (const source of sources) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-AU', timezoneId: 'Australia/Sydney' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(source.base + '/api/**', route => {
        const endpoint = new URL(route.request().url()).pathname;
        const data = endpoint === '/api/auth/me' ? source.hash ? {} : { user: null }
          : endpoint === '/api/config' ? { demo: true, captchaSiteKey: null }
          : endpoint === '/api/subjects' ? [{ id: 1, name: 'Mathematics' }, { id: 2, name: 'English' }]
          : endpoint === '/api/tutors' ? [] : {};
        return route.fulfill({ status: endpoint === '/api/auth/me' && source.hash ? 401 : 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      for (const route of ['/', '/about', '/privacy', '/terms', '/login', '/register', '/verify']) {
        await page.goto(source.base + (source.hash ? '/#' : '') + route, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').first().waitFor();
        // Same declared font assets for both renders; do not rely on a third-party CSS request.
        if (!source.hash) await page.addStyleTag({ content: fontCss });
        await page.evaluate(async () => {
          await Promise.all(['400', '500', '600', '700'].flatMap(weight => ['DM Sans', 'Manrope'].map(family => document.fonts.load(`${weight} 16px "${family}"`))));
        });
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 4000))]));
        const name = route.slice(1) || 'home';
        const file = `${name}-${width}-${source.name}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        if (route === '/') {
          await page.locator('.header-inner').screenshot({ path: path.join(output, `header-${width}-${source.name}.png`) });
          await page.locator('.hero').screenshot({ path: path.join(output, `hero-${width}-${source.name}.png`) });
        }
        const metrics = await page.evaluate(() => {
          const css = element => {
            const style = getComputedStyle(element), box = element.getBoundingClientRect();
            return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor, x: box.x, width: box.width, height: box.height };
          };
          return { body: css(document.body), heading: css(document.querySelector('h1')), header: css(document.querySelector('.header-inner')), palette: ['--green', '--muted', '--line'].map(key => [key, getComputedStyle(document.documentElement).getPropertyValue(key).trim()]), overflow: document.documentElement.scrollWidth > innerWidth };
        });
        const session = await context.newCDPSession(page);
        await session.send('DOM.enable'); await session.send('CSS.enable');
        const doc = await session.send('DOM.getDocument');
        const node = await session.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'h1' });
        const fonts = await session.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId });
        await page.evaluate(() => {
          const paragraph = [...document.querySelectorAll('p')].find(element => element.getBoundingClientRect().height > 0 && getComputedStyle(element).display !== 'none');
          paragraph?.setAttribute('data-font-review', '');
        });
        const paragraph = await session.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-font-review]' });
        const bodyFonts = paragraph.nodeId ? (await session.send('CSS.getPlatformFontsForNode', { nodeId: paragraph.nodeId })).fonts : [];
        await session.detach();
        if (!fonts.fonts.some(font => font.isCustomFont && font.familyName.includes('Manrope'))) throw new Error('Manrope did not render on ' + source.name + route);
        if (!bodyFonts.some(font => font.isCustomFont && font.familyName.includes('DM Sans'))) throw new Error('DM Sans did not render on ' + source.name + route);
        results.push({ source: source.name, route, width, state: 'anonymous, initial form; no public tutor records', file, metrics, actualHeadingFonts: fonts.fonts, actualBodyFonts: bodyFonts });
      }
      if (errors.length) throw new Error(source.name + ' runtime errors: ' + errors.join('; '));
      await context.close();
    }
    console.log('Captured reference and implementation at ' + width + 'px.');
  }
  const comparisons = [];
  for (const current of results.filter(r => r.source === 'implementation')) {
    const baseline = results.find(r => r.source === 'reference' && r.route === current.route && r.width === current.width);
    const fields = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'];
    comparisons.push({ route: current.route, width: current.width, bodyDifferences: fields.filter(k => current.metrics.body[k] !== baseline.metrics.body[k]), headingDifferences: fields.filter(k => current.metrics.heading[k] !== baseline.metrics.heading[k]), headerDimensionsMatch: ['width', 'height'].every(k => Math.abs(current.metrics.header[k] - baseline.metrics.header[k]) < 0.5), paletteMatches: JSON.stringify(current.metrics.palette) === JSON.stringify(baseline.metrics.palette), overflow: current.metrics.overflow });
  }
  const record = {
    referenceCommit, implementationBase: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    implementationIndexTree: execFileSync('git', ['write-tree'], { cwd: root, encoding: 'utf8' }).trim(),
    capturedAt: new Date().toISOString(),
    fontAssets: 'Unmodified DM Sans / Manrope at Google Fonts 5026800714d07231937d92eb4cceabf06e05d74e; SIL OFL licences bundled.',
    referenceFontMethod: 'Reference code/styles pinned; identical declared fonts served from the implementation font assets for deterministic captures. Georgia italic accents use the platform fallback.',
    approval: 'Pending Gaurav: generated evidence is not peer acceptance.',
    intendedDifferences: [
      'Reference contains later-stage functionality. Current public tutor/statistics unavailability is intentional; no invented counts or records.',
      'Current registration uses the agreed Week 4 student/tutor fields and text subject contract; invited-admin, OTP and CAPTCHA are Week 5.',
      'Verification explicitly consumes a token and has generic resend feedback/cooldown, extending the reference initial form.',
      'About/Privacy/Terms content is corrected for the implemented account increment and still requires operator approval.',
      'Header keyboard/mobile/skip-link behaviour and field errors retain accessibility corrections.',
    ], comparisons, results,
  };
  await writeFile(path.join(output, 'comparison.json'), JSON.stringify(record, null, 2));
  const screenshotCount = (await readdir(output)).filter(name => name.endsWith('.png')).length;
  if (screenshotCount !== 54) throw new Error('Incomplete screenshot bundle: ' + screenshotCount);
  console.log(JSON.stringify({ screenshots: screenshotCount, routes: 7, widths: 3, overflowingImplementationPages: comparisons.filter(r => r.overflow).length, comparison: path.join(output, 'comparison.json') }));
} finally {
  await browser?.close();
  for (const server of processes) server.kill('SIGTERM');
}
