/* Regenerates docs/*.png from index.html */
'use strict';
const puppeteer = require('puppeteer-core'), path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html'), OUT = path.resolve(__dirname, '..', 'docs');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] }); const p = await b.newPage();
  const set = (s, v) => p.$eval(s, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 }); await p.goto(FILE, { waitUntil: 'networkidle0' });
  await p.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: true });
  await set('.alloc-input[data-id="stocks"]', 10); await new Promise(r => setTimeout(r, 500));
  await p.screenshot({ path: path.join(OUT, 'under-allocated.png'), clip: { x: 0, y: 150, width: 1280, height: 620 } });
  await p.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 }); await p.goto(FILE, { waitUntil: 'networkidle0' });
  await p.screenshot({ path: path.join(OUT, 'mobile-allocate.png') });
  await p.evaluate(() => document.getElementById('chart').scrollIntoView()); await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.join(OUT, 'mobile-chart.png') });
  await p.evaluate(() => document.getElementById('summary').scrollIntoView()); await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.join(OUT, 'mobile-summary.png') });
  await b.close();
})();
