/**
 * MethodologyDetailsDialog - Arquitectura Modular Profesional v2.0
 * Modal avanzado para mostrar información completa de metodologías
 * Refactorizado con patrones arquitecturales consistentes y componentes modulares
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 2.0.0 - Professional Standards & Modular Components
 */

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Play } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';

import { useTrace } from '@/contexts/TraceContext.jsx';

// Configuraciones centralizadas
const DIALOG_CONFIG = {
  DIMENSIONS: {
    MAX_WIDTH: 'max-w-6xl',
    MAX_HEIGHT: 'max-h-[90vh]',
    GRID_COLS: 4
  },
  THEME: {
    PRIMARY: 'yellow-400',
    SUCCESS: 'green-400',
    INFO: 'blue-400',
    BACKGROUND: {
      DIALOG: 'black/95',
      CARD: 'gray-800/50',
      TABS: 'gray-800'
    },
    BORDER: {
      PRIMARY: 'yellow-400/20',
      DASHED: 'gray-600',
      DIVIDER: 'gray-700'
    },
    TEXT: {
      PRIMARY: 'white',
      SECONDARY: 'gray-300',
      MUTED: 'gray-400'
    }
  },
  CONTENT: {
    TABS: [
      { value: 'principles', label: 'Principios', icon: '•' },
      { value: 'benefits', label: 'Beneficios', icon: '✓' },
      { value: 'target', label: 'Dirigido a', icon: null },
      { value: 'science', label: 'Ciencia', icon: null }
    ]
  }
};

// Utilidades de validación y helpers
const DialogUtils = {
  validateProps({ detailsMethod, selectionMode, onClose, onSelect }) {
    const warnings = [];

    if (!detailsMethod || typeof detailsMethod !== 'object') {
      warnings.push('detailsMethod is not a valid object');
    }

    if (!['manual', 'auto', undefined].includes(selectionMode)) {
      warnings.push('selectionMode should be "manual", "auto", or undefined');
    }

    if (typeof onClose !== 'function') {
      warnings.push('onClose should be a function');
    }

    if (typeof onSelect !== 'function') {
      warnings.push('onSelect should be a function');
    }

    if (warnings.length > 0 && import.meta.env.DEV) {
      console.warn('[MethodologyDetailsDialog] Validation warnings:', warnings);
    }

    return warnings.length === 0;
  },

  sanitizeProps(props) {
    return {
      open: Boolean(props.open),
      onOpenChange: typeof props.onOpenChange === 'function' ? props.onOpenChange : () => {},
      detailsMethod: props.detailsMethod || null,
      selectionMode: props.selectionMode || 'auto',
      onClose: typeof props.onClose === 'function' ? props.onClose : () => {},
      onSelect: typeof props.onSelect === 'function' ? props.onSelect : () => {}
    };
  },

  getSelectButtonStyles(selectionMode) {
    return selectionMode === 'manual'
      ? `bg-${DIALOG_CONFIG.THEME.PRIMARY} text-black hover:bg-yellow-300`
      : 'bg-gray-700 text-gray-400 cursor-not-allowed';
  }
};

// Hook personalizado para listas genéricas
const useListRenderer = () => {
  const renderList = (items, icon, emptyMessage) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return (
        <li className={`text-${DIALOG_CONFIG.THEME.TEXT.MUTED} text-sm`}>
          {emptyMessage || 'No hay información disponible'}
        </li>
      );
    }

    return items.map((item, idx) => (
      <li key={idx} className={`text-${DIALOG_CONFIG.THEME.TEXT.SECONDARY} text-sm flex items-start`}>
        <span className={`text-${icon === '✓' ? DIALOG_CONFIG.THEME.SUCCESS : DIALOG_CONFIG.THEME.PRIMARY} mr-2`}>
          {icon}
        </span>
        {item}
      </li>
    ));
  };

  return { renderList };
};

