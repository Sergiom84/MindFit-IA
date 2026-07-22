import React, { createContext, useContext } from 'react';

const RadioCtx = createContext({ value: undefined, onValueChange: () => {} });

export const RadioGroup = ({ value, onValueChange, children, ...props }) => {
  return (
    <div {...props}>
      <RadioCtx.Provider value={{ value, onValueChange }}>
        {children}
      </RadioCtx.Provider>
    </div>
  );
};

export const RadioGroupItem = ({ value: itemValue, id, ...props }) => {
  const { value, onValueChange } = useContext(RadioCtx);
  return (
    <input
      type="radio"
      id={id}
      checked={value === itemValue}
      onChange={() => onValueChange?.(itemValue)}
      className="w-4 h-4 text-yellow-400 bg-gray-800 border-gray-600 focus:ring-yellow-400 focus:ring-2"
      {...props}
    />
  );
};
