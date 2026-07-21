/**
 * 🔄 WorkoutContext - Reducer puro
 *
 * Extraído de WorkoutContext.jsx (ARCH-002) sin cambios de comportamiento.
 * Función pura (state, action) -> state; firma intacta.
 */

import {
  WORKOUT_ACTIONS,
  WORKOUT_VIEWS,
  SESSION_STATUS,
  PLAN_STATUS,
  initialState
} from './workoutConstants';

// =============================================================================
// 🔄 REDUCER
// =============================================================================

export function workoutReducer(state, action) {
  switch (action.type) {
    // ===============================
    // 📋 PLAN ACTIONS
    // ===============================
    case WORKOUT_ACTIONS.SET_PLAN:
      return {
        ...state,
        plan: {
          ...state.plan,
          ...action.payload,
          status: PLAN_STATUS.ACTIVE
        },
        ui: { ...state.ui, isLoading: false, error: null }
      };

    case WORKOUT_ACTIONS.UPDATE_PLAN:
      return {
        ...state,
        plan: { ...state.plan, ...action.payload }
      };

    case WORKOUT_ACTIONS.ACTIVATE_PLAN:
      return {
        ...state,
        plan: { ...state.plan, status: PLAN_STATUS.ACTIVE },
        ui: { ...state.ui, currentView: WORKOUT_VIEWS.TODAY_TRAINING }
      };

    case WORKOUT_ACTIONS.CLEAR_PLAN:
      return {
        ...state,
        plan: { ...initialState.plan },
        session: { ...initialState.session },
        ui: { ...state.ui, currentView: WORKOUT_VIEWS.METHODOLOGIES }
      };

    // ===============================
    // 🏃 SESSION ACTIONS
    // ===============================
    case WORKOUT_ACTIONS.START_SESSION:
      return {
        ...state,
        session: {
          ...state.session,
          ...action.payload,
          status: SESSION_STATUS.IN_PROGRESS,
          sessionStarted: new Date().toISOString(),
          exerciseIndex: 0,
          completedExercises: 0
        },
        ui: { ...state.ui, showSession: true }
      };

    case WORKOUT_ACTIONS.UPDATE_SESSION:
      return {
        ...state,
        session: { ...state.session, ...action.payload }
      };

    case WORKOUT_ACTIONS.UPDATE_EXERCISE: {
      const { exerciseId, progress } = action.payload;
      return {
        ...state,
        session: {
          ...state.session,
          exerciseProgress: {
            ...state.session.exerciseProgress,
            [exerciseId]: progress
          }
        }
      };
    }

    case WORKOUT_ACTIONS.COMPLETE_SESSION:
      return {
        ...state,
        session: {
          ...state.session,
          status: SESSION_STATUS.COMPLETED,
          sessionCompleted: new Date().toISOString()
        },
        ui: { ...state.ui, showSession: false, showFeedback: true }
      };

    case WORKOUT_ACTIONS.PAUSE_SESSION:
      return {
        ...state,
        session: {
          ...state.session,
          status: SESSION_STATUS.PAUSED,
          sessionPaused: new Date().toISOString()
        }
      };

    case WORKOUT_ACTIONS.END_SESSION:
      return {
        ...state,
        session: { ...initialState.session },
        ui: {
          ...state.ui,
          showSession: false,
          showFeedback: false,
          currentView: WORKOUT_VIEWS.TODAY_TRAINING
        }
      };

    // ===============================
    // 🎯 UI ACTIONS
    // ===============================
    case WORKOUT_ACTIONS.SET_VIEW:
      return {
        ...state,
        ui: { ...state.ui, currentView: action.payload }
      };

    case WORKOUT_ACTIONS.SET_LOADING:
      return {
        ...state,
        ui: { ...state.ui, isLoading: action.payload }
      };

    case WORKOUT_ACTIONS.SET_ERROR:
      return {
        ...state,
        ui: { ...state.ui, error: action.payload, isLoading: false }
      };

    case WORKOUT_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        ui: { ...state.ui, error: null }
      };

    case WORKOUT_ACTIONS.RESET_WORKOUT:
      return { ...initialState };

    // ===============================
    // 🎭 MODAL ACTIONS
    // ===============================
    case WORKOUT_ACTIONS.SHOW_MODAL: {
      const modalKey = `show${action.payload.charAt(0).toUpperCase() + action.payload.slice(1)}`;
      // Convert camelCase to proper modal names
      const mappedKey = modalKey.replace('calisteniaManual', 'CalisteniaManual')
                              .replace('heavyDutyManual', 'HeavyDutyManual')
                              .replace('hipertrofiaManual', 'HipertrofiaManual')
                              .replace('powerliftingManual', 'PowerliftingManual')
                              .replace('crossfitManual', 'CrossFitManual')
                              .replace('CrossfitManual', 'CrossFitManual')
                              .replace('funcionalManual', 'FuncionalManual')
                              .replace('halterofíliaManual', 'HalterofíliaManual')
                              .replace('casaManual', 'CasaManual')
                              .replace('planConfirmation', 'PlanConfirmation')
                              .replace('routineSession', 'RoutineSession')
                              .replace('versionSelection', 'VersionSelection')
                              .replace('methodologyDetails', 'MethodologyDetails')
                              .replace('activeTrainingWarning', 'ActiveTrainingWarning')
                              .replace('activePlanWarning', 'ActivePlanWarning');

      return {
        ...state,
        ui: {
          ...state.ui,
          [mappedKey]: true
        }
      };
    }

    case WORKOUT_ACTIONS.HIDE_MODAL: {
      const modalKey = `show${action.payload.charAt(0).toUpperCase() + action.payload.slice(1)}`;
      // Convert camelCase to proper modal names
      const mappedKey = modalKey.replace('calisteniaManual', 'CalisteniaManual')
                              .replace('heavyDutyManual', 'HeavyDutyManual')
                              .replace('hipertrofiaManual', 'HipertrofiaManual')
                              .replace('powerliftingManual', 'PowerliftingManual')
                              .replace('crossfitManual', 'CrossFitManual')
                              .replace('CrossfitManual', 'CrossFitManual')
                              .replace('funcionalManual', 'FuncionalManual')
                              .replace('halterofíliaManual', 'HalterofíliaManual')
                              .replace('casaManual', 'CasaManual')
                              .replace('planConfirmation', 'PlanConfirmation')
                              .replace('routineSession', 'RoutineSession')
                              .replace('versionSelection', 'VersionSelection')
                              .replace('methodologyDetails', 'MethodologyDetails')
                              .replace('activeTrainingWarning', 'ActiveTrainingWarning')
                              .replace('activePlanWarning', 'ActivePlanWarning');

      return {
        ...state,
        ui: {
          ...state.ui,
          [mappedKey]: false
        }
      };
    }

    case WORKOUT_ACTIONS.HIDE_ALL_MODALS:
      return {
        ...state,
        ui: {
          ...state.ui,
          showWarmup: false,
          showSession: false,
          showFeedback: false,
          showConfirmation: false,
          showPlanConfirmation: false,
          showRoutineSession: false,
          showVersionSelection: false,
          showMethodologyDetails: false,
          showActiveTrainingWarning: false,
          showActivePlanWarning: false,
          showCalisteniaManual: false,
          showHeavyDutyManual: false,
          showHipertrofiaManual: false,
          showPowerliftingManual: false,
          showCrossFitManual: false,
          showFuncionalManual: false,
          showHalterofíliaManual: false,
          showCasaManual: false,
          showReEvaluation: false
        }
      };

    // ===============================
    // 📊 RE-EVALUATION ACTIONS
    // ===============================
    case WORKOUT_ACTIONS.SET_RE_EVALUATION_TRIGGER:
      return {
        ...state,
        reEvaluation: {
          ...state.reEvaluation,
          ...action.payload
        },
        ui: {
          ...state.ui,
          showReEvaluation: action.payload.shouldTrigger || false
        }
      };

    case WORKOUT_ACTIONS.CLEAR_RE_EVALUATION:
      return {
        ...state,
        reEvaluation: { ...initialState.reEvaluation },
        ui: { ...state.ui, showReEvaluation: false }
      };

    default:
      return state;
  }
}
