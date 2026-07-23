import { test, expect } from '@playwright/test';

test('Experimento en vivo', async ({ page }) => {
  // Aquí pegaremos el código que genere el inspector
  await page.goto('http://localhost:5173/login');
  
  // TODO: Pegar código del inspector aquí
  
});