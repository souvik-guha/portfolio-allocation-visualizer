/* Independent verification of the Portfolio Allocation Visualizer.
 * Drives the real page in headless Chrome, reads inputs from the DOM, recomputes every figure with a
 * separate implementation (ES is computed by numerical integration, not the page's closed form) and compares.
 * Usage: CHROME_PATH=/path/to/chrome node tests/model.test.js [N_RANDOM]            */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const N_RANDOM = Number(process.argv[2]) || 2500;

// ---- independent model spec (re-typed on purpose, not imported from the page)
const LAM = { eq: .85, gov: .9, cr: .85, re: .85, cm: .6, cy: .8, de: .5, ca: .9, pv: .3 };
const PR = { 'eq|gov': .05, 'eq|cr': .65, 'eq|re': .75, 'eq|cm': .30, 'eq|cy': .35, 'eq|de': .70, 'eq|ca': 0, 'eq|pv': .55, 'gov|cr': .45, 'gov|re': .25, 'gov|cm': 0, 'gov|cy': 0, 'gov|de': .05, 'gov|ca': .10, 'gov|pv': .05, 'cr|re': .55, 'cr|cm': .25, 'cr|cy': .25, 'cr|de': .50, 'cr|ca': 0, 'cr|pv': .35, 're|cm': .25, 're|cy': .25, 're|de': .50, 're|ca': 0, 're|pv': .40, 'cm|cy': .15, 'cm|de': .30, 'cm|ca': 0, 'cm|pv': .20, 'cy|de': .30, 'cy|ca': 0, 'cy|pv': .30, 'de|ca': 0, 'de|pv': .40, 'ca|pv': 0 };
const F = (a, b) => (PR[a + '|' + b] ?? PR[b + '|' + a]);
const BUILTIN = { stocks: [18.5, 'eq'], etfs: [12.2, 'eq'], 'gov-bonds': [3.8, 'gov'], 'corp-bonds': [6.5, 'cr'], 'hy-bonds': [9.2, 'cr'], reits: [14.8, 're'], commodities: [22.5, 'cm'], derivatives: [35, 'de'], crypto: [65.8, 'cy'], cash: [.1, 'ca'], hysa: [.5, 'ca'] };
const CLS = Object.keys(LAM), IDS = Object.keys(BUILTIN);
const Z = 1.6448536269514722, RF = .03;
const pdf = t => Math.exp(-t * t / 2) / Math.sqrt(2 * Math.PI);
function simpson(f, a, b, n = 6000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }
function expected(held) {                      // held: [{cls, vol(%), ret(%), alloc}] summing to 100
  const n = held.length, w = held.map(h => h.alloc / 100), sg = held.map(h => h.vol / 100);
  const rho = (i, j) => i === j ? 1 : (held[i].cls === held[j].cls ? LAM[held[i].cls] : Math.sqrt(LAM[held[i].cls] * LAM[held[j].cls]) * F(held[i].cls, held[j].cls));
  let v = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) v += w[i] * w[j] * sg[i] * sg[j] * rho(i, j);
  const sig = Math.sqrt(Math.max(0, v)), mu = held.reduce((s, h, i) => s + w[i] * h.ret / 100, 0);
  const q = Math.exp(-sig * sig / 2 - Z * sig), varP = sig < 1e-12 ? 0 : 1 - q;
  const tail = sig < 1e-12 ? 0 : simpson(t => Math.exp(-sig * sig / 2 + sig * t) * pdf(t), -14, -Z);
  const esP = sig < 1e-12 ? 0 : 1 - tail / 0.05;
  const effN = 1 / w.reduce((a, x) => a + x * x, 0);
  const dr = sig > 1e-12 ? w.reduce((a, x, i) => a + x * sg[i], 0) / sig : null;
  const Sw = held.map((_, i) => held.reduce((a, _b, j) => a + rho(i, j) * sg[i] * sg[j] * w[j], 0));
  const sh = Sw.map((x, i) => sig > 1e-12 ? w[i] * x / v : w[i]);
  const effRisk = 1 / sh.reduce((a, x) => a + x * x, 0);
  const benefit = dr ? 1 - 1 / dr : 0, bets = dr ? effRisk : 1;
  const score = Math.round(100 * (.5 * Math.min(1, benefit / .4) + .5 * Math.min(1, Math.max(0, bets - 1) / 3)));
  const cw = {}; held.forEach((h, i) => { cw[h.cls] = (cw[h.cls] || 0) + w[i]; });
  return { mu, sig, varP, esP, effN, dr, score, sharpe: sig > 1e-12 ? (mu - RF) / sig : null, median: (1 + mu) * Math.exp(-v / 2) - 1, classes: Object.values(cw).filter(x => x >= .05 - 1e-12).length, shareSum: sh.reduce((a, x) => a + x, 0) };
}

