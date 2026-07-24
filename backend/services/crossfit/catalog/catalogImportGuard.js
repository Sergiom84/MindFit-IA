function csvSet(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function fail(message) {
  throw new Error(`Importación abortada: ${message}`);
}

function connectionIdentity(connectionString) {
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      fail("CROSSFIT_CATALOG_DATABASE_URL debe usar postgres:// o postgresql://");
    }
    return {
      hostname: url.hostname.toLowerCase(),
      username: decodeURIComponent(url.username).toLowerCase()
    };
  } catch {
    fail("CROSSFIT_CATALOG_DATABASE_URL no es una URL PostgreSQL válida");
  }
}

function matchesExactSupabaseProject({ hostname, username }, projectRef) {
  const directHost = `db.${projectRef}.supabase.co`;
  const poolerUsername = `postgres.${projectRef}`;
  const isCanonicalPooler = hostname.endsWith(".pooler.supabase.com");
  return hostname === directHost || (isCanonicalPooler && username === poolerUsername);
}

export function assertCrossfitCatalogImportTarget({
  mode,
  env = process.env,
  connectionString,
  contentHash
} = {}) {
  const { hostname, username } = connectionIdentity(connectionString);

  if (mode === "local_ephemeral") {
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
    if (
      !localHost
      || env.NODE_ENV !== "test"
      || env.CROSSFIT_CATALOG_APPLY_ACK !== "EPHEMERAL_ONLY"
    ) {
      fail("--apply exige BD local, NODE_ENV=test y CROSSFIT_CATALOG_APPLY_ACK=EPHEMERAL_ONLY");
    }
    return Object.freeze({ mode, appliedTo: "local_ephemeral_draft" });
  }

  if (mode !== "production_draft") fail("modo de escritura desconocido");
  if (env.NODE_ENV !== "production") fail("--apply-production-draft exige NODE_ENV=production");
  if (env.CROSSFIT_CATALOG_APPLY_ACK !== "PRODUCTION_DRAFT_ONLY") {
    fail("falta la primera confirmación PRODUCTION_DRAFT_ONLY");
  }
  if (!contentHash || env.CROSSFIT_CATALOG_CONTENT_HASH_ACK !== contentHash) {
    fail("la segunda confirmación no coincide con el content_hash validado");
  }

  const projectRef = String(env.CROSSFIT_CATALOG_PROJECT_REF ?? "").trim().toLowerCase();
  const allowedProjects = csvSet(env.CROSSFIT_CATALOG_ALLOWED_PROJECT_REFS);
  const allowedHosts = csvSet(env.CROSSFIT_CATALOG_ALLOWED_HOSTS);
  if (!projectRef || !allowedProjects.has(projectRef)) {
    fail("el proyecto no está incluido en CROSSFIT_CATALOG_ALLOWED_PROJECT_REFS");
  }
  if (!allowedHosts.has(hostname)) {
    fail("el host no está incluido en CROSSFIT_CATALOG_ALLOWED_HOSTS");
  }
  if (!matchesExactSupabaseProject({ hostname, username }, projectRef)) {
    fail("la identidad de conexión no coincide con CROSSFIT_CATALOG_PROJECT_REF");
  }

  return Object.freeze({ mode, appliedTo: "production_draft" });
}

export function resolveCrossfitCatalogWriteAction(existing, contentHash) {
  if (!existing) return "write_draft";
  if (existing.status === "draft") return "write_draft";
  if (existing.status === "active" && existing.content_hash === contentHash) {
    return "verify_active";
  }
  if (existing.status === "active") {
    fail("el catálogo active tiene un content_hash distinto");
  }
  fail(`la versión existente tiene estado no escribible: ${existing.status ?? "unknown"}`);
}
