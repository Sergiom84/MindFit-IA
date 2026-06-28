/**
 * Evaluación de progreso de composición corporal (volumen / definición / mantenimiento).
 * Concern independiente del motor de generación de menús.
 */

function evaluateVolume(base, latest) {
  const weightGain = latest.weight - base.weight;
  const waistGain = latest.waist - base.waist;
  if (weightGain <= 0 || !isFinite(weightGain)) {
    return { status: 'observacion', indicator: null, interpretation: 'Sin ganancia de peso en la ventana', action: 'Registrar otra medición y reevaluar', needsConfirmation: true };
  }
  const icg = waistGain / weightGain;
  if (icg >= 1.5) {
    return { status: 'rojo', indicator: icg, interpretation: 'Ganancia de grasa excesiva', action: 'Pasar a normocalórica o definición 2-4 semanas', needsConfirmation: true };
  }
  if (icg >= 1.0) {
    return { status: 'amarillo', indicator: icg, interpretation: 'Volumen descontrolado', action: 'Reducir superávit 150-250 kcal/día', needsConfirmation: true };
  }
  if (icg >= 0.8) {
    return { status: 'verde', indicator: icg, interpretation: 'Volumen correcto', action: 'Mantener estrategia', needsConfirmation: false };
  }
  return { status: 'verde_plus', indicator: icg, interpretation: 'Volumen muy eficiente', action: 'Mantener o subir carga de entreno', needsConfirmation: false };
}

function evaluateDefinition(base, latest) {
  const weightLoss = base.weight - latest.weight;
  const waistLoss = base.waist - latest.waist;
  if (weightLoss <= 0 || !isFinite(weightLoss)) {
    return { status: 'observacion', indicator: null, interpretation: 'Sin pérdida de peso en la ventana', action: 'Registrar otra medición y reevaluar', needsConfirmation: true };
  }
  const ipg = waistLoss / weightLoss;
  if (ipg < 0.6) {
    return { status: 'rojo', indicator: ipg, interpretation: 'Riesgo de pérdida muscular', action: 'Subir kcal +150-250 o diet break', needsConfirmation: true };
  }
  if (ipg < 0.8) {
    return { status: 'amarillo', indicator: ipg, interpretation: 'Déficit agresivo', action: 'Mantener 7-14 días y reevaluar', needsConfirmation: true };
  }
  if (ipg < 1.2) {
    return { status: 'verde', indicator: ipg, interpretation: 'Definición eficiente', action: 'Mantener', needsConfirmation: false };
  }
  return { status: 'verde_plus', indicator: ipg, interpretation: 'Muy buena pérdida de grasa', action: 'Mantener o microajuste', needsConfirmation: false };
}

function evaluateMaintenance(base, latest) {
  const weightDiff = latest.weight - base.weight;
  const waistDiff = latest.waist - base.waist;
  const absW = Math.abs(weightDiff);
  const absC = Math.abs(waistDiff);

  // IEC según documento
  if (weightDiff >= 1 && waistDiff >= 1) {
    return { status: 'rojo', indicator: weightDiff, interpretation: 'Superávit no deseado', action: 'Reducir kcal 150/día', needsConfirmation: true };
  }
  if (absW <= 0.5) {
    return { status: 'amarillo', indicator: weightDiff, interpretation: 'Oscilación normal', action: 'Mantener y observar (confirmación 2.1)', needsConfirmation: true };
  }
  if (absW <= 0.3 && waistDiff < 0) {
    return { status: 'verde', indicator: weightDiff, interpretation: 'Recomp positiva', action: 'Mantener', needsConfirmation: false };
  }
  if (absW <= 0.2 && waistDiff <= -0.2) {
    return { status: 'verde_plus', indicator: weightDiff, interpretation: 'Recomp ideal', action: 'Mantener o micro superávit', needsConfirmation: false };
  }
  return { status: 'amarillo', indicator: weightDiff, interpretation: 'Variación leve', action: 'Observar y repetir medición', needsConfirmation: true };
}

export { evaluateVolume, evaluateDefinition, evaluateMaintenance };