// ---- tiny seeded RNG
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(20260101), pick = a => a[Math.floor(R() * a.length)], r2 = x => Math.round(x * 100) / 100;
const EDGE_RET = [-100, -50, 0, 0.01, 3000, 2999.99], EDGE_VOL = [0, 0.01, 500, 499.9];
function randCase(kind) {
  const on = IDS.filter(() => R() < .4); if (!on.length) on.push(pick(IDS));
  const customs = []; const nc = pick([0, 0, 1, 1, 2, 3, 5]);
  for (let i = 0; i < nc; i++) customs.push({ name: pick(['Venture', '<b>x</b>', 'A&B "Co"', 'W'.repeat(40), 'ñandú 🚀', 'Side hustle']), cls: pick(CLS), ret: R() < .25 ? pick(EDGE_RET) : r2(R() * 80 - 20), vol: R() < .25 ? pick(EDGE_VOL) : r2(R() * 120) });
  const n = on.length + customs.length;
  let a = Array.from({ length: n }, () => R() + .02); const S = a.reduce((x, y) => x + y, 0); a = a.map(x => r2(x / S * 100));
  a[0] = r2(100 - a.slice(1).reduce((x, y) => x + y, 0));
  if (a[0] < 0) { a = a.map(() => r2(100 / n)); a[0] = r2(100 - a.slice(1).reduce((x, y) => x + y, 0)); }
  const alloc = {}, ret = {}; on.forEach((id, i) => { alloc[id] = a[i]; ret[id] = R() < .15 ? pick(EDGE_RET) : r2(R() * 40 - 10); });
  customs.forEach((c, i) => { c.alloc = a[on.length + i]; });
  const V = pick([0, 1, 1000, 100000, 123456.78, 1e9, 1e12, r2(R() * 1e6)]);
  return { kind, on, alloc, ret, customs, V };
}

// ---- in-page driver (one evaluate per chunk)
const DRIVER = `(() => {
  const $ = s => document.querySelector(s);
  const fire = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const raw = id => { const e = document.getElementById(id); return e.hasAttribute('data-raw') ? e.getAttribute('data-raw') : null; };
  const txt = id => document.getElementById(id).textContent;
  window.__run = cases => cases.map(c => {
    $('#resetBtn').click();
    fire($('#portfolioValue'), c.V);
    for (const id of ${JSON.stringify(IDS)}) {
      const t = $('.asset-toggle[data-id="' + id + '"]'); const want = c.on.includes(id);
      if (t.checked !== want) t.click();
      if (want) { fire($('.alloc-input[data-id="' + id + '"]'), c.alloc[id] ?? ''); fire($('.ret-input[data-id="' + id + '"]'), c.ret[id] ?? ''); }
      else fire($('.alloc-input[data-id="' + id + '"]'), 0);
    }
    (c.customs || []).forEach(x => {
      $('#addAssetBtn').click(); $('#caName').value = x.name; $('#caClass').value = x.cls; $('#caAlloc').value = x.alloc; $('#caRet').value = x.ret; $('#caVol').value = x.vol;
      $('#addAssetForm').requestSubmit();
    });
    if (c.blank) fire($(c.blank), '');
    if (c.bad) fire($(c.bad.sel), c.bad.val);
    const out = { banner: $('#banner').className, bannerText: $('#banner').textContent, scale: !$('#scaleBtn').disabled, center: txt('cL'), body: document.body.innerText,
      m: Object.fromEntries(['weightedReturn','expectedIncome','medianReturn','portfolioRisk','sharpe','varValue','esValue','effN','divRatio','assetClasses','diversificationScore'].map(k => [k, raw(k)])),
      text: Object.fromEntries(['weightedReturn','portfolioRisk','varValue','diversificationScore'].map(k => [k, txt(k)])),
      legend: [...document.querySelectorAll('#legend .lg .p')].map(e => parseFloat(e.textContent)), freeSlice: !!$('.slice[data-key="__free"]') };
    if (c.thenScale) { $('#scaleBtn').click(); out.afterScale = { banner: $('#banner').className, sum: [...document.querySelectorAll('.alloc-input')].filter(i => !i.disabled).reduce((s, i) => s.plus(i.value || 0), new Decimal(0)).toString(),
      m: Object.fromEntries(['weightedReturn','portfolioRisk','varValue','esValue'].map(k => [k, raw(k)])) }; }
    return out;
  });
})()`;

