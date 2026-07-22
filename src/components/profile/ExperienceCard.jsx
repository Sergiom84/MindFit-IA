import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Save, Pencil } from 'lucide-react'

// De nuevo, asumimos que 'EditableField' es un componente que podemos importar.
import { EditableField } from '../EditableField'
import { METODOLOGIA_OPTIONS, NIVEL_ENTRENAMIENTO_OPTIONS } from '../../config/catalogs'

export const ExperienceCard = ({
  userProfile,
  editingSection,
  editedData,
  startEdit,
  handleSave,
  handleCancel,
  handleInputChange,
  getMetodologiaLabel
}) => {
  // La lógica de edición ahora se comprueba con 'experience'
  const isEditing = editingSection === 'experience'

  return (
    <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
      <CardHeader>
        <CardTitle className="text-white font-urbanist flex items-center justify-between">
          <span>Experiencia en Entrenamiento</span>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Guardar
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
            ) : (
              <button
                onClick={() =>
                  startEdit('experience', {
                    // Campos específicos de esta tarjeta
                    nivel: userProfile.nivel,
                    años_entrenando: userProfile.años_entrenando,
                    metodologia_preferida: userProfile.metodologia_preferida,
                    frecuencia_semanal: userProfile.frecuencia_semanal
                  })
                }
                disabled={editingSection && editingSection !== 'experience'}
                className="p-2 text-gray-300/70 hover:text-yellow-300 transition-colors"
                title="Editar experiencia en entrenamiento"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isEditing ? (
            <EditableField
              label="Nivel Actual"
              field="nivel"
              value={userProfile.nivel}
              editing={isEditing}
              editedData={editedData}
              onInputChange={handleInputChange}
              options={NIVEL_ENTRENAMIENTO_OPTIONS}
            />
          ) : (
            // Lógica especial para mostrar una 'Badge' en modo vista
            <div>
              <label className="text-gray-300/70 block mb-2">Nivel Actual</label>
              <Badge
                className={`${
                  userProfile.nivel === 'principiante'
                    ? 'bg-green-400 text-black'
                    : userProfile.nivel === 'intermedio'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-red-400 text-black'
                }`}
              >
                {userProfile.nivel || 'No especificado'}
              </Badge>
            </div>
          )}
          <EditableField
            label="Años Entrenando"
            field="años_entrenando"
            value={userProfile.años_entrenando}
            type="number"
            suffix=" años"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />

          <EditableField
            label="Metodología Preferida"
            field="metodologia_preferida"
            value={userProfile.metodologia_preferida}
            displayValue={getMetodologiaLabel(userProfile.metodologia_preferida)}
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
            options={METODOLOGIA_OPTIONS}
          />
          <EditableField
            label="Frecuencia Semanal"
            field="frecuencia_semanal"
            value={userProfile.frecuencia_semanal}
            type="number"
            suffix=" días"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
