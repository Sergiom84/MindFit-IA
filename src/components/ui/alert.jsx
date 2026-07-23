import React from 'react';

export const Alert = ({ className = '', children, ...props }) => {
  return (
    <div
      className={`relative w-full rounded-lg border p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const AlertTitle = ({ className = '', children, ...props }) => {
  return (
    <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`} {...props}>
      {children}
    </h5>
  );
};

export const AlertDescription = ({ className = '', children, ...props }) => {
  return (
    <div className={`text-sm ${className}`} {...props}>
      {children}
    </div>
  );
};
