import React from 'react';

const Separator = ({ className = "", orientation = "horizontal" }) => {
  const baseClasses = "shrink-0";
  const orientationClasses = 
    orientation === "horizontal" 
      ? "h-[1px] w-full" 
      : "w-[1px] h-full";
  
  return (
    <div 
      className={`${baseClasses} ${orientationClasses} bg-gray-600 ${className}`}
      role="separator"
      aria-orientation={orientation}
    />
  );
};

export { Separator };
