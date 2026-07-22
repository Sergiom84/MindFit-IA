import React from 'react'

// Importa las dos tarjetas de la pestaña 'Objetivos'
import { GoalsCard } from './GoalsCard'
import { GoalProgressCard } from './GoalProgressCard'

// El componente recibe todas las props y las pasa a sus hijos
export const GoalsTab = (props) => {
  return (
    <div className="space-y-6">
      {/* Pasa todas las props a cada tarjeta */}
      <GoalsCard {...props} />
      <GoalProgressCard {...props} />
    </div>
  )
}
