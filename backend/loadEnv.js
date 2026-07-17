// Carga las variables de entorno ANTES que cualquier otro módulo (M-04).
//
// Debe ser el PRIMER import de server.js: en ESM el primer módulo importado se
// evalúa por completo antes de resolver los siguientes, así garantizamos que
// process.env ya está poblado cuando se importan módulos que leen claves al
// cargarse (db.js → DATABASE_URL, clientes OpenAI → OPENAI_API_KEY, auth →
// JWT_SECRET). Antes, dotenv.config() estaba después de todos los imports y el
// arranque local podía fallar por variables no cargadas a tiempo.
import dotenv from 'dotenv';

// En producción (Render) las variables llegan del entorno; cargar .env es
// inofensivo si no existe, pero lo evitamos para no pisar el entorno real.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}
