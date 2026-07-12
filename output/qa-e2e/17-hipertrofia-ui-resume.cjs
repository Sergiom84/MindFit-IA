const { registerMobileUser, openWeekendWorkout, shot, report } = require("./ui-user-helpers.cjs");

(async () => {
  const run = await registerMobileUser({ slug: "mindfeed-ui", preferredMethodology: "bodybuilding", focus: "hipertrofia", speed: true });
  const { browser, page, issues } = run;
  try {
    await openWeekendWorkout(page, "Hipertrofia");
    const warmupSkip = page.getByRole("button", { name: /Saltar calentamiento/i });
    if (await warmupSkip.isVisible({ timeout: 20000 }).catch(() => false)) await warmupSkip.click();

    const start = page.getByRole("button", { name: /^Comenzar$/i }).first();
    await start.waitFor({ state: "visible", timeout: 20000 });
    await shot(page, "17-mindfeed-player-inicial");
    await start.click();

    const register = page.getByText(/Registrar Serie/i).first();
    if (await register.isVisible({ timeout: 8000 }).catch(() => false)) {
      const reps = page.locator('input[type="number"]').first();
      if (await reps.isVisible().catch(() => false)) await reps.fill("10");
      const rir = page.getByRole("button", { name: /RIR 2|^2$/i }).first();
      if (await rir.isVisible().catch(() => false)) await rir.click();
      await page.getByRole("button", { name: /Guardar Serie/i }).click();
    }
    await shot(page, "17-mindfeed-tras-serie");

    // Simula que el usuario cierra/reabre la app sin finalizar la sesión.
    await page.reload({ waitUntil: "domcontentloaded" });
    if (!page.url().includes("routines")) {
      await page.getByRole("button", { name: /^Rutinas$/i }).click();
    }
    const resume = page.getByRole("button", { name: /Reanudar Entrenamiento/i });
    await resume.waitFor({ state: "visible", timeout: 20000 });
    await shot(page, "17-mindfeed-reanudar");
    await resume.click();
    const resumedWarmup = page.getByRole("button", { name: /Saltar calentamiento/i });
    if (await resumedWarmup.isVisible({ timeout: 8000 }).catch(() => false)) await resumedWarmup.click();
    await page.getByRole("button", { name: /^Comenzar$/i }).first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(3500);
    if (!page.url().includes("routines")) throw new Error(`Reanudación expulsó al usuario a ${page.url()}`);
    await shot(page, "17-mindfeed-reanudado");
    console.log("MINDFEED_RESUME_OK", run.email, page.url());
    report(issues);
    if (issues.length) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("MINDFEED_UI_FATAL", error.message);
  process.exit(1);
});
