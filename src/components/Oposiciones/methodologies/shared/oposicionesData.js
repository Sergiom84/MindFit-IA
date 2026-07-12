/**
 * Configuración de datos por oposición (Guardia Civil, Policía Nacional,
 * Policía Local) para la card genérica OposicionManualCard.
 *
 * Las pruebas oficiales y baremos están alineados con los catálogos sembrados
 * en app."Ejercicios_<Oposicion>" (baremos orientativos según fuente oficial;
 * cada convocatoria fija los suyos — ver NOTA_BAREMOS).
 */

const NOTA_GENERICA =
  'Marcas orientativas basadas en la convocatoria de referencia indicada; ' +
  'cada convocatoria fija sus propias pruebas y marcas. Consulta siempre las ' +
  'bases oficiales de tu convocatoria (BOE / BOP / boletín autonómico).';

export const OPOSICIONES_DATA = {
  'guardia-civil': {
    id: 'guardia-civil',
    methodology: 'guardia-civil',
    label: 'Guardia Civil',
    color: 'green',
    notaBaremos:
      'Baremos de referencia: Escala de Cabos y Guardias (Orden PCM/286/2023, tramo <35 años). ' +
      NOTA_GENERICA,
    pruebas: [
      { id: 'carrera_2000m', nombre: 'Carrera 2000 m lisos', categoria: 'Resistencia', baremo_hombres: '≤ 9:25 min', baremo_mujeres: '≤ 11:14 min' },
      { id: 'circuito_agilidad', nombre: 'Circuito de agilidad y coordinación', categoria: 'Agilidad', baremo_hombres: '≤ 14,0 s', baremo_mujeres: '≤ 16,0 s' },
      { id: 'extensiones_brazos', nombre: 'Extensiones de brazos (flexiones)', categoria: 'Fuerza', baremo_hombres: '≥ 16 rep', baremo_mujeres: '≥ 11 rep' },
      { id: 'natacion_50m', nombre: 'Natación 50 m estilo libre', categoria: 'Natación', baremo_hombres: '≤ 1:10 min', baremo_mujeres: '≤ 1:21 min' }
    ]
  },
  'policia-nacional': {
    id: 'policia-nacional',
    methodology: 'policia-nacional',
    label: 'Policía Nacional',
    color: 'blue',
    notaBaremos:
      'Baremos de referencia: Escala Básica (convocatorias 2023-2025). ' + NOTA_GENERICA,
    pruebas: [
      { id: 'circuito_agilidad', nombre: 'Circuito de agilidad', categoria: 'Agilidad', baremo_hombres: 'Apto ~10,5 s · elim. > 11,7 s', baremo_mujeres: 'Apto ~11,6 s · elim. > 12,8 s' },
      { id: 'dominadas', nombre: 'Dominadas máximas (Hombres)', categoria: 'Fuerza', baremo_hombres: 'Apto 10-11 · 10 pts 17', baremo_mujeres: 'N/A' },
      { id: 'suspension_barra', nombre: 'Suspensión en barra (Mujeres)', categoria: 'Fuerza', baremo_hombres: 'N/A', baremo_mujeres: 'Apto 57-62 s · 10 pts ≥95 s' },
      { id: 'carrera_1000m', nombre: 'Carrera 1000 m', categoria: 'Carrera', baremo_hombres: "Apto 4'09\"-4'01\" · 10 pts ≤2'54\"", baremo_mujeres: "Apto 4'18\"-4'10\" · 10 pts ≤3'24\"" }
    ]
  },
  'policia-local': {
    id: 'policia-local',
    methodology: 'policia-local',
    label: 'Policía Local',
    color: 'purple',
    notaBaremos:
      'Baremos de referencia: Policía Local de Andalucía (Orden 22-dic-2003, tramo 18-24). ' +
      'Las pruebas varían mucho por ayuntamiento. ' + NOTA_GENERICA,
    pruebas: [
      { id: 'velocidad_50m', nombre: 'Velocidad 50 m lisos', categoria: 'Carrera', baremo_hombres: '< 8,00 s', baremo_mujeres: '< 9,00 s' },
      { id: 'dominadas', nombre: 'Dominadas en suspensión pura (H)', categoria: 'Fuerza', baremo_hombres: '≥ 8 rep', baremo_mujeres: 'N/A' },
      { id: 'lanzamiento_balon', nombre: 'Lanzamiento balón medicinal 3 kg (M)', categoria: 'Potencia', baremo_hombres: 'N/A', baremo_mujeres: '≥ 5,50 m' },
      { id: 'salto_vertical', nombre: 'Salto vertical', categoria: 'Potencia', baremo_hombres: '≥ 48 cm', baremo_mujeres: '≥ 35 cm' },
      { id: 'carrera_1000m', nombre: 'Carrera resistencia 1000 m', categoria: 'Resistencia', baremo_hombres: '< 4:00 min', baremo_mujeres: '< 4:30 min' },
      { id: 'natacion_25m', nombre: 'Natación 25 m libre (opcional)', categoria: 'Acondicionamiento', baremo_hombres: '< 26 s', baremo_mujeres: '< 30 s' }
    ]
  }
};

export function getOposicionData(oposicionId) {
  return OPOSICIONES_DATA[oposicionId] || null;
}
