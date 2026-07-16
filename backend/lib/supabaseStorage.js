import { createClient } from '@supabase/supabase-js';

// Cliente Supabase con service_role para operaciones de Storage desde el backend.
// Se crea de forma perezosa para que un backend sin claves configuradas no falle
// al arrancar; los routers que lo usan devuelven error controlado si falta config.
let _client = null;

export const MEDICAL_DOCS_BUCKET = 'medical-docs';

export function getSupabaseAdmin() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase Storage no configurado (faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)');
  }
  _client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _client;
}

// Ruta canónica de un documento médico dentro del bucket privado.
export function medicalDocPath(userId, filename) {
  return `${userId}/${filename}`;
}
