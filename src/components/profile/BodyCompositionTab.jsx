import React from 'react'

// Importa las dos tarjetas de la pestaña 'Composición'
import { BodyCompositionCard } from './BodyCompositionCard'
import { BodyMeasuresCard } from './BodyMeasuresCard'

// El componente recibe todas las props y las pasa a sus hijos
export const BodyCompositionTab = (props) => {
  return (
    <div className="space-y-6">
      {/* Pasa todas las props a cada tarjeta para que tengan acceso
          a los datos y funciones que necesitan (userProfile, startEdit, etc.)
      */}
      <BodyCompositionCard {...props} />
      <BodyMeasuresCard {...props} />
    </div>
  )
}
