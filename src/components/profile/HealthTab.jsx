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
    lesionesList,
    alergiasObjList,
    medicamentosObjList,
    lesionesObjList
  } = props

  const isEditing = editingSection === 'health'

  return (
    <div className="space-y-6">
      {/* Componente de documentación médica */}
      <MedicalDocsCard
        userProfile={userProfile}
        setUserProfile={setUserProfile}
      />

      {/* Tarjeta de alergias y medicamentos */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center justify-between">
            <span>Alergias, Medicamentos y Lesiones</span>
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
                      alergias: [...alergiasList],
                      medicamentos: [...medicamentosList],
                      lesiones: [...lesionesList]
                    })
                  }}
                  disabled={!!(editingSection && editingSection !== 'health')}
                  className="p-2 text-gray-300/70 hover:text-yellow-300 transition-colors"
                  title="Editar alergias, medicamentos y lesiones"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                  )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">

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
            label="Lesiones"
            field="lesiones"
            editing={isEditing}
            isList={true}
            value={lesionesList}
            editedData={editedData}
            onInputChange={handleInputChange}
            displayObjects={lesionesObjList}
            noneOptionLabel="No tengo lesiones"
            noneOptionValue="Ninguna"
            {...props}
          />
        </div>
      </CardContent>
    </Card>
    </div>
  )
}
