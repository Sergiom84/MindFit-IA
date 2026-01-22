import React from 'react'

export const EditableField = ({
  label,
  field,
  value,
  displayValue,
  type = 'text',
  suffix = '',
  editing,
  editedData,
  onInputChange,
  options = null,
  isList = false,
  displayObjects = null,
  helpText = null,
  noneOptionLabel = null,
  noneOptionValue = null
}) => {
  const currentValue = editing ? (editedData[field] || (isList ? [] : '')) : value
  const helpLines = Array.isArray(helpText) ? helpText : (helpText ? String(helpText).split('\n') : [])
  const showHelp = editing && helpLines.length > 0

  const renderHelp = () => {
    if (!showHelp) return null
    return (
      <span className="relative group inline-flex">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 text-[10px] text-gray-300">
          i
        </span>
        <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {helpLines.map((line, index) => (
            <p key={index} className={index ? 'mt-1' : ''}>
              {line}
            </p>
          ))}
        </div>
      </span>
    )
  }

  const renderLabel = (className = '') => (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="text-gray-400">{label}</label>
      {renderHelp()}
    </div>
  )

  if (editing) {
    if (isList) {
      const listValue = Array.isArray(currentValue) ? currentValue : []
      const hasNoneOption = !!(noneOptionLabel && noneOptionValue)
      const noneSelected = hasNoneOption && listValue.length === 1 && listValue[0] === noneOptionValue
      const displayList = noneSelected ? [] : listValue
      // Campo para listas
      return (
        <div className="h-full flex flex-col">
          {renderLabel('mb-2 font-medium')}
          {hasNoneOption && (
            <label className="mb-2 flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={noneSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    onInputChange(field, [noneOptionValue])
                    return
                  }
                  onInputChange(field, [])
                }}
                className="h-4 w-4 accent-yellow-400"
              />
              <span>{noneOptionLabel}</span>
            </label>
          )}
          <div className="space-y-2 flex-grow">
            {displayList.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const newList = [...displayList]
                    newList[index] = e.target.value
                    onInputChange(field, newList)
                  }}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/20 transition-all"
                  placeholder={`${label} ${index + 1}`}
                />
                <button
                  onClick={() => {
                    const newList = displayList.filter((_, i) => i !== index)
                    onInputChange(field, newList)
                  }}
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg px-2 py-1 transition-all"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const newList = [...displayList, '']
                onInputChange(field, newList)
              }}
              disabled={noneSelected}
              className={`text-sm font-medium border border-yellow-400/20 rounded-lg px-3 py-1.5 transition-all ${
                noneSelected
                  ? 'text-gray-500 cursor-not-allowed'
                  : 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10'
              }`}
            >
              + Agregar {label.toLowerCase()}
            </button>
          </div>
        </div>
      )
    } else if (options) {
      // Campo select
      return (
        <div>
          {renderLabel()}
          <select
            value={currentValue}
            onChange={(e) => onInputChange(field, e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="">Seleccionar...</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )
    } else {
      // Campo input
      return (
        <div>
          {renderLabel()}
          <input
            type={type}
            value={currentValue}
            onChange={(e) => onInputChange(field, e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
            placeholder={`Ingresa ${label.toLowerCase()}`}
          />
        </div>
      )
    }
  } else {
    // Modo visualización
    if (isList && Array.isArray(value)) {
      return (
        <div className="h-full flex flex-col">
          <label className="text-gray-400 mb-2 font-medium">{label}</label>
          <div className="space-y-1 flex-grow">
            {value.length > 0 ? (
              value.map((item, index) => (
                <div key={index} className="text-white text-sm bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                  {displayObjects ? displayObjects[index]?.name || item : item}
                </div>
              ))
            ) : (
              <p className="text-gray-500 italic text-sm bg-gray-800/30 rounded-lg px-3 py-2 border border-dashed border-gray-600/30">
                Ninguno especificado
              </p>
            )}
          </div>
        </div>
      )
    } else {
      return (
        <div>
          {renderLabel()}
          <p className="text-white font-semibold">
            {displayValue || (value ? `${value}${suffix}` : 'No especificado')}
          </p>
        </div>
      )
    }
  }
}
