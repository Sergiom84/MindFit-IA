import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Save, Pencil } from 'lucide-react'
import { EditableField } from '../EditableField'
import { MedicalDocsCard } from './MedicalDocsCard'

export const HealthTab = (props) => {
  const {
    userProfile,
    setUserProfile,
    editingSection,
    editedData,
    startEdit,
    handleSave,
    handleCancel,
    handleInputChange,
    alergiasList,
    medicamentosList,
    limitacionesList,
    alergiasObjList,
    medicamentosObjList,
    limitacionesObjList
  } = props

  const isEditing = editingSection === 'health'

  return (
    <div className="space-y-6">
      {/* Componente de documentación médica */}
      <MedicalDocsCard
        userProfile={userProfile}
        setUserProfile={setUserProfile}
      />

      {/* Tarjeta de salud: historial médico, alergias, medicamentos y limitaciones */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center justify-between">
            <span>Salud y limitaciones físicas</span>
            <div className="flex items-center gap-2">
              {isEditing
                ? (
                <>
                  <Button onClick={handleSave} size="sm" className="bg-green-500 hover:bg-green-600 text-white">
                    <Save className="w-4 h-4 mr-1" /> Guardar
                  </Button>
                  <Button onClick={handleCancel} size="sm" variant="outline" className="border-white/10 text-gray-200/80 hover:bg-white/10">
                    Cancelar
                  </Button>
                </>
                  )
                : (
                <button
                  onClick={() => {
                    startEdit('health', {
                      historial_medico: userProfile.historial_medico || '',
                      alergias: [...alergiasList],
                      medicamentos: [...medicamentosList],
                      limitaciones_fisicas: [...limitacionesList]
                    })
                  }}
                  disabled={!!(editingSection && editingSection !== 'health')}
                  className="p-2 text-gray-300/70 hover:text-yellow-300 transition-colors"
                  title="Editar historial médico, alergias, medicamentos y limitaciones"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                  )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">

        <EditableField
          label="Historial médico"
          field="historial_medico"
          editing={isEditing}
          multiline={true}
          value={userProfile.historial_medico || ''}
          editedData={editedData}
          onInputChange={handleInputChange}
          helpText={'Condiciones médicas relevantes para tu entrenamiento (cirugías, patologías crónicas, etc.).'}
          {...props}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          <EditableField
            label="Alergias"
            field="alergias"
            editing={isEditing}
            isList={true}
            value={alergiasList}
            editedData={editedData}
            onInputChange={handleInputChange}
            displayObjects={alergiasObjList}
            noneOptionLabel="No tengo alergias"
            noneOptionValue="Ninguna"
            {...props}
          />

          <EditableField
            label="Medicamentos"
            field="medicamentos"
            editing={isEditing}
            isList={true}
            value={medicamentosList}
            editedData={editedData}
            onInputChange={handleInputChange}
            displayObjects={medicamentosObjList}
            noneOptionLabel="No tomo medicamentos"
            noneOptionValue="Ninguno"
            {...props}
          />

          <EditableField
            label="Lesiones y limitaciones físicas"
            field="limitaciones_fisicas"
            editing={isEditing}
            isList={true}
            value={limitacionesList}
            editedData={editedData}
            onInputChange={handleInputChange}
            displayObjects={limitacionesObjList}
            noneOptionLabel="No tengo lesiones ni limitaciones"
            noneOptionValue="Ninguna"
            helpText={'Lesiones o limitaciones que el generador de rutinas debe respetar (p. ej. "rodilla", "hombro", "lumbar"). El motor evita los ejercicios contraindicados.'}
            {...props}
          />
        </div>
      </CardContent>
    </Card>
    </div>
  )
}
