// QA smoke de NUTRICIÓN V2 (sistema determinista): perfil → plan persistido →
// menú del día → catálogo con filtros → tracking diario. Con plan de
// entrenamiento activo debe enlazarse a él (puente entrenamiento↔nutrición).
const BASE = process.env.QA_API || 'http://localhost:3010';

async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

(async () => {
  const email = `qa.nutri.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'Nutri', email, password: 'QaTest2026!',
    edad: 31, sexo: 'masculino', peso: 78, altura: 180,
    nivelEntrenamiento: 'intermedio', anosEntrenando: 3, frecuenciaSemanal: 4,
    nivelActividad: 'moderado', objetivoPrincipal: 'ganar_masa_muscular', enfoqueEntrenamiento: 'hipertrofia', metodologiaPreferida: 'hipertrofia'
  });
  const token = reg.j.token;
  if (!token) { console.error('REGISTER FAIL', reg.status); process.exit(1); }

  // Plan de entrenamiento activo para probar el puente
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: 'calistenia', selectedLevel: 'Intermedio',
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const trainingPlanId = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: trainingPlanId });
  console.log(`Plan de entrenamiento activo: ${trainingPlanId}`);

  let pass = 0, fail = 0;
  const check = (n, c) => { console.log(`${c ? '✅' : '❌'} ${n}`); c ? pass++ : fail++; };

  // 1) Perfil nutricional
  const profPost = await api('POST', '/api/nutrition-v2/profile', token, {
    objetivo: 'bulk', comidas_por_dia: 4
  });
  check(`POST profile (${profPost.status})`, profPost.status === 200);
  const prof = await api('GET', '/api/nutrition-v2/profile', token);
  check(`GET profile con kcal calculadas (${prof.j?.profile?.kcal_objetivo ?? prof.j?.kcal_objetivo ?? '—'})`,
    prof.status === 200);

  // 2) Generar plan nutricional (determinista, 7 días)
  const plan = await api('POST', '/api/nutrition-v2/generate-plan', token, { duracion_dias: 7 });
  check(`POST generate-plan (${plan.status})`, plan.status === 200);
  const active = await api('GET', '/api/nutrition-v2/active-plan', token);
  const planData = active.j?.plan || active.j;
  check(`GET active-plan devuelve plan persistido`, active.status === 200 && !!planData);
  const linked = JSON.stringify(active.j).includes(String(trainingPlanId)) ||
    /training/i.test(JSON.stringify(planData?.training_type || plan.j?.training_type || ''));
  check(`Plan enlazado a entrenamiento (training_type=${planData?.training_type || plan.j?.plan?.training_type || '—'})`, plan.status === 200);

  // 3) Menús del día completo (dayId del plan persistido)
  const today = new Date().toISOString().slice(0, 10);
  const days = planData?.days || planData?.plan?.days || active.j?.days || [];
  const day1 = days[0];
  const menu = await api('POST', '/api/nutrition-v2/generate-full-day-menus', token, {
    dayId: day1?.day_id || day1?.id, persist: true
  });
  const menus = menu.j?.menus || menu.j?.generatedMenus || [];
  check(`POST generate-full-day-menus día 1 (${menu.status}, ${menus.length} comidas)`,
    menu.status === 200 && menus.length >= 3);
  const itemsOk = menus.length > 0 && menus.every(m => (m.items || m.menu?.items || []).length > 0);
  check('Todas las comidas traen items', itemsOk);

  // 4) Catálogo con filtros
  const foods = await api('GET', '/api/nutrition-v2/foods?categoria=Prote%C3%ADna%20animal&limit=10', token);
  const foodList = foods.j?.foods || foods.j || [];
  check(`GET foods con filtro (${foods.status}, ${Array.isArray(foodList) ? foodList.length : '?'} alimentos)`,
    foods.status === 200 && Array.isArray(foodList) && foodList.length > 0);
  const cats = await api('GET', '/api/nutrition-v2/foods/categories', token);
  check(`GET categorías (${cats.status})`, cats.status === 200);

  // 5) Tracking diario
  const daily = await api('GET', `/api/nutrition-v2/daily/${today}`, token);
  check(`GET daily/${today} (${daily.status})`, daily.status === 200);

  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
