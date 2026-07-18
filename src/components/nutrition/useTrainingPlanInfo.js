import { useEffect, useState } from 'react';
import tokenManager from '../../utils/tokenManager';
import { getApiBaseUrl } from '../../config/api';
import { MAX_PLAN_DAYS, MIN_PLAN_DAYS } from './nutritionPlanConfig';
import {
  buildDailyScheduleFromDates,
  buildWeeklyPreviewFromDates,
  mapMethodologyToTrainingType,
  parseLocalDate
} from './nutritionPlanHelpers';

// ARCH-001 residual: sin base URL hardcodeada; usa getApiBaseUrl() (respeta VITE_API_URL/origen).
const API_URL = getApiBaseUrl();

const INITIAL_TRAINING_PLAN_INFO = {
  loading: true,
  hasPlan: false,
  endDate: null,
  remainingDays: null,
  cappedDays: null,
  capApplied: false,
  minApplied: false,
  error: null,
  trainingSchedule: null,
  scheduleWeekStart: null,
  trainingType: null,
  previewSchedule: null
};

/**
 * Carga el plan de entrenamiento activo y su calendario para enlazar la nutrición.
 * Extraído de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.
 */
export default function useTrainingPlanInfo() {
  const [trainingPlanInfo, setTrainingPlanInfo] = useState(INITIAL_TRAINING_PLAN_INFO);

  useEffect(() => {
    let isMounted = true;
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const fetchTrainingPlanInfo = async () => {
      try {
        const token = tokenManager.getToken() || tokenManager.getToken();
        if (!token) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: false,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: null,
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: null,
              previewSchedule: null
            });
          }
          return;
        }

        const activeResponse = await fetch(`${API_URL}/api/routines/active-plan`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!activeResponse.ok) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: false,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: null,
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: null,
              previewSchedule: null
            });
          }
          return;
        }

        const activeData = await activeResponse.json();
        if (!activeData?.hasActivePlan) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: false,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: null,
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: null,
              previewSchedule: null
            });
          }
          return;
        }

        const rawMethodologyType =
          activeData?.planType ||
          activeData?.methodology_type ||
          activeData?.methodologyType ||
          activeData?.routinePlan?.methodology_type ||
          activeData?.routinePlan?.methodologyType;
        const mappedTrainingType = mapMethodologyToTrainingType(rawMethodologyType);

        const planId = activeData.planId || activeData.methodology_plan_id;
        if (!planId) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No se pudo identificar el plan activo.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        const calendarResponse = await fetch(`${API_URL}/api/routines/calendar-schedule/${planId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!calendarResponse.ok) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No se pudo leer el calendario del plan.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        const calendarData = await calendarResponse.json();
        const weeks = calendarData?.plan?.semanas || [];
        const dates = [];
        weeks.forEach((week) => {
          (week.sesiones || []).forEach((session) => {
            if (session?.fecha) {
              const dateValue = String(session.fecha).split('T')[0];
              if (dateValue) {
                dates.push(dateValue);
              }
            }
          });
        });

        if (dates.length === 0) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No hay fechas programadas en el plan.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        dates.sort();
        const lastDateRaw = dates[dates.length - 1];
        const endDate = parseLocalDate(lastDateRaw);
        if (!endDate || Number.isNaN(endDate.getTime())) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No se pudo interpretar la fecha del calendario.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((endDate.getTime() - today.getTime()) / MS_PER_DAY);
        const remainingDays = diffDays + 1;

        if (!Number.isFinite(remainingDays) || remainingDays <= 0) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate,
              remainingDays,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'El plan activo ya finalizo o no tiene fechas futuras.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        const cappedDays = Math.max(MIN_PLAN_DAYS, Math.min(MAX_PLAN_DAYS, remainingDays));
        const { schedule, startDate } = buildDailyScheduleFromDates(dates, cappedDays);
        const { schedule: previewSchedule, weekStart } = buildWeeklyPreviewFromDates(dates);

        if (isMounted) {
          setTrainingPlanInfo({
            loading: false,
            hasPlan: true,
            endDate: Number.isFinite(endDate.getTime()) ? endDate : null,
            remainingDays,
            cappedDays,
            capApplied: remainingDays > MAX_PLAN_DAYS,
            minApplied: remainingDays < MIN_PLAN_DAYS,
            error: null,
            trainingSchedule: schedule,
            scheduleWeekStart: weekStart || startDate,
            trainingType: mappedTrainingType,
            previewSchedule
          });
        }
      } catch (error) {
        if (isMounted) {
          setTrainingPlanInfo({
            loading: false,
            hasPlan: false,
            endDate: null,
            remainingDays: null,
            cappedDays: null,
            capApplied: false,
            minApplied: false,
            error: error.message,
            trainingSchedule: null,
            scheduleWeekStart: null,
            trainingType: null,
            previewSchedule: null
          });
        }
      }
    };

    fetchTrainingPlanInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  return trainingPlanInfo;
}
