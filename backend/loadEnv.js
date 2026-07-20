// Carga las variables de entorno ANTES que cualquier otro módulo (M-04).
//
// Debe ser el PRIMER import de server.js: en ESM el primer módulo importado se
// evalúa por completo antes de resolver los siguientes, así garantizamos que
// process.env ya está poblado cuando se importan módulos que leen claves al
// cargarse (db.js → DATABASE_URL, clientes OpenAI → OPENAI_API_KEY, auth →
// JWT_SECRET). Antes, dotenv.config() estaba después de todos los imports y el
// arranque local podía fallar por variables no cargadas a tiempo.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// En producción (Render) las variables llegan del entorno; cargar .env es
// inofensivo si no existe, pero lo evitamos para no pisar el entorno real.
if (process.env.NODE_ENV !== 'production') {
  // backend/.env se resuelve relativo a ESTE fichero, no al CWD: M-04 era justo que
  // `npm --prefix backend start` desde la raíz cargaba el .env de la raíz (sin
  // JWT_SECRET) y el backend no arrancaba.
  dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });
}

// M-04: fail-fast con mensaje claro para lo IMPRESCINDIBLE, y warning para lo opcional.
// Mejor fallar al arrancar con un motivo legible que caer con errores crípticos en la
// primera petición (jwt.verify sin secreto) o dejar la IA rota en silencio.
if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  console.error(
    '❌ [arranque] Falta JWT_SECRET: el backend no puede firmar ni verificar tokens. ' +
    'Defínela en backend/.env (local) o en las variables de entorno del servicio (Render).'
  );
  throw new Error('JWT_SECRET no configurada');
}

// OPENAI_API_KEY es OPCIONAL: solo warning. Las funciones de IA (re-evaluación,
// corrección foto/vídeo, menús IA) degradan a fallback si falta; no bloquean el arranque.
if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
  console.warn(
    '⚠️ [arranque] OPENAI_API_KEY no configurada: las funciones de IA quedan desactivadas ' +
    'y degradan a respuesta de fallback. El resto del backend arranca con normalidad.'
  );
}
