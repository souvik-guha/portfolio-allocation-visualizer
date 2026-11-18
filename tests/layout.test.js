/* Layout containment: no element may poke out of its card, and the page never scrolls sideways. */
'use strict';
const puppeteer = require('puppeteer-core'); const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' }); const p = await b.newPage();
  const problems = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(m.text()); }); p.on('pageerror', e => problems.push(e.message));
  for (const w of [1440, 1280, 1024, 960, 768, 600, 414, 390, 360, 320]) {
    await p.setViewport({ width: w, height: 900, isMobile: w < 600, deviceScaleFactor: 1 }); await p.goto(FILE, { waitUntil: 'networkidle0' });
    for (const scenario of ['default', 'stress']) {
      if (scenario === 'stress') await p.evaluate(() => {
        const f = (s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
        f('#portfolioValue', 999999999999);
        const add = (n, cls, a, r, v) => { document.getElementById('addAssetBtn').click(); caName.value = n; caClass.value = cls; caAlloc.value = a; caRet.value = r; caVol.value = v; addAssetForm.requestSubmit(); };
        add('W'.repeat(40), 'pv', 5, 3000, 500); add('Supercalifragilisticexpialidocious-Holdings-Ltd', 'cy', 5, -100, 0);
        f('.alloc-input[data-id="stocks"]', 12345.678); // over-allocated banner
      });
      const bad = await p.evaluate(() => {
        const out = []; const cards = [...document.querySelectorAll('.card, .hero, .tabbar')];
        for (const card of cards) { const cr = card.getBoundingClientRect();
          for (const el of card.querySelectorAll('*')) {
            if (el.closest('.mx') || el.closest('svg') || el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            const cs = getComputedStyle(el); if (cs.position === 'fixed') continue;
            if (r.right > cr.right + 0.5 || r.left < cr.left - 0.5) out.push(`${el.tagName}.${el.className} "${(el.textContent || '').slice(0, 24)}" overflows ${card.id || card.className} by ${(Math.max(r.right - cr.right, cr.left - r.left)).toFixed(1)}px`);
          } }
        return { out: out.slice(0, 5), sw: [document.documentElement.scrollWidth, innerWidth] };
      });
      ok(bad.out.length === 0, `${w}px ${scenario}: ${bad.out.join(' ; ')}`); ok(bad.sw[0] <= bad.sw[1], `${w}px ${scenario}: horizontal scroll ${bad.sw}`);
    }
    const tab = await p.$eval('#tabbar', e => getComputedStyle(e).display); ok((w <= 960) === (tab !== 'none'), `${w}px tabbar visibility (${tab})`);
  }
  // mobile tab navigation
  await p.setViewport({ width: 390, height: 844, isMobile: true }); await p.goto(FILE, { waitUntil: 'networkidle0' });
  await p.click('#tabbar a[data-t="summary"]'); await new Promise(r => setTimeout(r, 1200));
  ok(await p.$eval('#tabbar a[data-t="summary"]', e => e.getAttribute('aria-current') === 'true'), 'tab nav marks Summary active after tapping it');
  ok(await p.$eval('#summary', e => { const r = e.getBoundingClientRect(); return r.top < 300 && r.top > -50; }), 'tap scrolls Summary into view');
  ok(problems.length === 0, 'no console problems ' + problems.join('|'));
  console.log(`layout assertions passed ${pass}, failed ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
