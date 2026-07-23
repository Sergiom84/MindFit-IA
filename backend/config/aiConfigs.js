// Configuración central de módulos IA
// NUEVA CONFIGURACIÓN: Una sola API key maestra para todos los módulos
// Añade en .env (no comprometer claves en código):
// OPENAI_API_KEY=sk-proj-...

export const AI_MODULES = {
  VIDEO_CORRECTION: {
    key: 'VIDEO_CORRECTION',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4.1-nano',
    temperature: 0.43,
    max_output_tokens: 2048,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_68a83503ca28819693a81b0651dd52e00901a6ecf8a21eef',
    promptVersion: "3",
    systemPrompt: 'correction_video_ia' // Se carga desde el archivo MD
  },
  HOME_TRAINING: {
    key: 'HOME_TRAINING',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4.1-nano',
    temperature: 1.0,
    max_output_tokens: 2048,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_688fd23d27448193b5bfbb2c4ef9548103c68f1f6b84e824',
    promptVersion: "10",
    systemPrompt: 'home_training' // Se carga desde el archivo MD
  },
  PHOTO_CORRECTION: {
    key: 'PHOTO_CORRECTION',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_output_tokens: 1500,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_68a89775a9e08190a95a5e3d484fd09a055e214db81a6fd0',
    promptVersion: "1",
    systemPrompt: 'correction_photo_ia' // Se carga desde el archivo MD
  },
  METHODOLOGIE_MANUAL: {
    key: 'METHODOLOGIE_MANUAL',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_output_tokens: 16000,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_68a9a18bdfc08197965d75cd064eeb1f0a109ccbc248c9ca',
    promptVersion: "8",
    systemPrompt: 'methodologie_manual' // Se carga desde prompts/methodologie_manual.md
  },
  METHODOLOGIE: {
    key: 'METHODOLOGIE',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.9,
    max_output_tokens: 16000,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_68a9a05d7ee0819493fd342673a05b210a99044d2c5e3055',
    promptVersion: "9",
    systemPrompt: 'methodologie' // Se cargará desde el archivo MD
  },
  NUTRITION: {
    key: 'NUTRITION',
    envKey: 'OPENAI_API_KEY',
    model: process.env.NUTRITION_HYBRID_MODEL || 'gpt-5.2',
    temperature: 0.7,
    max_output_tokens: 8000,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_68ae0d8c52908196a4d207ac1292fcff0eb39487cfc552fc',
    promptVersion: "1.0",
    systemPrompt: 'nutrition' // Se cargará desde el archivo MD
  },
  CALISTENIA_SPECIALIST: {
    key: 'CALISTENIA_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.8,
    max_output_tokens: 16384,  // 🔧 Aumentado de 12000 a 16384 (máximo del modelo)
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_68bbf7d87c948194b0b82e000b5274f30663795f5e3b2843',
    promptVersion: "1.0",
    systemPrompt: 'calistenia_specialist' // Se cargará desde el archivo MD
  },
  HEAVY_DUTY_SPECIALIST: {
    key: 'HEAVY_DUTY_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.7,  // Más conservador que calistenia (alta intensidad requiere precisión)
    max_output_tokens: 16384,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_heavyduty_001',  // Temporal - se generará el ID real
    promptVersion: "1.0",
    systemPrompt: 'heavy_duty_specialist' // Se cargará desde el archivo MD
  },
  // HIPERTROFIA_SPECIALIST retirado (B-02): la hipertrofia legacy se eliminó;
  // HipertrofiaV2 tiene su propio motor y no usa este config de IA.
  POWERLIFTING_SPECIALIST: {
    key: 'POWERLIFTING_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.7,  // Precisión alta para técnica y periodización específica
    max_output_tokens: 16384,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_powerlifting_001',  // Temporal - se generará el ID real
    promptVersion: "1.0",
    systemPrompt: 'powerlifting_specialist' // Se cargará desde el archivo MD
  },
  CROSSFIT_SPECIALIST: {
    key: 'CROSSFIT_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.9,  // Alta variedad para WODs constantemente variados (filosofía CrossFit)
    max_output_tokens: 16384,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_crossfit_001',  // Temporal - se generará el ID real
    promptVersion: "1.0",
    systemPrompt: 'crossfit_specialist' // Se cargará desde el archivo MD
  },
  FUNCIONAL_SPECIALIST: {
    key: 'FUNCIONAL_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.8,  // Balance entre creatividad y precisión para patrones funcionales
    max_output_tokens: 12000,  // 🔧 Reducido de 16384 a 12000 para mejorar velocidad
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_funcional_001',  // Temporal - se generará el ID real
    promptVersion: "1.0",
    systemPrompt: 'funcional_specialist' // Se cargará desde el archivo MD
  },
  HALTEROFILIA_SPECIALIST: {
    key: 'HALTEROFILIA_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o',  // ✅ Cambiado de gpt-4o-mini a gpt-4o para mejor comprensión de progresiones técnicas
    temperature: 0.7,  // Precisión técnica alta para levantamientos olímpicos
    max_output_tokens: 16384,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_halterofilia_001',  // Temporal - se generará el ID real
    promptVersion: "1.0",
    systemPrompt: 'halterofilia_specialist' // Se cargará desde el archivo MD
  },
  CASA_SPECIALIST: {
    key: 'CASA_SPECIALIST',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    temperature: 0.8,  // Creatividad alta para adaptaciones con objetos domésticos
    max_output_tokens: 16384,
    top_p: 1.0,
    store: true,
    promptId: 'pmpt_casa_001',
    promptVersion: "1.0",
    systemPrompt: 'casa_specialist'
  }
};

export function getModuleConfig(moduleKey) {
  return AI_MODULES[moduleKey];
}
