// QA-001: auditoría de accesibilidad automática (axe-core) sobre las páginas PÚBLICAS
// (login/register), que no requieren backend para renderizar. Umbral: 0 violaciones
// critical/serious. Base URL configurable con A11Y_BASE_URL (CI usa `vite preview`).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.A11Y_BASE_URL || 'http://localhost:4173';

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
];

for (const p of PAGES) {
  test(`a11y sin violaciones critical/serious: ${p.name}`, async ({ page }) => {
    // domcontentloaded (no networkidle: la app puede hacer polling y no estabilizarse).
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' });
    // Esperar a que el formulario esté renderizado antes de auditar.
    await page.waitForSelector('input', { timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (blocking.length) {
      console.log(`Violaciones (${p.name}):`, JSON.stringify(
        blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 2
      ));
    }
    expect(blocking, `${blocking.length} violación(es) critical/serious en ${p.name}`).toEqual([]);
  });
}
