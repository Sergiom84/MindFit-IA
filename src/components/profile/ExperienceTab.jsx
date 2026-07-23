import React from 'react'
import { ExperienceCard } from './ExperienceCard'

export const ExperienceTab = (props) => {
  return (
    <div className="space-y-6">
      <ExperienceCard {...props} />
    </div>
  )
}
