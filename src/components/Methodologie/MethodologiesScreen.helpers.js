/**
 * Helpers puros y estado inicial de MethodologiesScreen.
 * Extraídos del componente para aligerarlo (sin lógica de render ni hooks).
 */

export const LOCAL_STATE_INITIAL = {
  selectionMode: 'auto', // Cambiar de 'automatico' a 'auto' para coincidir con validación
  pendingMethodology: null,
  detailsMethod: {}, // Cambiar de null a objeto vacío para evitar warnings
  activeTrainingInfo: null,
  versionSelectionData: null,
  showWeekendWarning: false,
  weekendGenerationData: null,
  pendingSessionData: null,
  showWarmupModal: false,
  showRoutineSessionModal: false,
  // 🆕 Estados para modales de inicio
  showStartDayModal: false,
  showDistributionModal: false,
  startConfig: null,
  distributionConfig: null,
  // 🆕 Flujos específicos HipertrofiaV2 en fin de semana
  showHpv2WeekendModal: false,
  showHpv2FocusModal: false,
  pendingLevel: null,
  pendingFocusGroup: null,
  isGeneratingSingleDay: false
};

/** Formatea una fecha local como YYYY-MM-DD (sin desfase de zona horaria). */
export const formatLocalDate = (date) => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Nombre del día (0=Domingo … 6=Sábado). */
export const getDayName = (dayOfWeek) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayOfWeek];
};
