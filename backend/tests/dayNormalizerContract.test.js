import test from "node:test";
import assert from "node:assert/strict";

import {
  getDayAbbrevByIndex,
  getDayNameByIndex,
  normalizeDayAbbrev,
  normalizeDayFullName,
} from "../utils/shared/dayNormalizer.js";

test("dayNormalizer expone nombres consistentes para rutas de rutina", () => {
  assert.equal(normalizeDayAbbrev("Miércoles"), "Mie");
  assert.equal(normalizeDayAbbrev("miercoles"), "Mie");
  assert.equal(normalizeDayAbbrev("Sábado"), "Sab");

  assert.equal(normalizeDayFullName("Mie"), "Miércoles");
  assert.equal(normalizeDayFullName("miercoles"), "Miércoles");
  assert.equal(normalizeDayFullName("Sab"), "Sábado");

  assert.equal(getDayNameByIndex(0), "Domingo");
  assert.equal(getDayNameByIndex(2), "Martes");
  assert.equal(getDayAbbrevByIndex(0), "Dom");
  assert.equal(getDayAbbrevByIndex(2), "Mar");
});

