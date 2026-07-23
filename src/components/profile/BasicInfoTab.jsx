import React from 'react'

// 1. Importa las dos tarjetas necesarias para información básica
import { BasicInfoCard } from './BasicInfoCard'
import { PreferencesCard } from './PreferencesCard'

// 2. Este componente recibe todas las props y las pasa hacia abajo
export const BasicInfoTab = (props) => {
  return (
    <div className="space-y-6">
      {/* Usamos {...props} para pasar todas las propiedades (userProfile, editingSection,
        handleSave, etc.) a cada componente hijo de forma automática.
      */}
      <BasicInfoCard {...props} />
      <PreferencesCard {...props} />
    </div>
  )
}
