import { isCrossfitReasonCode } from "../reasonCodes.js";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function rejectUnknownKeys(value, allowed, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} debe ser objeto`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} no está permitido`);
  }
  return true;
}

export function requireKeys(value, required, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} es requerido`);
  }
}

export function requireString(value, path, errors, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} debe ser string no vacío`);
  }
}

export function requireId(value, path, errors, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (!((typeof value === "string" && value.trim()) || Number.isInteger(value))) {
    errors.push(`${path} debe ser identificador string o entero`);
  }
}

export function requireEnum(value, allowed, path, errors) {
  if (!allowed.includes(value)) errors.push(`${path} debe ser uno de: ${allowed.join(", ")}`);
}

export function requireFiniteNumber(value, path, errors, { min = -Infinity, max = Infinity, nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${path} debe ser número entre ${min} y ${max}`);
  }
}

export function requireInteger(value, path, errors, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${path} debe ser entero entre ${min} y ${max}`);
  }
}

export function requireArray(value, path, errors, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    errors.push(`${path} debe ser array con al menos ${min} elemento(s)`);
    return false;
  }
  return true;
}

export function requireIsoDate(value, path, errors) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${path} debe tener formato YYYY-MM-DD`);
  }
}

export function requireIsoTimestamp(value, path, errors) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    errors.push(`${path} debe ser timestamp ISO válido`);
  }
}

export function validateReasonCodes(value, path, errors, { min = 0 } = {}) {
  if (!requireArray(value, path, errors, { min })) return;
  value.forEach((code, index) => {
    if (!isCrossfitReasonCode(code)) errors.push(`${path}[${index}] reason_code desconocido`);
  });
}

export function validateDecisionTrace(value, path, errors, { min = 1 } = {}) {
  if (!requireArray(value, path, errors, { min })) return;
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const allowed = ["rule_id", "reason_code", "scope", "action", "details"];
    if (!rejectUnknownKeys(entry, allowed, itemPath, errors)) return;
    requireKeys(entry, ["rule_id", "reason_code"], itemPath, errors);
    requireString(entry.rule_id, `${itemPath}.rule_id`, errors);
    if (!isCrossfitReasonCode(entry.reason_code)) {
      errors.push(`${itemPath}.reason_code desconocido`);
    }
    if (entry.scope !== undefined) requireString(entry.scope, `${itemPath}.scope`, errors);
    if (entry.action !== undefined) requireString(entry.action, `${itemPath}.action`, errors);
    if (entry.details !== undefined && !isPlainObject(entry.details)) {
      errors.push(`${itemPath}.details debe ser objeto`);
    }
  });
}

export function contractResult(value, errors) {
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], value };
}
