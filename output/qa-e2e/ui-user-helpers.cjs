const { launch, shot, report, BASE } = require("./lib.cjs");

async function fillNamed(page, name, value) {
  const field = page.locator(`[name="${name}"]`).first();
  if (!(await field.count())) return;
  if ((await field.evaluate((element) => element.tagName)) === "SELECT") {
    await field.selectOption(value);
  } else {
    await field.fill(String(value));
  }
}

async function registerMobileUser({ slug, preferredMethodology, focus = "mixto", speed = false }) {
  const run = await launch({ useState: false, speed });
  const { page } = run;
  const email = `qa.${slug}.${Date.now()}@test.entrenaconia.local`;

  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.locator('[name="nombre"]').waitFor({ state: "visible", timeout: 15000 });
  const basics = {
    nombre: "QA",
    apellido: slug,
    email,
    password: "QaTest2026!",
    edad: 29,
    sexo: "femenino",
    peso: 64,
    altura: 167,
    nivelEntrenamiento: "principiante",
    anosEntrenando: 1,
    frecuenciaSemanal: 3,
    metodologiaPreferida: preferredMethodology,
    nivelActividad: "moderado",
  };
  for (const [name, value] of Object.entries(basics)) await fillNamed(page, name, value);
  await shot(page, `${slug}-01-registro`);
  await page.getByRole("button", { name: /Siguiente/ }).click();

  await page.getByRole("button", { name: /Siguiente/ }).click();
  await fillNamed(page, "historialMedico", "Sin antecedentes relevantes");
  await fillNamed(page, "limitacionesFisicas", "");
  await page.getByRole("button", { name: /Siguiente/ }).click();

  const goals = {
    objetivoPrincipal: "mantenimiento",
    metaPeso: 63,
    enfoqueEntrenamiento: focus,
    horarioPreferido: "tarde",
  };
  for (const [name, value] of Object.entries(goals)) {
    await fillNamed(page, name, value).catch(() => {});
  }
  const terms = page.locator('[name="acceptTerms"]');
  if (await terms.count()) await terms.check();
  else await page.getByRole("checkbox").check();
  await shot(page, `${slug}-02-objetivos`);
  await page.getByRole("button", { name: /Guardar Perfil/ }).click();
  await page.waitForURL((url) => !url.pathname.includes("register"), { timeout: 20000 });
  await shot(page, `${slug}-03-dashboard`);
  return { ...run, email };
}

async function openWeekendWorkout(page, methodologyLabel) {
  if (!page.url().includes("methodologies")) {
    await page.getByRole("button", { name: /^Métodos$/i }).click();
  }
  await page.getByText("Manual (tú eliges)", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  const manual = page.getByText("Manual (tú eliges)", { exact: true });
  await manual.click();
  const card = page.locator(`[aria-label="Tarjeta de metodología ${methodologyLabel}"]`);
  await card.getByRole("button", { name: new RegExp(`Seleccionar metodología ${methodologyLabel}`, "i") }).click();

  await shot(page, `seleccion-${methodologyLabel.toLowerCase()}`);
  const dialogs = page.getByRole("dialog");
  console.log(
    "DIALOG_AFTER_SELECT",
    methodologyLabel,
    await dialogs.count(),
    (await dialogs.allInnerTexts()).join(" | ").slice(0, 1200).replace(/\n+/g, " | "),
  );

  const manualLevel = page.getByRole("button", { name: /Elegir Nivel Manualmente/i });
  if (await manualLevel.isVisible({ timeout: 12000 }).catch(() => false)) {
    await manualLevel.click();
  }
  await shot(page, `nivel-manual-${methodologyLabel.toLowerCase()}`);
  const levelCard = page.getByText(/Principiante|Intermedio/, { exact: true }).first();
  if (await levelCard.isVisible({ timeout: 5000 }).catch(() => false)) await levelCard.click();
  const generate = page.getByRole("button", { name: /Generar Plan Manual|Generar Plan|Crear Plan/i }).last();
  if (await generate.isVisible({ timeout: 5000 }).catch(() => false)) await generate.click();

  await shot(page, `tras-generar-${methodologyLabel.toLowerCase()}`);

  await page.getByText(/Hoy es sábado/i).waitFor({ state: "visible", timeout: 30000 });
  const accept = page.getByRole("button", { name: /Aceptar entrenamiento para hoy/i });
  await accept.waitFor({ state: "visible", timeout: 10000 });
  await accept.click();
  await shot(page, `tras-aceptar-${methodologyLabel.toLowerCase()}`);
}

module.exports = { registerMobileUser, openWeekendWorkout, shot, report };
