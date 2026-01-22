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

export const BodyMeasuresCard = ({
  userProfile,
  editingSection,
  editedData,
  startEdit,
  handleSave,
  handleCancel,
  handleInputChange
}) => {
  const isEditing = editingSection === 'bodyMeasures'

  return (
    <Card className="bg-gray-900 border-yellow-400/20">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>Medidas Corporales</span>
          <div className="flex items-center gap-2">
            {isEditing
              ? (
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
                )
              : (
              <button
                onClick={() =>
                  startEdit('bodyMeasures', {
                    cintura: userProfile.cintura,
                    pecho: userProfile.pecho,
                    brazos: userProfile.brazos,
                    muslos: userProfile.muslos,
                    cuello: userProfile.cuello,
                    antebrazos: userProfile.antebrazos
                  })
                }
                disabled={editingSection && editingSection !== 'bodyMeasures'}
                className="p-2 text-gray-400 hover:text-yellow-400 transition-colors"
                title="Editar medidas corporales"
              >
                <Pencil className="w-4 h-4" />
              </button>
                )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <EditableField
            label="Cintura"
            field="cintura"
            value={userProfile.cintura}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Pecho"
            field="pecho"
            value={userProfile.pecho}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Brazos"
            field="brazos"
            value={userProfile.brazos}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Muslos"
            field="muslos"
            value={userProfile.muslos}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Cuello"
            field="cuello"
            value={userProfile.cuello}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Antebrazos"
            field="antebrazos"
            value={userProfile.antebrazos}
            type="number"
            suffix=" cm"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
