export const CROSSFIT_RESULT_DRAFT_VERSION = "crossfit-result-draft-local/v2";

const INDEX_KEY = "crossfit:result-drafts:v2";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SURFACES = new Set(["today", "single-day"]);

function storageOrNull(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function validTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function crossfitResultDraftStorageKey(sessionId, ownerId) {
  return `crossfit:result-draft:v2:${String(ownerId)}:${String(sessionId)}`;
}

export function createCrossfitResultDraft({
  sessionId,
  ownerId,
  planId = null,
  surface,
  wodSummary,
  form = null,
  now = new Date()
}) {
  const normalizedSessionId = String(sessionId ?? "").trim();
  const normalizedOwnerId = String(ownerId ?? "").trim();
  if (!normalizedSessionId || !normalizedOwnerId || !SURFACES.has(surface)) return null;
  if (wodSummary?.runtimeVersion !== "crossfit-runtime-event/v2") return null;
  const timestamp = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return {
    schema_version: CROSSFIT_RESULT_DRAFT_VERSION,
    state: "pending_feedback",
    session_id: normalizedSessionId,
    owner_id: normalizedOwnerId,
    plan_id: planId == null ? null : String(planId),
    surface,
    idempotency_key: `crossfit-result-v2:${normalizedSessionId}`,
    wod_summary: wodSummary,
    form: form && typeof form === "object" ? form : null,
    created_at: timestamp.toISOString(),
    updated_at: timestamp.toISOString()
  };
}

export function hydrateCrossfitResultDraft(raw, { sessionId = null, ownerId = null, now = new Date() } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const updatedAt = validTimestamp(raw.updated_at);
  if (
    raw.schema_version !== CROSSFIT_RESULT_DRAFT_VERSION
    || raw.state !== "pending_feedback"
    || !String(raw.session_id ?? "").trim()
    || !String(raw.owner_id ?? "").trim()
    || (sessionId != null && String(raw.session_id) !== String(sessionId))
    || (ownerId != null && String(raw.owner_id) !== String(ownerId))
    || !SURFACES.has(raw.surface)
    || raw.wod_summary?.runtimeVersion !== "crossfit-runtime-event/v2"
    || !Number.isFinite(nowMs)
    || updatedAt === null
    || updatedAt > nowMs + 60_000
    || nowMs - updatedAt > MAX_AGE_MS
  ) return null;
  return raw;
}

function readIndex(storage) {
  try {
    const value = JSON.parse(storage.getItem(INDEX_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function persistCrossfitResultDraft(draft, storage = null, now = new Date()) {
  const target = storageOrNull(storage);
  const valid = hydrateCrossfitResultDraft(draft, { now });
  if (!target || !valid) return false;
  const updated = { ...valid, updated_at: (now instanceof Date ? now : new Date(now)).toISOString() };
  const key = crossfitResultDraftStorageKey(updated.session_id, updated.owner_id);
  try {
    target.setItem(key, JSON.stringify(updated));
    const nextIndex = [
      {
        key,
        session_id: updated.session_id,
        owner_id: updated.owner_id,
        surface: updated.surface,
        updated_at: updated.updated_at
      },
      ...readIndex(target).filter((item) => item?.key !== key)
    ].slice(0, 10);
    target.setItem(INDEX_KEY, JSON.stringify(nextIndex));
    return true;
  } catch {
    return false;
  }
}

export function loadCrossfitResultDraft(sessionId, ownerId, storage = null, now = new Date()) {
  const target = storageOrNull(storage);
  if (!target || sessionId == null || ownerId == null) return null;
  try {
    const raw = JSON.parse(target.getItem(crossfitResultDraftStorageKey(sessionId, ownerId)));
    return hydrateCrossfitResultDraft(raw, { sessionId, ownerId, now });
  } catch {
    return null;
  }
}

export function loadLatestCrossfitResultDraft({ surface = null, ownerId = null, storage = null, now = new Date() } = {}) {
  const target = storageOrNull(storage);
  if (!target || ownerId == null) return null;
  for (const item of readIndex(target)) {
    if (surface && item?.surface !== surface) continue;
    if (String(item?.owner_id) !== String(ownerId)) continue;
    const draft = loadCrossfitResultDraft(item?.session_id, ownerId, target, now);
    if (draft && (!surface || draft.surface === surface)) return draft;
  }
  return null;
}

export function updateCrossfitResultDraftForm(sessionId, ownerId, form, storage = null, now = new Date()) {
  const existing = loadCrossfitResultDraft(sessionId, ownerId, storage, now);
  if (!existing) return false;
  return persistCrossfitResultDraft({ ...existing, form }, storage, now);
}

export function clearCrossfitResultDraft(sessionId, ownerId, storage = null) {
  const target = storageOrNull(storage);
  if (!target || sessionId == null || ownerId == null) return false;
  const key = crossfitResultDraftStorageKey(sessionId, ownerId);
  try {
    target.removeItem(key);
    target.setItem(INDEX_KEY, JSON.stringify(readIndex(target).filter((item) => item?.key !== key)));
    return true;
  } catch {
    return false;
  }
}
