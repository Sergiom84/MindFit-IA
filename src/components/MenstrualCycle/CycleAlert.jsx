import { motion } from 'framer-motion';
import { AlertCircle, Info, Droplet, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Componente de alerta de ciclo para pantallas de entrenamiento
 * Muestra recomendaciones basadas en el estado actual del ciclo
 */
const CycleAlert = ({ alert, onDismiss, compact = false }) => {
  const [dismissed, setDismissed] = useState(false);

  if (!alert || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const getAlertStyles = () => {
    switch (alert.type) {
      case 'warning':
        return {
          bg: 'bg-orange-900/30',
          border: 'border-orange-500/30',
          icon: AlertCircle,
          iconColor: 'text-orange-400'
        };
      case 'info':
      default:
        return {
          bg: 'bg-pink-900/20',
          border: 'border-pink-500/20',
          icon: Info,
          iconColor: 'text-pink-400'
        };
    }
  };

  const styles = getAlertStyles();
  const Icon = styles.icon;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${styles.bg} ${styles.border} border`}
      >
        <Droplet className={`w-4 h-4 ${styles.iconColor}`} />
        <span className="text-xs text-gray-300 flex-1">{alert.message}</span>
        <button 
          onClick={handleDismiss}
          className="p-0.5 hover:bg-white/10 rounded"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-xl p-4 ${styles.bg} ${styles.border} border`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-black/30`}>
          <Icon className={`w-5 h-5 ${styles.iconColor}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider text-pink-400">
              Ajuste del Ciclo
            </span>
          </div>
          <p className="text-sm text-gray-300">{alert.message}</p>
        </div>
        <button 
          onClick={handleDismiss}
          className="p-1 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </motion.div>
  );
};

export default CycleAlert;
