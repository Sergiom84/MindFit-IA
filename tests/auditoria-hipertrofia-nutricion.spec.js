import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:4173';

test('A-05: el reproductor móvil queda por encima de la navegación inferior', async ({ page }) => {
  const modalSource = fs.readFileSync(
    path.resolve('src/components/routines/RoutineSessionModal.jsx'),
    'utf8'
  );
  expect(modalSource).toContain('z-[60]');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    globalThis.__auditClicks = { start: 0, navigation: 0 };
    globalThis.document.body.insertAdjacentHTML('beforeend', `
      <div id="audit-session" class="fixed inset-0 z-[60] bg-black/90">
        <button id="audit-start" class="fixed bottom-4 left-1/2 -translate-x-1/2 h-14 w-64 bg-yellow-400">
          Comenzar
        </button>
      </div>
      <nav id="audit-navigation" class="fixed bottom-0 left-0 right-0 z-50 h-20 bg-neutral-900">
        <button id="audit-nutrition" class="absolute inset-0">Nutrición</button>
      </nav>
    `);
    globalThis.document.querySelector('#audit-start').addEventListener('click', () => {
      globalThis.__auditClicks.start += 1;
    });
    globalThis.document.querySelector('#audit-nutrition').addEventListener('click', () => {
      globalThis.__auditClicks.navigation += 1;
    });
  });

  const start = page.locator('#audit-start');
  const box = await start.boundingBox();
  expect(box).not.toBeNull();

  const topElementId = await page.evaluate(({ x, y }) =>
    globalThis.document.elementFromPoint(x, y)?.id,
  { x: box.x + (box.width / 2), y: box.y + (box.height / 2) });
  expect(topElementId).toBe('audit-start');

  await start.click();
  await expect.poll(() => page.evaluate(() => globalThis.__auditClicks)).toEqual({
    start: 1,
    navigation: 0
  });
});
