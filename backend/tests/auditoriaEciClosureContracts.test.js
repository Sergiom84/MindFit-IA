import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

test("ARCH-001 mantiene VITE_API_URL y tokens detrás de sus adapters", () => {
  const srcRoot = path.join(repoRoot, "src");
  const apiConfig = path.join(srcRoot, "config", "api.js");
  const tokenManager = path.join(srcRoot, "utils", "tokenManager.js");

  for (const file of sourceFiles(srcRoot)) {
    const source = fs.readFileSync(file, "utf8");
    if (file !== apiConfig) assert.doesNotMatch(source, /import\.meta\.env\.VITE_API_URL/);
    if (file !== tokenManager) {
      assert.doesNotMatch(
        source,
        /localStorage\.(?:getItem|setItem|removeItem)\(\s*["'](?:authToken|token)["']/,
      );
    }
  }
});

test("DEP-001 usa exceljs y no conserva SheetJS", () => {
  const packageJson = read("backend/package.json");
  const recipeImporter = read("backend/scripts/import-recipe-examples-from-excel.js");
  const legacyImporter = read("backend/scripts/upload-excel.js");

  assert.match(packageJson, /"exceljs"/);
  assert.doesNotMatch(packageJson, /"xlsx"/);
  assert.match(recipeImporter, /from "exceljs"/);
  assert.match(legacyImporter, /from 'exceljs'/);
});

test("QA-001 y PERF-001 permanecen como gates reproducibles", () => {
  const workflow = read(".github/workflows/ci.yml");
  const a11y = read("tests/a11y.spec.js");
  const main = read("src/main.jsx");
  const exerciseView = read("src/components/routines/session/ExerciseSessionView.jsx");

  assert.match(workflow, /a11y-audit:/);
  assert.match(workflow, /npm run perf:budget/);
  assert.match(a11y, /http:\/\/localhost:4173/);
  assert.match(main, /initWebVitals/);
  assert.match(exerciseView, /preload="metadata"/);
  assert.match(exerciseView, /loading="lazy"/);
});

test("OPS-002 conserva build AAB reproducible y UX-001 accesos directos", () => {
  const androidWorkflow = read(".github/workflows/android.yml");
  const nodeVersion = read(".node-version").trim();
  const navigation = read("src/components/Navigation.jsx");

  assert.match(androidWorkflow, /java-version: "21"/);
  assert.match(androidWorkflow, /node-version-file: "\.node-version"/);
  assert.equal(nodeVersion, "24.14.1");
  assert.match(androidWorkflow, /bundleRelease/);
  assert.match(androidWorkflow, /upload-artifact@v4/);
  assert.match(navigation, /handleNavigate\('\/home-training'\)/);
  assert.match(navigation, /handleNavigate\('\/video-correction'\)/);
  assert.match(navigation, />Corrección por IA</);
});
