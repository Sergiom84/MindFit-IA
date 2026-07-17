import React, { useEffect, useId, useRef, createContext, useContext } from 'react';

// QA-001 (a11y): diálogo accesible. Aporta role="dialog" + aria-modal, etiquetado
// por título/descripción (aria-labelledby/aria-describedby), cierre con ESC, foco
// atrapado dentro del diálogo y restauración del foco al cerrar. Sin cambios visuales.
const DialogContext = createContext({ titleId: undefined, descId: undefined });

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const Dialog = ({ open, onOpenChange, children }) => {
  const titleId = useId();
  const descId = useId();
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Guardar el foco previo y mover el foco al primer elemento del diálogo.
    previouslyFocused.current = document.activeElement;
    const focusTimer = setTimeout(() => {
      const node = containerRef.current;
      if (!node) return;
      const first = node.querySelector(FOCUSABLE);
      (first || node).focus();
    }, 0);

    // ESC cierra; Tab queda atrapado dentro del diálogo.
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange?.(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const node = containerRef.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      document.removeEventListener('keydown', onKeyDown, true);
      clearTimeout(focusTimer);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <DialogContext.Provider value={{ titleId, descId }}>
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/50"
          aria-hidden="true"
          onClick={() => onOpenChange?.(false)}
        />
        <div ref={containerRef} className="relative z-[60]">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
};

export const DialogContent = ({ className = '', children, ...props }) => {
  const { titleId, descId } = useContext(DialogContext);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      className={`bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-xl max-w-md w-full mx-4 ${className}`}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
};

export const DialogHeader = ({ className = '', children, ...props }) => {
  return (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const DialogTitle = ({ className = '', children, ...props }) => {
  const { titleId } = useContext(DialogContext);
  return (
    <h2 id={titleId} className={`text-lg font-semibold text-white ${className}`} {...props}>
      {children}
    </h2>
  );
};

export const DialogDescription = ({ className = '', children, ...props }) => {
  const { descId } = useContext(DialogContext);
  return (
    <p id={descId} className={`text-sm text-gray-400 ${className}`} {...props}>
      {children}
    </p>
  );
};

export const DialogFooter = ({ className = '', children, ...props }) => {
  return (
    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4 ${className}`} {...props}>
      {children}
    </div>
  );
};
