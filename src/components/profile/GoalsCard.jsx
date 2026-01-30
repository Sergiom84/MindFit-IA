import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Target, Save, Pencil } from 'lucide-react'
import { EditableField } from '../EditableField'

export const GoalsCard = ({
  userProfile,
  editingSection,
  editedData,
  startEdit,
  handleSave,
  handleCancel,
  handleInputChange,
  objetivosOptions,
  getObjetivoLabel
}) => {
  const isEditing = editingSection === 'goals'

  return (
    <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
      <CardHeader>
        <CardTitle className="text-white font-urbanist flex items-center justify-between">
          <div className="flex items-center">
            <Target className="mr-2 text-yellow-400" /> Objetivos y Metas
          </div>
          <div className="flex items-center gap-2">
            {isEditing
              ? (
              <>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  <Save className="w-4 h-4 mr-1" /> Guardar
                </Button>
                <Button
                  onClick={handleCancel}
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-gray-200/80 hover:bg-white/10"
                >
                  Cancelar
                </Button>
              </>
                )
              : (
              <button
                onClick={() =>
                  startEdit('goals', {
                    objetivo_principal: userProfile.objetivo_principal,
                    meta_peso: userProfile.meta_peso,
                    meta_grasa: userProfile.meta_grasa
                  })
                }
                disabled={editingSection && editingSection !== 'goals'}
                className="p-2 text-gray-300/70 hover:text-yellow-300 transition-colors"
                title="Editar objetivos y metas"
              >
                <Pencil className="w-4 h-4" />
              </button>
                )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Objetivos Principales */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-4">Objetivos Principales</h3>
            <EditableField
              label="Objetivo Principal"
              field="objetivo_principal"
              value={userProfile.objetivo_principal}
              displayValue={getObjetivoLabel(userProfile.objetivo_principal)}
              editing={isEditing}
              editedData={editedData}
              onInputChange={handleInputChange}
              options={objetivosOptions}
            />

            {!isEditing && userProfile.objetivo_principal && (
              <div className="mt-2">
                <div className="flex justify-between text-sm text-gray-300/70 mb-1">
                  <span>Progreso hacia el objetivo</span>
                  <span>75%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className="bg-yellow-400 h-2 rounded-full" style={{ width: '75%' }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Metas Específicas */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-4">Metas Específicas</h3>
            <EditableField
              label="Meta de Peso"
              field="meta_peso"
              value={userProfile.meta_peso}
              type="number"
              suffix=" kg"
              editing={isEditing}
              editedData={editedData}
              onInputChange={handleInputChange}
            />
            <EditableField
              label="Meta de Grasa Corporal"
              field="meta_grasa"
              value={userProfile.meta_grasa}
              type="number"
              suffix="%"
              editing={isEditing}
              editedData={editedData}
              onInputChange={handleInputChange}
            />

            {!isEditing && userProfile.peso && userProfile.meta_peso && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-200/80 mb-2">Comparación Actual vs Meta</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-300/70">Peso Actual:</span>
                    <span className="text-white font-semibold ml-2">{userProfile.peso} kg</span>
                  </div>
                  <div>
                    <span className="text-gray-300/70">Meta:</span>
                    <span className="text-yellow-400 font-semibold ml-2">{userProfile.meta_peso} kg</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-300/70">Diferencia:</span>
                    <span className={`font-semibold ml-2 ${
                      Math.abs(userProfile.peso - userProfile.meta_peso) <= 2
                        ? 'text-green-400'
                        : 'text-orange-400'
                    }`}>
                      {Math.abs(userProfile.peso - userProfile.meta_peso).toFixed(1)} kg
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
