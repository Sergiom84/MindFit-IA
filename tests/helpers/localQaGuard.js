const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function parseUrl(value, label, protocols) {
  if (!value) throw new Error(`[QA-SAFETY] Falta ${label}`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[QA-SAFETY] ${label} no es una URL válida`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`[QA-SAFETY] ${label} usa un protocolo no permitido`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[QA-SAFETY] ${label} debe apuntar a localhost, nunca a producción`,
    );
  }
  return parsed;
}

export function resolveLocalQaGate({
  acknowledgment,
  apiBase,
  appBase = null,
  databaseUrl,
} = {}) {
  if (acknowledgment !== "1") {
    return {
      enabled: false,
      reason: "Define E2E_LOCAL_DB=1 solo con un stack local efímero",
    };
  }

  const api = parseUrl(apiBase, "QA_BASE", ["http:", "https:"]);
  const database = parseUrl(databaseUrl, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  const app = appBase
    ? parseUrl(appBase, "E2E_BASE_URL", ["http:", "https:"])
    : null;

  return {
    enabled: true,
    reason: null,
    apiBase: api.origin,
    appBase: app?.origin ?? null,
    databaseUrl: database.toString(),
  };
}

export function resolveLocalQaGateFromEnv(
  env = process.env,
  { requireApp = false } = {},
) {
  return resolveLocalQaGate({
    acknowledgment: env.E2E_LOCAL_DB,
    apiBase: env.QA_BASE || "http://127.0.0.1:3010",
    appBase: requireApp ? env.E2E_BASE_URL || "http://127.0.0.1:4173" : null,
    databaseUrl: env.DATABASE_URL,
  });
}