let pass = 0, fail = 0; const failures = [];
const ok = (c, m, ctx) => { if (c) pass++; else { fail++; if (failures.length < 25) failures.push(m + (ctx ? ' | ' + ctx : '')); } };
const near = (a, b, tol, m, ctx) => ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)) + 1e-12, `${m}: page=${a} expected=${b}`, ctx);
const heldOf = c => [...c.on.map(id => ({ cls: BUILTIN[id][1], vol: BUILTIN[id][0], ret: c.ret[id], alloc: c.alloc[id] })), ...c.customs.map(x => ({ cls: x.cls, vol: x.vol, ret: x.ret, alloc: x.alloc }))].filter(h => h.alloc > 0);

function checkValid(c, o, tag) {
  const ctx = tag + ' ' + JSON.stringify(c).slice(0, 200);
  ok(o.banner.includes('ok'), 'banner should be ok', ctx + ' got ' + o.bannerText);
  ok(!/NaN|Infinity|undefined|null/.test(o.body), 'no NaN/Infinity/undefined/null text', ctx);
  if (!o.banner.includes('ok')) return;
  const e = expected(heldOf(c)), V = c.V;
  near(+o.m.weightedReturn, e.mu * 100, 1e-9, 'return', ctx); near(+o.m.expectedIncome, e.mu * V, 1e-9, 'gain', ctx);
  near(+o.m.portfolioRisk, e.sig, 1e-9, 'sigma', ctx); near(+o.m.medianReturn, e.median, 1e-9, 'median', ctx);
  near(+o.m.varValue, e.varP * V, 1e-9, 'VaR$', ctx); near(+o.m.esValue, e.esP * V, 1e-7, 'ES$', ctx);
  near(+o.m.effN, e.effN, 1e-9, 'effN', ctx); near(+o.m.diversificationScore, e.score, 0, 'score', ctx);
  if (e.dr) near(+o.m.divRatio, e.dr, 1e-9, 'DR', ctx); else ok(o.m.divRatio === null, 'DR null when sigma 0', ctx);
  if (e.sharpe !== null) near(+o.m.sharpe, e.sharpe, 1e-9, 'sharpe', ctx);
  ok(o.m.assetClasses === String(e.classes), 'classes held', ctx);
  ok(+o.m.varValue <= V + 1e-6 && +o.m.varValue >= 0, 'VaR within [0, V]', ctx); ok(+o.m.esValue <= V + 1e-6 && +o.m.esValue >= +o.m.varValue - 1e-6, 'ES within [VaR, V]', ctx);
  ok(e.dr === null || e.dr >= 1 - 1e-9, 'DR >= 1', ctx); ok(e.effN >= 1 - 1e-9 && e.effN <= heldOf(c).length + 1e-9, 'effN in [1,n]', ctx);
  ok(e.sig <= Math.max(...heldOf(c).map(h => h.vol / 100)) + 1e-12, 'sigma <= max vol', ctx); ok(e.score >= 0 && e.score <= 100, 'score range', ctx);
  near(e.shareSum, 1, 1e-9, 'risk shares sum to 1', ctx);
  ok(Math.abs(o.legend.reduce((a, b) => a + b, 0) - 100) < 0.011 * o.legend.length, 'legend sums to 100', ctx);
  ok(Math.abs(parseFloat(o.text.weightedReturn) - e.mu * 100) <= 0.0051, 'rendered return text', ctx);
  ok(Math.abs(parseFloat(o.text.portfolioRisk) - e.sig * 100) <= 0.0051 + 1e-9, 'rendered sigma text', ctx);
}
const DASHES = ['weightedReturn', 'expectedIncome', 'medianReturn', 'portfolioRisk', 'sharpe', 'varValue', 'esValue', 'effN', 'divRatio', 'assetClasses', 'diversificationScore'];
const withdrawn = (c, o, tag) => { const ctx = tag + ' ' + JSON.stringify(c).slice(0, 160); ok(o.m.weightedReturn === null && o.m.portfolioRisk === null && o.m.varValue === null, 'metrics withdrawn (no data-raw)', ctx); ok(DASHES.every(k => o.m[k] === null), 'all metrics withdrawn', ctx); };

