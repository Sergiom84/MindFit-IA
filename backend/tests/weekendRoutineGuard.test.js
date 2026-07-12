import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("RoutineScreen conserva sesiones sueltas de fin de semana aunque no exista plan activo", async () => {
  const source = await readFile(
    new URL("../../src/components/routines/RoutineScreen.jsx", import.meta.url),
    "utf8",
  );

  const noPlanBranch = source.slice(source.indexOf("if (result?.noPlan)"));
  assert.match(noPlanBranch, /await getWeekendStatus\(\)/);
  assert.ok(
    noPlanBranch.indexOf("await getWeekendStatus()") < noPlanBranch.indexOf("goToMethodologies()"),
    "la sesión de fin de semana debe comprobarse antes de redirigir",
  );
  assert.match(source, /!hasStandaloneWeekendSession/);
});
