import { Home, Dumbbell, Target } from 'lucide-react';

// Configuración estática de "Entrenamiento en Casa".
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de contenido.

export const equipmentTypes = [
  {
    id: 'minimo',
    title: 'Equipamiento Mínimo',
    icon: Home,
    equipment: ['Peso corporal', 'Toallas', 'Silla/Sofá', 'Pared'],
    exercises: [], // Ejercicios generados por IA según perfil
    borderColor: 'border-emerald-400/40',
    accent: 'text-emerald-300',
    accentBorder: 'border-l-2 border-l-emerald-400/40'
  },
  {
    id: 'basico',
    title: 'Equipamiento Básico',
    icon: Target,
    equipment: ['Mancuernas ajustables', 'Bandas elásticas', 'Esterilla', 'Banco/Step'],
    exercises: [], // Ejercicios generados por IA según perfil
    borderColor: 'border-blue-400/40',
    accent: 'text-blue-300',
    accentBorder: 'border-l-2 border-l-blue-400/40'
  },
  {
    id: 'avanzado',
    title: 'Equipamiento Avanzado',
    icon: Dumbbell,
    equipment: ['Barra dominadas', 'Kettlebells', 'TRX', 'Discos olímpicos'],
    exercises: [], // Ejercicios generados por IA según perfil
    borderColor: 'border-purple-400/40',
    accent: 'text-purple-300',
    accentBorder: 'border-l-2 border-l-purple-400/40'
  }
];

export const trainingTypes = [
  { id: 'funcional', title: 'Funcional' },
  { id: 'hiit', title: 'HIIT' },
  { id: 'fuerza', title: 'Fuerza' }
];

export const trainingGuides = {
  funcional: {
    title: 'Guías para FUNCIONAL',
    points: [
      'Prioriza patrones: sentadilla, bisagra de cadera, zancada, empuje, tracción, rotación/antirrotación.',
      'Incluye varios planos de movimiento y trabajo unilateral/balance.',
      'Formato circuito/EMOM: 4–6 ejercicios, 30–45 s o 8–12 reps, 30–60 s descanso.',
      'Core integrado en la mayoría de ejercicios.'
    ]
  },
  hiit: {
    title: 'Guías para HIIT',
    points: [
      'Incluye calentamiento 5–10 min y vuelta a la calma 5–10 min.',
      'Intervalos de 15 s a 4 min a alta intensidad (~RPE 8–9).',
      'Relación trabajo/descanso: 1:1 a 1:2 según nivel.',
      'Volumen de alta intensidad total 10–20 min en sesión de 20–35 min.',
      'Varía el tipo de intervalos (Tabata, EMOM, bloques 30/30, 40/20…).'
    ]
  },
  fuerza: {
    title: 'Guías para FUERZA',
    points: [
      'Prioriza multiarticulares; luego accesorios.',
      'Rangos para fuerza: ≤6 reps, 2–6 series; descanso 2–5 min.',
      'Sin 1RM, usa RPE 7–9 o cargas que permitan 3–6 reps exigentes.',
      'Accesorios a 6–12 reps, 60–90 s descanso cuando aplique.'
    ]
  }
};

export const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';
