// Genera planes Calistenia manual para Elena (intermedio, muñeca) y Diego (avanzado, codo)
// y analiza estructura + filtro de lesiones.
const BASE = 'http://localhost:3010';

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

const USERS = [
  { email: 'elena.calis.1782892677674@test.entrenaconia.local', level: 'intermedio', injury: 'muñeca', banned: /flexi[oó]n|plancha|pino|handstand|fondo|dip|pike|push.?up|apoyo/i },
  { email: 'diego.calis.1782892677674@test.entrenaconia.local', level: 'avanzado', injury: 'codo', banned: /dominada|pull.?up|muscle.?up|fondo|dip|tr[ií]ceps|francesa|pushdown/i }
];

(async () => {
  for (const u of USERS) {
    console.log(`\n===== ${u.email.split('.')[0].toUpperCase()} (${u.level}, lesión ${u.injury}) =====`);
    const login = await api('POST', '/api/auth/login', null, { email: u.email, password: 'QaTest1234!' });
    const token = login.j.token;
    if (!token) { console.log('LOGIN FAIL', JSON.stringify(login.j).slice(0, 150)); continue; }

    const gen = await api('POST', '/api/methodology/generate', token, {
      mode: 'manual',
      methodology: 'calistenia',
      selectedLevel: u.level,
      goals: '',
      selectedMuscleGroups: [],
      source: 'manual_selection',
      version: '5.0'
    });
    if (gen.status !== 200) { console.log('GEN FAIL', gen.status, JSON.stringify(gen.j).slice(0, 250)); continue; }
    const plan = gen.j.plan || gen.j.routinePlan || gen.j.data?.plan || gen.j;
    const semanas = plan.semanas || plan.plan?.semanas || [];
    console.log('nivel:', plan.nivel, '| semanas:', semanas.length, '| planId:', gen.j.methodology_plan_id || gen.j.planId || '?');
    if (semanas.length) {
      const s1 = semanas[0].sesiones || [];
      console.log('sesiones/semana:', s1.length);
      const all = new Set();
      for (const sem of semanas) for (const ses of (sem.sesiones || [])) for (const ex of (ses.ejercicios || [])) all.add(ex.nombre);
      const names = [...all];
      console.log('ejercicios únicos:', names.length);
      console.log(names.join(' | '));
      const bad = names.filter(n => u.banned.test(n));
      console.log(bad.length ? `⛔ POSIBLES CONTRAINDICADOS: ${bad.join(', ')}` : '✅ Sin ejercicios contraindicados según patrón');
    }
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
