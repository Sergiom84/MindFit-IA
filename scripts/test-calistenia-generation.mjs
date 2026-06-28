#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const files = {
  server: path.join(rootDir, "backend", "server.js"),
  route: path.join(rootDir, "backend", "routes", "routineGeneration.js"),
  service: path.join(
    rootDir,
    "backend",
    "services",
    "routineGeneration",
    "methodologies",
    "CalisteniaService.js"
  ),
  workoutContext: path.join(rootDir, "src", "contexts", "WorkoutContext.jsx")
};

const args = new Set(process.argv.slice(2));
const useApi = args.has("--api");

function assertUsablePlan(response) {
  const plan = response?.plan || response?.routinePlan || response?.data?.plan;

  if (!response?.success) {
    throw new Error(`La respuesta no marca success=true: ${JSON.stringify(response).slice(0, 500)}`);
  }

  if (!plan || typeof plan !== "object") {
    throw new Error("La respuesta no contiene un objeto plan.");
  }

  if (!Array.isArray(plan.semanas) || plan.semanas.length === 0) {
    throw new Error("El plan no contiene semanas[] con al menos una semana.");
  }

  const hasSession = plan.semanas.some((week) => Array.isArray(week.sesiones) && week.sesiones.length > 0);
  if (!hasSession) {
    throw new Error("El plan contiene semanas[], pero no incluye sesiones[].");
  }
}

async function runStaticContractCheck() {
  const [serverSource, routeSource, serviceSource, contextSource] = await Promise.all([
    fs.readFile(files.server, "utf8"),
    fs.readFile(files.route, "utf8"),
    fs.readFile(files.service, "utf8"),
    fs.readFile(files.workoutContext, "utf8")
  ]);

  const failures = [];

  if (!serverSource.includes("req.url = '/api/routine-generation/specialist/calistenia/generate'")) {
    failures.push("El proxy /api/methodology/generate no enruta calistenia al specialist consolidado.");
  }

  if (!routeSource.includes("router.post('/specialist/:methodology/generate'")) {
    failures.push("No existe la ruta POST /api/routine-generation/specialist/:methodology/generate.");
  }

  if (!contextSource.includes("!result.success || !result.plan")) {
    failures.push("WorkoutContext no parece validar result.plan antes de activar el plan.");
  }

  const generatorMatch = serviceSource.match(/export async function generateCalisteniaPlan[\s\S]*?\n}/);
  const generatorBlock = generatorMatch?.[0] || "";

  if (!generatorBlock) {
    failures.push("No se encontro generateCalisteniaPlan() en CalisteniaService.js.");
  } else {
    if (/placeholder|Pendiente de implementaci[oó]n completa/i.test(generatorBlock)) {
      failures.push("generateCalisteniaPlan() sigue devolviendo un placeholder.");
    }

    if (!/\bplan\s*:/.test(generatorBlock)) {
      failures.push("generateCalisteniaPlan() no devuelve una propiedad plan.");
    }

    if (!/\bsemanas\s*:/.test(generatorBlock)) {
      failures.push("generateCalisteniaPlan() no construye semanas[], que es el contrato esperado por el frontend.");
    }
  }

  if (failures.length > 0) {
    const message = failures.map((failure) => `- ${failure}`).join("\n");
    throw new Error(`Contrato de generacion de calistenia no operativo:\n${message}`);
  }

  console.log("OK contrato estatico: calistenia enruta y devuelve un plan con semanas[].");
}

async function runApiSmoke() {
  const token = process.env.CALISTENIA_TEST_TOKEN || process.env.AUTH_TOKEN;
  const apiBaseUrl = (process.env.API_BASE_URL || "http://localhost:3010").replace(/\/$/, "");

  if (!token) {
    throw new Error("Define CALISTENIA_TEST_TOKEN o AUTH_TOKEN para probar el endpoint real.");
  }

  const payload = {
    mode: "manual",
    methodology: "calistenia",
    userProfile: {
      id: Number(process.env.CALISTENIA_TEST_USER_ID || 1)
    },
    selectedLevel: process.env.CALISTENIA_TEST_LEVEL || "basico",
    goals: "Smoke test de generacion de calistenia",
    selectedMuscleGroups: ["empuje", "tiron", "pierna", "core"],
    source: "script_contract_smoke",
    version: "5.0"
  };

  const response = await fetch(`${apiBaseUrl}/api/methodology/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no JSON (${response.status}): ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  assertUsablePlan(data);
  console.log("OK API smoke: /api/methodology/generate devolvio plan de calistenia usable.");
}

try {
  if (useApi) {
    await runApiSmoke();
  } else {
    await runStaticContractCheck();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
