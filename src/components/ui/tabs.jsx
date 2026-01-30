import React, { useState } from 'react';

export const Tabs = ({ defaultValue, value, onValueChange, children, className = '' }) => {
  const [activeTab, setActiveTab] = useState(defaultValue || value);

  const handleTabChange = (newValue) => {
    setActiveTab(newValue);
    onValueChange?.(newValue);
  };

  return (
    <div className={className}>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { 
          activeTab: value || activeTab, 
          onTabChange: handleTabChange 
        })
      )}
    </div>
  );
};

export const TabsList = ({ className = '', children, activeTab, onTabChange }) => {
  return (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-gray-800 p-1 text-gray-400 ${className}`}>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { activeTab, onTabChange })
      )}
    </div>
  );
};

export const TabsTrigger = ({ value, className = '', children, activeTab, onTabChange }) => {
  const isActive = activeTab === value;
  
  return (
    <button
      onClick={() => onTabChange?.(value)}
      data-state={isActive ? 'active' : 'inactive'}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isActive 
          ? 'bg-yellow-400 text-black shadow-sm' 
          : 'text-gray-400 hover:text-white'
      } ${className}`}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ value, className = '', children, activeTab }) => {
  if (activeTab !== value) return null;
  
  return (
    <div className={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}>
      {children}
    </div>
  );
};