export default function MethodologyDetailsDialog(props) {
  // Sanitizar y validar props
  const { open, onOpenChange, detailsMethod, selectionMode, onClose, onSelect } = DialogUtils.sanitizeProps(props);

  DialogUtils.validateProps({ detailsMethod, selectionMode, onClose, onSelect });

  const { track } = useTrace();
  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (prevOpenRef.current !== open) {
      track(open ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: 'MethodologyDetailsDialog', method: detailsMethod?.name }, { component: 'MethodologyDetailsDialog' });
      prevOpenRef.current = open;
    }
  }, [open, detailsMethod?.name]);

  const { renderList } = useListRenderer();

  // Componentes modulares internos
  const DialogHeaderSection = () => (
    <DialogHeader>
      <DialogTitle className={`text-2xl font-bold flex items-center text-${DIALOG_CONFIG.THEME.TEXT.PRIMARY}`}>
        {detailsMethod?.icon && React.createElement(detailsMethod.icon, {
          className: `w-6 h-6 mr-3 text-${DIALOG_CONFIG.THEME.PRIMARY}`
        })}
        {detailsMethod?.displayName || detailsMethod?.name || 'Detalles'}
      </DialogTitle>
      <DialogDescription className={`text-${DIALOG_CONFIG.THEME.TEXT.MUTED}`}>
        Información completa de la metodología seleccionada.
      </DialogDescription>
    </DialogHeader>
  );

  const DetailedDescriptionSection = () => {
    if (!detailsMethod?.detailedDescription) return null;

    return (
      <div className={`p-4 bg-${DIALOG_CONFIG.THEME.BACKGROUND.CARD} rounded-lg`}>
        <h4 className={`text-${DIALOG_CONFIG.THEME.PRIMARY} font-semibold mb-2`}>
          Descripción Completa
        </h4>
        <p className={`text-${DIALOG_CONFIG.THEME.TEXT.SECONDARY} text-sm leading-relaxed`}>
          {detailsMethod.detailedDescription}
        </p>
      </div>
    );
  };

  const VideoPlaceholderSection = () => {
    if (!detailsMethod?.videoPlaceholder) return null;

    return (
      <div className={`p-6 bg-${DIALOG_CONFIG.THEME.BACKGROUND.CARD} rounded-lg border-2 border-dashed border-${DIALOG_CONFIG.THEME.BORDER.DASHED} text-center`}>
        <Play className={`w-12 h-12 text-${DIALOG_CONFIG.THEME.PRIMARY} mx-auto mb-3`} />
        <h4 className={`text-${DIALOG_CONFIG.THEME.TEXT.PRIMARY} font-semibold mb-2`}>
          Video Explicativo
        </h4>
        <p className={`text-${DIALOG_CONFIG.THEME.TEXT.MUTED} text-sm`}>
          Próximamente: Video detallado sobre la metodología {detailsMethod.displayName || detailsMethod.name}
        </p>
      </div>
    );
  };

  const TabPrinciples = () => (
    <TabsContent value="principles" className="mt-4">
      <h4 className={`text-${DIALOG_CONFIG.THEME.PRIMARY} font-semibold mb-2`}>
        Principios Fundamentales
      </h4>
      <ul className="space-y-1">
        {renderList(detailsMethod?.principles, '•', 'No hay principios disponibles')}
      </ul>
    </TabsContent>
  );

  const TabBenefits = () => (
    <TabsContent value="benefits" className="mt-4">
      <h4 className={`text-${DIALOG_CONFIG.THEME.PRIMARY} font-semibold mb-2`}>
        Beneficios Principales
      </h4>
      <ul className="space-y-1">
        {renderList(detailsMethod?.benefits, '✓', 'No hay beneficios disponibles')}
      </ul>
    </TabsContent>
  );

  const TabTarget = () => (
    <TabsContent value="target" className="mt-4">
      <h4 className={`text-${DIALOG_CONFIG.THEME.PRIMARY} font-semibold mb-2`}>
        Público Objetivo
      </h4>
      <p className={`text-${DIALOG_CONFIG.THEME.TEXT.SECONDARY} text-sm`}>
        {detailsMethod?.targetAudience || 'No especificado'}
      </p>
      <div className="grid grid-cols-2 gap-4 mt-4">
        {[
          { label: 'Duración por sesión:', value: detailsMethod?.duration || 'No especificado' },
          { label: 'Duración del programa:', value: detailsMethod?.programDuration || 'No especificado' },
          { label: 'Frecuencia:', value: detailsMethod?.frequency || 'No especificado' },
          { label: 'Compatible con casa:', value: detailsMethod?.homeCompatible ? 'Sí' : 'No' }
        ].map(({ label, value }) => (
          <div key={label}>
            <span className={`text-${DIALOG_CONFIG.THEME.TEXT.MUTED} text-xs`}>{label}</span>
            <p className={`text-${DIALOG_CONFIG.THEME.TEXT.PRIMARY} text-sm`}>{value}</p>
          </div>
        ))}
      </div>
    </TabsContent>
  );

  const TabScience = () => (
    <TabsContent value="science" className="mt-4">
      <h4 className={`text-${DIALOG_CONFIG.THEME.PRIMARY} font-semibold mb-2`}>
        Base Científica
      </h4>
      <p className={`text-${DIALOG_CONFIG.THEME.TEXT.SECONDARY} text-sm`}>
        {detailsMethod?.scientificBasis || 'No especificado'}
      </p>
    </TabsContent>
  );

  const DialogFooterSection = () => (
    <DialogFooter className={`flex justify-between items-center mt-6 pt-4 border-t border-${DIALOG_CONFIG.THEME.BORDER.DIVIDER}`}>
      <div className="flex items-center space-x-2">
        <span className={`px-2 py-1 bg-${DIALOG_CONFIG.THEME.PRIMARY}/20 text-${DIALOG_CONFIG.THEME.PRIMARY} text-xs rounded`}>
          {detailsMethod?.focus || 'General'}
        </span>
        <span className={`px-2 py-1 bg-${DIALOG_CONFIG.THEME.INFO}/20 text-${DIALOG_CONFIG.THEME.INFO} text-xs rounded`}>
          {detailsMethod?.level || 'Todos los niveles'}
        </span>
      </div>
      <div className="flex space-x-2">
        <Button variant="outline" onClick={() => { track('BUTTON_CLICK', { id: 'close' }, { component: 'MethodologyDetailsDialog' }); onClose(); }}>
          Cerrar
        </Button>
        <Button
          className={DialogUtils.getSelectButtonStyles(selectionMode)}
          disabled={selectionMode !== 'manual'}
          onClick={() => {
            if (selectionMode === 'manual' && detailsMethod) {
              track('BUTTON_CLICK', { id: 'select_methodology', name: detailsMethod?.name, mode: selectionMode }, { component: 'MethodologyDetailsDialog' });
              onClose();
              onSelect(detailsMethod);
            }
          }}
          aria-label={`Seleccionar metodología ${detailsMethod?.name || ''}`}
        >
          Seleccionar Metodología
        </Button>
      </div>
    </DialogFooter>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${DIALOG_CONFIG.DIMENSIONS.MAX_WIDTH} bg-${DIALOG_CONFIG.THEME.BACKGROUND.DIALOG} border-${DIALOG_CONFIG.THEME.BORDER.PRIMARY} text-${DIALOG_CONFIG.THEME.TEXT.PRIMARY} ${DIALOG_CONFIG.DIMENSIONS.MAX_HEIGHT} overflow-y-auto`}
        aria-label={`Detalles de ${detailsMethod?.name || 'metodología'}`}
      >
        <DialogHeaderSection />

        {detailsMethod && (
          <div className="space-y-6">
            <DetailedDescriptionSection />
            <VideoPlaceholderSection />

            <Tabs defaultValue="principles" className="w-full">
              <TabsList className={`grid w-full grid-cols-${DIALOG_CONFIG.DIMENSIONS.GRID_COLS} bg-${DIALOG_CONFIG.THEME.BACKGROUND.TABS}`}>
                {DIALOG_CONFIG.CONTENT.TABS.map(({ value, label }) => (
                  <TabsTrigger key={value} value={value} className="text-xs">
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabPrinciples />
              <TabBenefits />
              <TabTarget />
              <TabScience />
            </Tabs>
          </div>
        )}

        <DialogFooterSection />
      </DialogContent>
    </Dialog>
  );
}
