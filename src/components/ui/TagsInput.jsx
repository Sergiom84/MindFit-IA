import React, { useState } from 'react'

/**
 * TagsInput component
 * - Controlled array of strings
 * - Add with Enter or comma, remove with X, dedup + trim
 */
export default function TagsInput({
  value = [],
  onChange,
  placeholder = 'Escribe y pulsa Enter...',
  disabled = false,
  name,
  className = ''
}) {
  const [input, setInput] = useState('')

  const normalized = Array.isArray(value) ? value : []

  const commit = (raw) => {
    if (!raw) return
    const parts = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const set = new Set(normalized)
    parts.forEach(p => set.add(p))
    onChange?.(Array.from(set))
    setInput('')
  }

  const removeAt = (idx) => {
    const next = normalized.filter((_, i) => i !== idx)
    onChange?.(next)
  }

  return (
    <div className={`bg-gray-700/50 border border-gray-600 rounded-lg p-2 ${className}`}>
      <div className="flex flex-wrap gap-2">
        {normalized.map((tag, idx) => (
          <span key={`${tag}-${idx}`} className="flex items-center gap-1 bg-gray-800 text-gray-100 px-2 py-1 rounded">
            <span className="text-sm">{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="text-gray-400 hover:text-red-400"
                aria-label={`Eliminar ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            name={name}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commit(input)
              }
            }}
            onBlur={() => commit(input)}
            placeholder={placeholder}
            className="flex-1 min-w-[160px] bg-transparent outline-none text-white placeholder-gray-400 px-2 py-1"
          />
        )}
      </div>
    </div>
  )
}

