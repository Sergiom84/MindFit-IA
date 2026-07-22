/**
 * StartDayModal - Modal para seleccionar cuándo empezar el plan
 * 
 * Lógica según día de la semana:
 * - Lun-Mié: Empezar HOY (sin modal)
 * - Jueves: 3 opciones (Entrenar HOY, Empezar Lunes, Vinagre)
 * - Vie-Dom: 2 opciones (Empezar Lunes, Vinagre)
 * 
 * Opciones:
 * - Entrenar HOY (solo Jueves): Jue=D1, Vie=D2, Sáb=D3, Lun=D4, Mar=D5, Mié=D1...
 * - Empezar el Lunes: Primer D1 el próximo lunes
 * - Vinagre: Entrena hoy (sesión suelta) y empieza formalmente el lunes
 */

import React from 'react';
import { Calendar, Dumbbell, Zap, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Mapeo de días en español
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Calcula el próximo lunes desde una fecha dada
 */
function getNextMonday(date) {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

/**
 * Formatea fecha como DD/MM/YYYY
 */
function formatDate(date) {
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function StartDayModal({ isOpen, onClose, onSelect, methodology = 'HipertrofiaV2' }) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Dom, 1=Lun, ... 4=Jue, 5=Vie, 6=Sáb
  const dayName = DAY_NAMES[dayOfWeek];
  const isThursday = dayOfWeek === 4;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isFriday = dayOfWeek === 5;
  const nextMonday = getNextMonday(today);

  // Opciones disponibles según el día
  const showTrainToday = isThursday; // Solo jueves puede entrenar hoy con sábado incluido
  const showVinagre = isThursday || isFriday || isWeekend;

  const handleTrainToday = () => {
    // Jueves = D1, Viernes = D2, Sábado = D3, Lunes = D4, Martes = D5, Miércoles = D1...
    onSelect({
      option: 'train_today',
      startDate: today.toISOString().split('T')[0],
      includeSaturday: true,
      distributionOption: 'thursdays_special',
      description: 'Calendario especial: Jue→D1, Vie→D2, Sáb→D3, Lun→D4, Mar→D5'
    });
    onClose();
  };

  const handleStartMonday = () => {
    onSelect({
      option: 'start_monday',
      startDate: nextMonday.toISOString().split('T')[0],
      includeSaturday: false,
      distributionOption: 'standard',
      description: `Empezar el ${formatDate(nextMonday)} (Lun=D1, Mar=D2...)`
    });
    onClose();
  };

  const handleVinagre = () => {
    onSelect({
      option: 'vinagre',
      startDate: nextMonday.toISOString().split('T')[0],
      todayLooseSession: true,
      includeSaturday: false,
      distributionOption: 'vinagre',
      description: `Sesión suelta HOY + plan formal desde ${formatDate(nextMonday)}`
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Calendar className="h-6 w-6 text-orange-500" />
            🗓️ ¿Cuándo quieres empezar?
          </DialogTitle>
          <DialogDescription className="text-base">
            Hoy es <strong>{dayName.toUpperCase()}</strong>. Tu plan está diseñado para L-V.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Opción: Entrenar HOY (solo Jueves) */}
          {showTrainToday && (
            <Button
              onClick={handleTrainToday}
              variant="default"
              className="w-full h-auto py-4 flex flex-col items-start gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5" />
                <span className="font-bold text-lg">🏋️ ENTRENAR HOY</span>
              </div>
              <div className="text-sm opacity-90 text-left">
                <p>Calendario especial (incluye este sábado):</p>
                <p className="font-mono text-xs mt-1">
                  Jue→D1, Vie→D2, <strong>Sáb→D3</strong>, Lun→D4, Mar→D5, Mié→D1...
                </p>
              </div>
            </Button>
          )}

          {/* Opción: Empezar el Lunes */}
          <Button
            onClick={handleStartMonday}
            variant="outline"
            className="w-full h-auto py-4 flex flex-col items-start gap-2 border-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="font-bold text-lg">📅 EMPEZAR EL LUNES</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 text-left">
              <p>Tu primer D1 será el {formatDate(nextMonday)}</p>
              <p className="font-mono text-xs mt-1">Lun→D1, Mar→D2, Mié→D3, Jue→D4, Vie→D5</p>
            </div>
          </Button>

          {/* Opción: Vinagre (solo Jue-Dom) */}
          {showVinagre && (
            <Button
              onClick={handleVinagre}
              variant="secondary"
              className="w-full h-auto py-4 flex flex-col items-start gap-2 bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30 border-2 border-yellow-400"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-600" />
                <span className="font-bold text-lg text-yellow-700 dark:text-yellow-400">
                  🍶 VINAGRE (Ponte más fuerte)
                </span>
              </div>
              <div className="text-sm text-yellow-700 dark:text-yellow-300 text-left">
                <p>Entrena HOY (sesión suelta, sin compromiso)</p>
                <p>+ Plan formal desde el {formatDate(nextMonday)}</p>
              </div>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