(async () => {
  const t0 = Date.now();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
  const problems = [], external = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message)); page.on('requestfailed', r => problems.push('failed: ' + r.url()));
  page.on('request', r => { if (!/^(file|data):/.test(r.url())) external.push(r.url()); });
  await page.goto(FILE, { waitUntil: 'networkidle0' });
  await page.evaluate(DRIVER);
  const run = async (cases) => { const out = []; for (let i = 0; i < cases.length; i += 100) out.push(...await page.evaluate(cs => window.__run(cs), cases.slice(i, i + 100))); return out; };

  // A. hand-checked reference portfolio
  { const o = (await run([{ on: ['stocks', 'etfs', 'gov-bonds', 'reits', 'cash', 'hysa'], alloc: { stocks: 20, etfs: 30, 'gov-bonds': 10, reits: 20, cash: 5, hysa: 15 }, ret: { stocks: 10, etfs: 8.7, 'gov-bonds': 3.2, reits: 7.8, cash: 0, hysa: 2.5 }, customs: [], V: 100000 }]))[0];
    near(+o.m.weightedReturn, 6.865, 1e-12, 'hand-calc weighted return 6.865%'); near(+o.m.expectedIncome, 6865, 1e-12, 'hand-calc gain $6,865'); }

  // B. closed forms
  const closed = [
    { name: 'uncorrelated 50/50 (gov10 + cmdty20)', customs: [{ name: 'A', cls: 'gov', alloc: 50, ret: 5, vol: 10 }, { name: 'B', cls: 'cm', alloc: 50, ret: 5, vol: 20 }], want: Math.sqrt(.25 * .01 + .25 * .04) },
    { name: 'single asset sigma = vol', customs: [{ name: 'A', cls: 'cy', alloc: 100, ret: 5, vol: 66 }], want: .66 },
    { name: 'zero-vol portfolio', customs: [{ name: 'A', cls: 'ca', alloc: 100, ret: 5, vol: 0 }], want: 0 },
    { name: 'same-class pair rho=lambda', customs: [{ name: 'A', cls: 'eq', alloc: 50, ret: 5, vol: 20 }, { name: 'B', cls: 'eq', alloc: 50, ret: 5, vol: 20 }], want: Math.sqrt(.25 * .04 * 2 + 2 * .25 * .04 * .85) }
  ];
  for (const k of closed) { const c = { on: [], alloc: {}, ret: {}, customs: k.customs, V: 1000 }; const o = (await run([c]))[0]; checkValid(c, o, k.name); near(+o.m.portfolioRisk, k.want, 1e-12, k.name + ' closed form'); }

  // C. each built-in alone at 100%, each class alone
  for (const id of IDS) { const c = { on: [id], alloc: { [id]: 100 }, ret: { [id]: 5 }, customs: [], V: 50000 }; const o = (await run([c]))[0]; checkValid(c, o, 'solo ' + id); near(+o.m.portfolioRisk, BUILTIN[id][0] / 100, 1e-12, 'solo sigma ' + id); near(+o.m.effN, 1, 1e-12, 'solo effN'); }
  for (const cl of CLS) for (const vol of [0, 1, 25, 500]) { const c = { on: [], alloc: {}, ret: {}, customs: [{ name: 'S', cls: cl, alloc: 100, ret: 3000, vol }], V: 1e9 }; checkValid(c, (await run([c]))[0], `solo class ${cl} vol ${vol}`); }

  // D. random valid portfolios
  const A = Array.from({ length: N_RANDOM }, () => randCase('valid')); const outA = await run(A); A.forEach((c, i) => checkValid(c, outA[i], '#' + i));

  // E. non-100 totals: error shown, metrics withdrawn; scaling then lands on exactly 100
  const B = Array.from({ length: 400 }, () => { const c = randCase('valid'); const f = pick([.5, .8, .9, .99, 1.01, 1.1, 1.5, 2]); c.alloc = Object.fromEntries(Object.entries(c.alloc).map(([k, v]) => [k, r2(v * f)])); c.customs.forEach(x => { x.alloc = r2(x.alloc * f); }); c.customs = c.customs.filter(x => x.alloc <= 100); /* the add-asset form itself refuses >100 */ c.thenScale = true; return c; });
  const outB = await run(B);
  B.forEach((c, i) => { const o = outB[i]; const tot = r2([...Object.values(c.alloc), ...c.customs.map(x => x.alloc)].reduce((a, b) => a + b, 0));
    const maxOne = Math.max(...Object.values(c.alloc), ...c.customs.map(x => x.alloc));
    if (maxOne > 100) { ok(o.banner.includes('bad') && /allocation must be a number from 0 to 100/.test(o.bannerText), 'single allocation > 100 is rejected as invalid', '#' + i + ' ' + o.bannerText); withdrawn(c, o, 'single>100#' + i); }
    else if (Math.abs(tot - 100) > 0.005 + 1e-9) { ok(/Under-allocated|Over-allocated/.test(o.bannerText), 'under/over banner', '#' + i + ' total ' + tot + ' ' + o.bannerText); withdrawn(c, o, 'nonhundred#' + i); ok(o.scale, 'scale enabled', '#' + i);
      ok(o.afterScale.sum === '100', 'scale lands on exactly 100', '#' + i + ' ' + o.afterScale.sum); ok(o.afterScale.banner.includes('ok'), 'ok after scale', '#' + i); }
    else checkValid(c, o, 'nonhundred-edge#' + i);
    ok(!/NaN|Infinity|undefined/.test(o.body), 'finite text', '#' + i); });

  // F. invalid inputs: blanks, out-of-range
  const bads = [['.alloc-input[data-id="stocks"]', ''], ['.ret-input[data-id="etfs"]', ''], ['.ret-input[data-id="stocks"]', '3001'], ['.ret-input[data-id="stocks"]', '-100.01'], ['.alloc-input[data-id="stocks"]', '100.01'], ['.alloc-input[data-id="stocks"]', '-1'], ['#portfolioValue', ''], ['#portfolioValue', '-5'], ['#portfolioValue', '1000000000001']];
  for (const [sel, val] of bads) { const c = { on: ['stocks', 'etfs'], alloc: { stocks: 60, etfs: 40 }, ret: { stocks: 10, etfs: 8 }, customs: [], V: 1000, bad: { sel, val } }; const o = (await run([c]))[0]; ok(o.banner.includes('bad'), 'invalid -> error banner', sel + '=' + val); withdrawn(c, o, 'invalid ' + sel); ok(!/NaN|Infinity/.test(o.body), 'finite', sel); }
  for (const [sel, val] of [['.ret-input[data-id="stocks"]', '3000'], ['.ret-input[data-id="stocks"]', '-100'], ['#portfolioValue', '0'], ['#portfolioValue', '1000000000000']]) { const c = { on: ['stocks', 'etfs'], alloc: { stocks: 60, etfs: 40 }, ret: { stocks: 10, etfs: 8 }, customs: [], V: 1000, bad: { sel, val } }; const o = (await run([c]))[0]; ok(o.banner.includes('ok'), 'boundary accepted', sel + '=' + val); }
  { const o = (await run([{ on: [], alloc: {}, ret: {}, customs: [], V: 1000 }]))[0]; ok(/at least one allocation/.test(o.bannerText), 'empty portfolio message'); withdrawn({}, o, 'empty'); }

  // G. XSS names never become markup
  { const c = { on: [], alloc: {}, ret: {}, customs: [{ name: '<img src=x onerror=window.__x=1>', cls: 'pv', alloc: 100, ret: 5, vol: 20 }], V: 1 }; await run([c]); ok(await page.evaluate(() => window.__x !== 1 && !document.querySelector('main img')), 'XSS name stays text'); }

  // H. no external requests, no console problems, no dark-mode / advice copy
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  ok(external.length === 0, 'no network requests', external.join()); ok(!/prefers-color-scheme/.test(html), 'no dark mode CSS'); ok(!/not investment advice|Illustrative/i.test(html), 'no advice disclaimers');
  ok(/Made By Souvik Guha, 2026/.test(html) && /href="https:\/\/github.com\/souvik-guha"/.test(html), 'credit + GitHub link');
  ok(problems.length === 0, 'no console errors/warnings', problems.join(' || '));

  console.log(`\n${pass + fail} assertions across ${A.length + B.length + closed.length + IDS.length + CLS.length * 4 + bads.length + 6} scenarios in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`passed ${pass}, failed ${fail}`); failures.forEach(f => console.log('  FAIL', f));
  await browser.close(); process.exit(fail ? 1 : 0);
})();
