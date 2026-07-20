import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * T8 (M-05) — Gates de regresión del doc 03 (HipertrofiaV2), parte FRONTEND/UI.
 *
 * Cada hallazgo tiene al menos un guard que falla si regresa. Los hallazgos de backend
 * (A-04 gate de menús, C-01/C-02/A-02/A-03) tienen sus tests en backend/tests/. Aquí:
 *  - A-05 (overlay móvil): invariante de z-index del reproductor sobre la barra inferior
 *    (verificado también con un hit-test real a 390×844) + RIR alcanzable (max-h/scroll).
 *  - M-01 (nutrición): abre el plan activo + a11y de tabs.
 *  - M-02 (kcal): el plan activo es la fuente de verdad.
 *  - M-03 (objetivo en Rutinas): se renderiza vía el catálogo canónico compartido.
 *
 * Son asserts a nivel de fuente + un hit-test sintético (sin auth ni BD), aptos para CI.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173';
const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8');

test.describe('doc03 · gates de regresión (frontend)', () => {
  test('A-05: el reproductor común queda por encima de la barra inferior (z-index)', () => {
    const player = read('src/components/routines/RoutineSessionModal.jsx');
    // El root del reproductor debe estar por encima de la nav (z-50).
    expect(player).toContain('z-[60]');
    // HipertrofiaV2 reutiliza el reproductor común (hereda el fix de z-index).
    const hpv2 = read('src/components/routines/HipertrofiaSessionModal.jsx');
    expect(hpv2).toContain("import RoutineSessionModal");
    expect(hpv2).toContain('<RoutineSessionModal');
    // La barra inferior sigue en z-50 (si sube a >=60 volvería a tapar "Comenzar").
    const nav = read('src/components/Navigation.jsx');
    expect(nav).toContain('z-50');
  });

  test('A-05: el modal de RIR es scrollable para que "Guardar Serie" sea alcanzable', () => {
    const rir = read('src/components/Methodologie/methodologies/HipertrofiaV2/components/SeriesTrackingModal.jsx');
    expect(rir).toMatch(/max-h-\[90dvh\]/);
    expect(rir).toContain('overflow-y-auto');
    expect(rir).toContain('Guardar Serie');
  });

  test('M-01: /nutrition abre el plan activo y las tabs tienen nombre accesible', () => {
    const screen = read('src/components/nutrition/NutritionScreen.jsx');
    expect(screen).toContain("setActiveTab('calendar-v2')");
    // aria-label en las tabs (el texto va oculto en móvil con hidden sm:block).
    expect(screen).toMatch(/aria-label=\{tab\.label\}/);
  });

  test('M-02: el plan activo es la fuente de verdad de kcal', () => {
    const screen = read('src/components/nutrition/NutritionScreen.jsx');
    // Ante drift, se conserva la cifra del plan (no se sustituye por la estimación).
    expect(screen).toContain('kcalValue = activePlanKcal');
    expect(screen).toMatch(/source = 'plan'/);
  });

  test('M-03: el objetivo en Rutinas usa el catálogo canónico y "mantenimiento" es legible', () => {
    const display = read('src/components/routines/summary/UserProfileDisplay.jsx');
    expect(display).toContain('getObjetivoLabel');
    const catalogs = read('src/config/catalogs.js');
    // El valor canónico y el legacy del alta se mapean a "Mantenimiento".
    expect(catalogs).toMatch(/mantenimiento['"]?,?\s*label:\s*'Mantenimiento'/);
    expect(catalogs).toMatch(/mantener_forma:\s*'Mantenimiento'/);
  });

  test('A-05: hit-test 390×844 — "Comenzar" (z-60) recibe el toque sobre la nav (z-50)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      const nav = globalThis.document.createElement('nav');
      nav.className = 'fixed bottom-0 left-0 right-0 z-50';
      nav.style.height = '72px';
      nav.innerHTML = '<button id="nav-nutri" style="width:100%;height:100%">Nutrición</button>';
      globalThis.document.body.appendChild(nav);

      const player = globalThis.document.createElement('div');
      player.className = 'fixed inset-0 bg-black/90 z-[60]';
      player.innerHTML = '<button id="comenzar" style="position:absolute;left:16px;right:16px;bottom:24px;height:56px">Comenzar</button>';
      globalThis.document.body.appendChild(player);

      let navClicks = 0, comenzarClicks = 0;
      globalThis.document.getElementById('nav-nutri').addEventListener('click', () => { navClicks++; });
      globalThis.document.getElementById('comenzar').addEventListener('click', () => { comenzarClicks++; });

      const b = globalThis.document.getElementById('comenzar').getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const topEl = globalThis.document.elementFromPoint(cx, cy);
      if (topEl) topEl.click();

      const out = { topElementId: topEl && topEl.id, navClicks, comenzarClicks };
      nav.remove(); player.remove();
      return out;
    });

    expect(result.topElementId).toBe('comenzar');
    expect(result.comenzarClicks).toBe(1);
    expect(result.navClicks).toBe(0);
  });
});
