const { registerMobileUser, openWeekendWorkout, shot, report } = require("./ui-user-helpers.cjs");

(async () => {
  const run = await registerMobileUser({ slug: "crossfit-ui", preferredMethodology: "crossfit", focus: "hiit" });
  const { browser, page, issues } = run;
  try {
    await openWeekendWorkout(page, "CrossFit");
    console.log("CROSSFIT_AFTER_FLOW", (await page.locator("body").innerText()).slice(-1200).replace(/\n+/g, " | "));
    const skipWarmup = page.getByRole("button", { name: /Saltar calentamiento/i });
    await skipWarmup.waitFor({ state: "visible", timeout: 30000 });
    await skipWarmup.click();
    const wodTitle = page.getByText(/WOD del Día|AMRAP|EMOM|For Time|Chipper/i).first();
    await wodTitle.waitFor({ state: "visible", timeout: 25000 });
    await shot(page, "16-crossfit-wod-player");

    await page.getByRole("button", { name: /Scaled/i }).click();
    await page.getByRole("button", { name: /^Iniciar$/i }).click();
    await page.waitForTimeout(2200);
    await page.getByRole("button", { name: /^Pausar$/i }).click();
    const timer = await page.locator("text=/00:0[1-9]/").first().textContent();
    console.log("WOD_TIMER", timer);
    await page.getByRole("button", { name: /Terminar WOD/i }).click();

    const effort = page.getByText("¿Cómo fue el WOD?", { exact: true });
    await effort.waitFor({ state: "visible", timeout: 30000 });
    await shot(page, "16-crossfit-esfuerzo");
    await page.getByRole("button", { name: /^Sí$/i }).click();
    await page.getByRole("button", { name: /^8\s*Duro$/i }).click();
    await page.getByRole("button", { name: /^Guardar$/i }).click();
    const continueButton = page.getByRole("button", { name: /^Continuar$/i });
    await continueButton.waitFor({ state: "visible", timeout: 30000 });
    await continueButton.click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await shot(page, "16-crossfit-tras-recarga");
    console.log("CROSSFIT_UI_OK", run.email, page.url());
    report(issues);
    if (issues.length) process.exitCode = 2;
  } catch (error) {
    await shot(page, "16-crossfit-fatal");
    report(issues);
    console.log("CROSSFIT_FATAL_BODY", (await page.locator("body").innerText()).slice(-1600).replace(/\n+/g, " | "));
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("CROSSFIT_UI_FATAL", error.message);
  process.exit(1);
});
