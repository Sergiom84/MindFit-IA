import crypto from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableCrossfitJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function crossfitHash(value) {
  return crypto.createHash("sha256").update(stableCrossfitJson(value)).digest("hex");
}

export function deterministicIndex(seed, length) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  return Number.parseInt(crossfitHash(seed).slice(0, 12), 16) % length;
}

export function stableCrossfitId(prefix, value) {
  return `${prefix}_${crossfitHash(value).slice(0, 24)}`;
}

export function deterministicRank(items, seed, score) {
  return [...items].sort((left, right) => {
    const scoreDelta = score(right) - score(left);
    if (scoreDelta !== 0) return scoreDelta;
    const leftTie = crossfitHash([seed, left.canonical_id ?? left.id ?? left]);
    const rightTie = crossfitHash([seed, right.canonical_id ?? right.id ?? right]);
    return leftTie.localeCompare(rightTie);
  });
}
