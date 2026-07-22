import CalisteniaEffortModal from '../../../modals/CalisteniaEffortModal';
import CasaEffortModal from '../../../modals/CasaEffortModal';
import CrossFitEffortModal from '../../../modals/CrossFitEffortModal.jsx';
import FuncionalEffortModal from '../../../modals/FuncionalEffortModal.jsx';
import HalterofiliaEffortModal from '../../../modals/HalterofiliaEffortModal.jsx';
import HeavyDutyEffortModal from '../../../modals/HeavyDutyEffortModal.jsx';
import PowerliftingEffortModal from '../../../modals/PowerliftingEffortModal.jsx';

/**
 * Autorregulación común (7/7 metodologías). Un único estado `effortModal` decide
 * cuál se muestra; todos comparten onSubmit (incluye feeling) y onClose.
 * Extraído de TodayTrainingTab.jsx (ARCH-002) sin cambios de comportamiento.
 */
export default function EffortModals({ effortModal, onSubmit, onClose }) {
  return (
    <>
      <CalisteniaEffortModal
        isOpen={effortModal.method === 'calistenia' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />

      <CasaEffortModal
        isOpen={effortModal.method === 'casa' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />

      <FuncionalEffortModal
        isOpen={effortModal.method === 'funcional' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />

      <CrossFitEffortModal
        isOpen={effortModal.method === 'crossfit' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        defaultScale={effortModal.scale || 'rx'}
        wodSummary={effortModal.wodSummary}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />

      <HalterofiliaEffortModal
        isOpen={effortModal.method === 'halterofilia' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />

      <PowerliftingEffortModal
        isOpen={effortModal.method === 'powerlifting' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />

      <HeavyDutyEffortModal
        isOpen={effortModal.method === 'heavy-duty' && effortModal.show}
        isLoading={effortModal.saving}
        result={effortModal.decision}
        onSubmit={onSubmit}
        onSkip={onClose}
        onContinue={onClose}
      />
    </>
  );
}
