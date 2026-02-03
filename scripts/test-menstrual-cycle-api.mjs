/**
 * Integracion API ciclo menstrual v3.
 * Ejecutar con: node scripts/test-menstrual-cycle-api.mjs
 */

const API_URL = process.env.API_URL || 'http://localhost:3010';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const ALLOW_CREATE_CONFIG = process.env.ALLOW_MENSTRUAL_TEST_WRITES === '1';
const ALLOW_CREATE_LOG = process.env.ALLOW_MENSTRUAL_TEST_WRITES === '1';

if (!AUTH_TOKEN) {
  console.error('❌ AUTH_TOKEN no definido.');
  process.exit(1);
}

const request = async (path, { method = 'GET', body } = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // ignore
  }

  return { response, data };
};

const toDateString = (date) => date.toISOString().split('T')[0];

const pickConfigPayload = (config = {}) => ({
  cycle_length: config.cycle_length ?? config.cycle_length_days ?? 28,
  period_length: config.period_length ?? config.bleed_length_days ?? 5,
  is_regular: config.is_regular ?? true,
  uses_hormonal_contraceptives: config.uses_hormonal_contraceptives ?? false,
  last_period_start: config.last_period_start ?? config.last_bleed_start_date ?? null,
  tracking_enabled: config.tracking_enabled ?? true,
  contraception_type: config.contraception_type ?? 'none',
  last_bleed_start_date: config.last_bleed_start_date ?? config.last_period_start ?? null,
  bleed_length_days: config.bleed_length_days ?? config.period_length ?? 5,
  cycle_length_days: config.cycle_length_days ?? config.cycle_length ?? 28,
  luteal_length_days: config.luteal_length_days ?? 14,
  joint_laxity_risk: config.joint_laxity_risk ?? false
});

const pickLogPayload = (log = {}, logDate) => ({
  log_date: logDate,
  is_period_day: log.is_period_day ?? false,
  energy_level: log.energy_level ?? null,
  pain_level: log.pain_level ?? null,
  sleep_quality: log.sleep_quality ?? null,
  mood: log.mood ?? null,
  bloating: log.bloating ?? null,
  notes: log.notes ?? null,
  pain_0_3: log.pain_0_3 ?? null,
  fatigue_0_3: log.fatigue_0_3 ?? null,
  sleep_0_3: log.sleep_0_3 ?? null,
  stress_0_3: log.stress_0_3 ?? null,
  pain_next_day_0_10: log.pain_next_day_0_10 ?? null,
  session_quality_0_10: log.session_quality_0_10 ?? null
});

const assertOk = (condition, message) => {
  if (!condition) throw new Error(message);
};

const main = async () => {
  console.log('🔎 Test API ciclo menstrual v3');

  const today = toDateString(new Date());
  const tenDaysAgo = toDateString(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));

  console.log('1) Cargando config actual...');
  const configResponse = await request('/api/menstrual-cycle/config');
  assertOk(configResponse.response.ok, 'No se pudo obtener config');
  const originalConfig = configResponse.data?.config || null;

  if (!originalConfig && !ALLOW_CREATE_CONFIG) {
    throw new Error('No existe config y ALLOW_MENSTRUAL_TEST_WRITES no esta habilitado.');
  }

  const testConfig = pickConfigPayload({
    ...originalConfig,
    cycle_length: 28,
    period_length: 5,
    last_period_start: tenDaysAgo,
    contraception_type: 'none',
    cycle_confidence: 'low',
    last_bleed_start_date: tenDaysAgo,
    bleed_length_days: 5,
    cycle_length_days: 28,
    luteal_length_days: 14,
    tracking_enabled: true
  });

  console.log('2) Guardando config de prueba...');
  const configSave = await request('/api/menstrual-cycle/config', {
    method: 'POST',
    body: testConfig
  });
  assertOk(configSave.response.ok && configSave.data?.success, 'No se pudo guardar config de prueba');

  console.log('3) Verificando log de hoy...');
  const logFetch = await request(`/api/menstrual-cycle/log/${today}`);
  assertOk(logFetch.response.ok, 'No se pudo obtener log de hoy');
  const originalLog = logFetch.data?.log || null;

  if (!originalLog && !ALLOW_CREATE_LOG) {
    console.log('⚠️ No existe log de hoy. Se omite escritura de log (ALLOW_MENSTRUAL_TEST_WRITES=1 para habilitar).');
  }

  if (originalLog || ALLOW_CREATE_LOG) {
    console.log('4) Guardando log de prueba...');
    const logPayload = pickLogPayload({
      pain_0_3: 2,
      fatigue_0_3: 1,
      sleep_0_3: 1,
      stress_0_3: 0,
      notes: 'test-menstrual-cycle-api'
    }, today);

    const logSave = await request('/api/menstrual-cycle/log', {
      method: 'POST',
      body: logPayload
    });
    assertOk(logSave.response.ok && logSave.data?.success, 'No se pudo guardar log de prueba');
  }

  console.log('5) Llamando training-adjustment...');
  const adjustment = await request('/api/menstrual-cycle/training-adjustment');
  assertOk(adjustment.response.ok && adjustment.data?.hasConfig, 'training-adjustment fallo');
  assertOk(adjustment.data.adjustment?.multipliers, 'No retorna multipliers');
  assertOk(Number.isFinite(adjustment.data.adjustment?.rest_extra_seconds), 'No retorna rest_extra_seconds');

  console.log('6) Restaurando config...');
  if (originalConfig) {
    const restoreConfig = await request('/api/menstrual-cycle/config', {
      method: 'POST',
      body: pickConfigPayload(originalConfig)
    });
    assertOk(restoreConfig.response.ok, 'No se pudo restaurar config');
  }

  if (originalLog) {
    console.log('7) Restaurando log original...');
    const restoreLog = await request('/api/menstrual-cycle/log', {
      method: 'POST',
      body: pickLogPayload(originalLog, today)
    });
    assertOk(restoreLog.response.ok, 'No se pudo restaurar log');
  }

  console.log('✅ Test API completado.');
};

main().catch(error => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
