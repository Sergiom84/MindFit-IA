import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { User, Save, Pencil } from 'lucide-react'
import { EditableField } from '../EditableField'

export const BasicInfoCard = ({
  userProfile,
  currentUser,
  editingSection,
  editedData,
  startEdit,
  handleSave,
  handleCancel,
  handleInputChange,
  sexoOptions,
  getSexoLabel,
  getNivelActividadLabel
}) => {
  // Esta constante ahora es local al componente y determina si SU sección está en modo edición.
  const isEditing = editingSection === 'basic'
  const activityHelpText = [
    'Sedentario: trabajo de oficina y poca actividad diaria.',
    'Ligero: caminatas o ejercicio ligero 1-2 dias/semana.',
    'Moderado: ejercicio 3-4 dias/semana.',
    'Activo: entrenamiento 5-6 dias/semana.',
    'Muy activo: entrenamiento intenso diario o trabajo fisico.'
  ]

  return (
    <Card className="bg-gray-900 border-yellow-400/20">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center">
            <User className="mr-2 text-yellow-400" /> Datos Básicos
          </div>
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
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <button
                onClick={() =>
                  startEdit('basic', {
                    // Aquí defines exactamente qué campos pertenecen a esta tarjeta
                    nombre: userProfile.nombre,
                    apellido: userProfile.apellido,
                    edad: userProfile.edad,
                    peso: userProfile.peso,
                    altura: userProfile.altura,
                    sexo: userProfile.sexo,
                    nivel_actividad: userProfile.nivel_actividad
                  })
                }
                disabled={editingSection && editingSection !== 'basic'}
                className="p-2 text-gray-400 hover:text-yellow-400 transition-colors"
                title="Editar datos básicos"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EditableField
            label="Nombre"
            field="nombre"
            value={userProfile.nombre}
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Apellido"
            field="apellido"
            value={userProfile.apellido}
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <div>
            <label className="text-gray-400">Email</label>
            <p className="text-white font-semibold break-all">
              {userProfile.email || currentUser?.email}
            </p>
            {isEditing && (
              <p className="text-xs text-gray-500 mt-1">
                El email no se puede modificar
              </p>
            )}
          </div>
          <EditableField
            label="Edad"
            field="edad"
            value={userProfile.edad}
            type="number"
            suffix=" años"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Peso Actual (Kg)"
            field="peso"
            value={userProfile.peso}
            type="number"
            suffix=" kg"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Estatura (cm)"
            field="altura"
            value={userProfile.altura}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Sexo"
            field="sexo"
            value={userProfile.sexo}
            displayValue={getSexoLabel(userProfile.sexo)}
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
            options={sexoOptions}
          />

          <EditableField
            label="Nivel de Actividad"
            field="nivel_actividad"
            value={userProfile.nivel_actividad}
            displayValue={getNivelActividadLabel(userProfile.nivel_actividad)}
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
            helpText={activityHelpText}
            options={[
              { value: 'sedentario', label: 'Sedentario' },
              { value: 'ligero', label: 'Ligero' },
              { value: 'moderado', label: 'Moderado' },
              { value: 'activo', label: 'Activo' },
              { value: 'muy_activo', label: 'Muy Activo' }
            ]}
          />
        </div>
      </CardContent>
    </Card>
  )
}


