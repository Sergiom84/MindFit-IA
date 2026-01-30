import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Activity, Save, Pencil, Calculator, Clock } from 'lucide-react'
import { EditableField } from '../EditableField'
import { BodyCompositionCalculator } from './BodyCompositionCalculator'
import { useUserContext } from '@/contexts/UserContext'

export const BodyCompositionCard = (props) => {
  const {
    userProfile,
    editingSection,
    editedData,
    startEdit,
    handleSave,
    handleCancel,
    handleInputChange,
    setUserProfile
  } = props

  const { updateUserProfile } = useUserContext()
  const [showCalculator, setShowCalculator] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isEditing = editingSection === 'bodyComp'

  const handleCalculatorResults = async (results) => {
    setIsSaving(true)
    console.log('🔄 Procesando resultados de calculadora:', results)
    
    try {
      // Usar los resultados calculados directamente por la calculadora
      const compositionData = {
        grasa_corporal: results.porcentaje_grasa,
        masa_muscular: results.masa_magra,
        agua_corporal: results.agua_corporal,
        metabolismo_basal: results.metabolismo_basal
      }

      console.log('📊 Datos a guardar:', compositionData)

      // Actualizar inmediatamente la UI local
      setUserProfile(prev => {
        const updated = { ...prev, ...compositionData }
        console.log('🔄 Perfil actualizado localmente:', updated)
        return updated
      })

      // Guardar en base de datos automáticamente
      const success = await updateUserProfile(compositionData)
      
      if (success) {
        console.log('✅ Composición corporal guardada automáticamente en BD')
        // Cerrar calculadora
        setShowCalculator(false)
        
        // Mostrar mensaje de éxito visual
        setTimeout(() => {
          console.log('📊 Composición corporal actualizada exitosamente')
        }, 100)
      } else {
        console.error('❌ Error guardando composición corporal en BD')
        alert('Error guardando los datos. Por favor, inténtalo de nuevo.')
      }
      
    } catch (error) {
      console.error('❌ Error procesando resultados de calculadora:', error)
      alert('Error procesando los resultados del cálculo.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
      <CardHeader>
        <CardTitle className="text-white font-urbanist flex items-center justify-between">
          <div className="flex items-center">
            <Activity className="mr-2 text-yellow-400" /> Composición
            Corporal Detallada
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
                )
              : (
              <button
                onClick={() =>
                  startEdit('bodyComp', {
                    grasa_corporal: userProfile.grasa_corporal,
                    masa_muscular: userProfile.masa_muscular,
                    agua_corporal: userProfile.agua_corporal,
                    metabolismo_basal: userProfile.metabolismo_basal
                  })
                }
                disabled={editingSection && editingSection !== 'bodyComp'}
                className="p-2 text-gray-300/70 hover:text-yellow-300 transition-colors"
                title="Editar composición corporal"
              >
                <Pencil className="w-4 h-4" />
              </button>
                )}
            {/* Botón para abrir el modal de cálculo */}
            {!isEditing && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/10 text-gray-200/80 hover:bg-white/10"
                onClick={() => setShowCalculator(true)}
                disabled={isSaving}
                title="Calcular automáticamente y guardar"
              >
                {isSaving ? (
                  <>
                    <Clock className="w-4 h-4 mr-1 animate-spin" /> 
                    Guardando...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4 mr-1" /> 
                    Calcular
                  </>
                )}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mostrar si hay datos calculados */}
        {userProfile.grasa_corporal || userProfile.masa_muscular || userProfile.agua_corporal || userProfile.metabolismo_basal ? (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-400/30 rounded-lg">
            <p className="text-emerald-300 text-sm flex items-center">
              <Activity className="w-4 h-4 mr-2" />
              ✅ Composición corporal calculada automáticamente
            </p>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded-lg">
            <p className="text-gray-300/70 text-sm flex items-center">
              <Calculator className="w-4 h-4 mr-2" />
              Usa la calculadora para obtener tu composición corporal automáticamente
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EditableField
            label="Grasa Corporal"
            field="grasa_corporal"
            value={userProfile.grasa_corporal}
            type="number"
            suffix="%"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Masa Muscular"
            field="masa_muscular"
            value={userProfile.masa_muscular}
            type="number"
            suffix=" kg"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Agua Corporal"
            field="agua_corporal"
            value={userProfile.agua_corporal}
            type="number"
            suffix="%"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
          <EditableField
            label="Metabolismo Basal"
            field="metabolismo_basal"
            value={userProfile.metabolismo_basal}
            type="number"
            suffix=" kcal"
            editing={isEditing}
            editedData={editedData}
            onInputChange={handleInputChange}
          />
        </div>
      </CardContent>

      {/* Calculadora modal */}
      <BodyCompositionCalculator
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        onCalculate={handleCalculatorResults}
        userProfile={userProfile}
      />
    </Card>
  )
}
