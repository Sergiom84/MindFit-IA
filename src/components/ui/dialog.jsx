import React, { useEffect } from 'react';

export const Dialog = ({ open, onOpenChange, children }) => {
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

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-[60]">
        {children}
      </div>
    </div>
  );
};

export const DialogContent = ({ className = '', children, ...props }) => {
  return (
    <div
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
  return (
    <h2 className={`text-lg font-semibold text-white ${className}`} {...props}>
      {children}
    </h2>
  );
};

export const DialogDescription = ({ className = '', children, ...props }) => {
  return (
    <p className={`text-sm text-gray-400 ${className}`} {...props}>
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
