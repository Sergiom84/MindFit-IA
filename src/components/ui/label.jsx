import React from 'react';

export const Label = ({ className = '', htmlFor, children, ...props }) => {
  return (
    <label
      htmlFor={htmlFor}
      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </label>
  );
};
