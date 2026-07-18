// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* 1 worker: la suite de regresión comparte una única conexión al pooler de
   * Supabase; ejecutar en paralelo lo agota (EMAXCONNSESSION). */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    /* Suite de regresión por API (sin navegador). Serie forzada dentro del spec. */
    {
      name: 'regresion-api',
      testMatch: /regresion-.*\.spec\.js/,
      fullyParallel: false,
    },
    /* QA-001: auditoría de accesibilidad (axe) sobre páginas públicas. */
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'audit-ui',
      testMatch: /auditoria-hipertrofia-nutricion\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'chromium',
      testIgnore: /regresion-.*\.spec\.js|a11y\.spec\.js|auditoria-hipertrofia-nutricion\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      testIgnore: /regresion-.*\.spec\.js|a11y\.spec\.js|auditoria-hipertrofia-nutricion\.spec\.js/,
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      testIgnore: /regresion-.*\.spec\.js|a11y\.spec\.js|auditoria-hipertrofia-nutricion\.spec\.js/,
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* El gate visual usa el bundle productivo. En CI reutiliza el preview que ya
   * levanta el job de accesibilidad; en local Playwright lo inicia y lo cierra. */
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/login',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
