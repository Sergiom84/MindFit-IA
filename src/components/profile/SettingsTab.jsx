import React from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Settings } from 'lucide-react'
import TrainingPreferencesCard from './TrainingPreferencesCard'

export const SettingsTab = () => {
  // Por ahora, este componente es estático y no necesita props.
  return (
    <div className="space-y-6">
      {/* Preferencias de Entrenamiento */}
      <TrainingPreferencesCard />

      {/* Configuración de Cuenta */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center">
            <Settings className="mr-2 text-yellow-400" /> Configuración de
            Cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-yellow-400">
              Cambiar Contraseña
            </h3>
            <p className="text-gray-300/70">
              Esta funcionalidad estará disponible próximamente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
