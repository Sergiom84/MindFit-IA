// Arnés E2E QA — Playwright directo (el navegador integrado de la sesión está caído)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const STATE = path.join(OUT, 'storageState.json');
const BASE = 'http://localhost:5173';

async function launch({ useState = true, clockAt = null, dateAt = null, speed = false, injectToken = null, injectAuth = null } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(useState && fs.existsSync(STATE) ? { storageState: STATE } : {})
  });
  const page = await context.newPage();
  if (injectToken) {
    // Al falsear la fecha del navegador más allá de la expiración del JWT (7d), el
    // cliente valida exp contra el Date falseado y desloguea. Inyectar un token de
    // expiración lejana (mismo JWT_SECRET) mantiene la sesión en cualquier fecha.
    await context.addInitScript((tok) => {
      try { localStorage.setItem('authToken', tok); localStorage.setItem('token', tok); } catch {}
    }, injectToken);
  }
  if (injectAuth) {
    // Inyección de auth COMPLETA (token largo + usuario), sin pasar por registro/login UI.
    // authConfig: TOKEN='authToken', USER='userProfile'; save-set lee userId de user/userProfile.
    await context.addInitScript((a) => {
      try {
        localStorage.setItem('authToken', a.token);
        localStorage.setItem('token', a.token);
        const u = JSON.stringify(a.user);
        localStorage.setItem('userProfile', u);
        localStorage.setItem('user', u);
      } catch {}
    }, injectAuth);
  }
  if (clockAt) {
    await page.clock.install({ time: new Date(clockAt) });
    console.log('CLOCK instalado en', clockAt);
  }
  if (dateAt) {
    // Solo desplaza Date (calendario); los timers reales no se tocan.
    const offsetMs = new Date(dateAt).getTime() - Date.now();
    await page.addInitScript((off) => {
      const RealDate = Date;
      class FakeDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(RealDate.now() + off);
          else super(...args);
        }
        static now() { return RealDate.now() + off; }
      }
      FakeDate.parse = RealDate.parse.bind(RealDate);
      FakeDate.UTC = RealDate.UTC.bind(RealDate);
      // eslint-disable-next-line no-global-assign
      window.Date = FakeDate;
    }, offsetMs);
    console.log('DATE desplazado a', dateAt, `(offset ${Math.round(offsetMs / 3600000)}h)`);
  }
  if (speed) {
    // Acorta duraciones de ejercicio/descanso reescribiendo las respuestas de la API.
    const patch = (o) => {
      if (Array.isArray(o)) { o.forEach(patch); return; }
      if (o && typeof o === 'object') {
        if ('descanso_seg' in o) { o.descanso_seg = 1; o.duracion_seg = 2; }
        if ('descanso' in o && (typeof o.descanso === 'number' || /^\d+/.test(String(o.descanso)))) { o.descanso = 1; o.duracion_seg = 2; }
        if ('rest_seconds' in o) o.rest_seconds = 1;
        for (const k of Object.keys(o)) patch(o[k]);
      }
    };
    await context.route('**/api/**', async (route) => {
      try {
        const resp = await route.fetch();
        const ct = resp.headers()['content-type'] || '';
        if (!ct.includes('application/json')) return route.fulfill({ response: resp });
        const json = await resp.json();
        patch(json);
        return route.fulfill({ response: resp, json });
      } catch {
        return route.continue();
      }
    });
    console.log('SPEED: duraciones acortadas vía intercepción');
  }
  const issues = [];
  const verbose = !!process.env.QA_VERBOSE;
  page.on('console', m => {
    if (m.type() === 'error') issues.push({ kind: 'console', text: m.text().slice(0, 300) });
    if (verbose && /plan|activo|active|redirect|sesión|session|hoy|serie|tracking|guardando|guardar|❌|⚠️|error/i.test(m.text())) {
      console.log('  [console]', m.text().slice(0, 220));
    }
  });
  page.on('dialog', d => {
    console.log('  [dialog]', d.type(), d.message().slice(0, 150));
    d.dismiss().catch(() => {});
  });
  if (verbose) {
    page.on('response', async r => {
      if (/active-plan|sessions\/(start|today)|today-status|training\/state|save-set|\/finish|\/exercise\//.test(r.url())) {
        let body = '';
        try { body = (await r.text()).slice(0, 250); } catch {}
        console.log(`  [net] ${r.status()} ${r.url().replace(/^.*\/api/, '/api').slice(0, 90)} → ${body}`);
      }
    });
  }
  page.on('pageerror', e => issues.push({ kind: 'pageerror', text: String(e).slice(0, 300) }));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().includes('localhost')) {
      issues.push({ kind: 'http', status: r.status(), url: r.url().replace(BASE, '').slice(0, 200) });
    }
  });
  return { browser, context, page, issues };
}

const RUN_ID = String(process.pid % 10000);
async function shot(page, name) {
  const file = path.join(OUT, 'shots', name + '-r' + RUN_ID + '.png');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: false });
    console.log('SHOT', file);
  } catch (e) {
    console.log('SHOT FAIL', name, e.message.split('\n')[0]);
  }
}

async function saveState(context) {
  await context.storageState({ path: STATE });
  console.log('STATE saved');
}

function report(issues) {
  const uniq = [...new Set(issues.map(i => JSON.stringify(i)))].slice(0, 30);
  console.log('ISSUES(' + issues.length + '):');
  uniq.forEach(i => console.log('  ', i));
}

module.exports = { launch, shot, saveState, report, BASE, OUT };
