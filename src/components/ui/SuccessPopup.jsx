import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, X } from 'lucide-react';

const SuccessPopup = ({ show, message, title = "¡Éxito!", onClose, onContinue }) => {
  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-[#0d1522] rounded-xl p-6 max-w-md w-full border border-yellow-400/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-600/20 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-yellow-400/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-300" />
                </button>
              </div>

              {/* Content */}
              <div className="mb-6">
                <p className="text-gray-300">{message}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                {onContinue && (
                  <button
                    onClick={onContinue}
                    className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-[#0b1220] rounded-lg transition-colors font-semibold"
                  >
                    Continuar
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-semibold"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SuccessPopup;
