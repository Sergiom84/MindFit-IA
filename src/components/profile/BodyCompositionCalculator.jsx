import { alertDialog } from '../ui/dialogService.jsx';
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Calculator, X, RotateCcw } from 'lucide-react'

export const BodyCompositionCalculator = ({ isOpen, onClose, onCalculate, userProfile }) => {
  const [formData, setFormData] = useState({
    sexo: userProfile?.sexo || 'masculino',
    edad: userProfile?.edad || '',
    peso: userProfile?.peso || '',
    altura: userProfile?.altura || '',
    cintura: userProfile?.cintura || '',
    cuello: userProfile?.cuello || '',
    cadera: userProfile?.cadera || '',
    muslo: (userProfile?.muslo ?? userProfile?.muslos) || ''
  })

  // Actualizar formData cuando cambie userProfile
  useEffect(() => {
    if (userProfile && isOpen) {
      setFormData({
        sexo: userProfile.sexo || 'masculino',
        edad: userProfile.edad || '',
        peso: userProfile.peso || '',
        altura: userProfile.altura || '',
        cintura: userProfile.cintura || '',
        cuello: userProfile.cuello || '',
        cadera: userProfile.cadera || '',
        muslo: (userProfile.muslo ?? userProfile.muslos) || ''
      })
    }
  }, [userProfile, isOpen])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const calculateComposition = () => {
    const { sexo, edad, peso, altura, cintura, cuello, cadera, muslo } = formData

    if (!edad || !peso || !altura || !cintura || !cuello) {
      alertDialog('Por favor completa todos los campos')
      return
    }

    if (sexo === 'femenino' && !cadera) {
      alertDialog('Para mujeres es necesario ingresar la medida de cadera')
      return
    }

    const pesoNum = parseFloat(peso)
    const alturaNum = parseFloat(altura)
    const cinturaNum = parseFloat(cintura)
    const cuelloNum = parseFloat(cuello)
    const caderaNum = parseFloat(cadera)
    const edadNum = parseFloat(edad)
    const musloNum = muslo ? parseFloat(muslo) : null

    const alturaM = alturaNum / 100
    const imc = (pesoNum / (alturaM * alturaM)).toFixed(1)

    // % grasa corporal: formula US Navy (Hodgdon & Beckett, 1984)
    let bodyFat
    if (sexo === 'masculino') {
      bodyFat = 495 / (1.0324 - 0.19077 * Math.log10(cinturaNum - cuelloNum) + 0.15456 * Math.log10(alturaNum)) - 450
    } else {
      const suma = cinturaNum + caderaNum - cuelloNum
      bodyFat = 163.205 * Math.log10(suma) - 97.684 * Math.log10(alturaNum) - 78.387
    }

    bodyFat = Math.max(sexo === 'masculino' ? 3 : 8, bodyFat)

    const masaGrasa = parseFloat((pesoNum * bodyFat / 100).toFixed(1))
    let masaMagra = parseFloat((pesoNum - masaGrasa).toFixed(1))

    // Si muslo disponible, corregir masa magra con estimacion de masa muscular
    // apendicular (Lee et al. 2000) para afinar la distribucion grasa/magra.
    // ASM = 0.244*peso + 7.80*altura_m + 6.6*sexo_code - 0.098*edad + muslo*0.030 - 4.5
    // sexo_code: 1=hombre, 0=mujer. El termino muslo*0.030 es un ajuste conservador
    // basado en la correlacion perimetro muslo <-> masa muscular apendicular.
    let metodoCalculo = 'navy'
    if (musloNum && musloNum > 30 && musloNum < 90) {
      const sexoCode = sexo === 'masculino' ? 1 : 0
      const asm = 0.244 * pesoNum + 7.80 * alturaM + 6.6 * sexoCode - 0.098 * edadNum + musloNum * 0.030 - 4.5
      // ASM es masa muscular apendicular; masa magra total ~ ASM / 0.56 (Heymsfield 1990)
      const massMagraEstimada = parseFloat((asm / 0.56).toFixed(1))
      // Promediar con la estimacion Navy para suavizar
      masaMagra = parseFloat(((masaMagra + massMagraEstimada) / 2).toFixed(1))
      metodoCalculo = 'navy+muslo'
    }

    const aguaCorporal = sexo === 'masculino' ? 60 : 55

    let metabolismoBasal
    if (sexo === 'masculino') {
      metabolismoBasal = 88.362 + (13.397 * pesoNum) + (4.799 * alturaNum) - (5.677 * edadNum)
    } else {
      metabolismoBasal = 447.593 + (9.247 * pesoNum) + (3.098 * alturaNum) - (4.330 * edadNum)
    }

    const results = {
      imc: parseFloat(imc),
      porcentaje_grasa: parseFloat(bodyFat.toFixed(1)),
      masa_grasa: masaGrasa,
      masa_magra: masaMagra,
      muslo: musloNum,
      agua_corporal: aguaCorporal,
      metabolismo_basal: Math.round(metabolismoBasal),
      metodo_calculo: metodoCalculo
    }

    onCalculate(results)

    setFormData({
      sexo: userProfile?.sexo || 'masculino',
      edad: userProfile?.edad || '',
      peso: userProfile?.peso || '',
      altura: userProfile?.altura || '',
      cintura: userProfile?.cintura || '',
      cuello: userProfile?.cuello || '',
      cadera: userProfile?.cadera || '',
      muslo: (userProfile?.muslo ?? userProfile?.muslos) || ''
    })

    onClose()
  }

  const handleReset = () => {
    setFormData({
      sexo: userProfile?.sexo || 'masculino',
      edad: userProfile?.edad || '',
      peso: userProfile?.peso || '',
      altura: userProfile?.altura || '',
      cintura: userProfile?.cintura || '',
      cuello: userProfile?.cuello || '',
      cadera: userProfile?.cadera || '',
      muslo: (userProfile?.muslo ?? userProfile?.muslos) || ''
    })
  }

  const handleCancel = () => {
    handleReset()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="bg-neutral-900/95 border border-white/10 border-l-2 border-l-yellow-400/30 ring-1 ring-white/5 shadow-2xl backdrop-blur-xl w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center justify-between">
            <div className="flex items-center">
              <Calculator className="mr-2 text-yellow-400" />
              Calculadora de Composición Corporal
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="text-gray-300/70 hover:text-yellow-300 transition-colors"
                title="Resetear formulario"
              >
                <RotateCcw size={18} />
              </button>
              <button
                onClick={onClose}
                className="text-gray-300/70 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </CardTitle>
          <p className="text-gray-300/70 text-sm">
            Ingresa tus medidas para calcular automáticamente tu composición corporal
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Sexo</label>
              <select
                value={formData.sexo}
                onChange={(e) => handleInputChange('sexo', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
              </select>
            </div>

            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Edad</label>
              <input
                type="number"
                value={formData.edad}
                onChange={(e) => handleInputChange('edad', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                placeholder="41"
                min="16"
                max="100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Peso (kg)</label>
              <input
                type="number"
                value={formData.peso}
                onChange={(e) => handleInputChange('peso', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                placeholder="76.00"
                min="40"
                max="200"
                step="0.1"
              />
            </div>

            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Altura (cm)</label>
              <input
                type="number"
                value={formData.altura}
                onChange={(e) => handleInputChange('altura', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                placeholder="183.50"
                min="140"
                max="220"
                step="0.1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Cintura (cm)</label>
              <input
                type="number"
                value={formData.cintura}
                onChange={(e) => handleInputChange('cintura', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                placeholder="90.0"
                min="50"
                max="150"
                step="0.1"
              />
            </div>

            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Cuello (cm)</label>
              <input
                type="number"
                value={formData.cuello}
                onChange={(e) => handleInputChange('cuello', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                placeholder="34.0"
                min="25"
                max="50"
                step="0.1"
              />
            </div>
          </div>

          <div className={`grid ${formData.sexo === 'femenino' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
            {formData.sexo === 'femenino' && (
              <div>
                <label className="text-gray-300/70 text-sm mb-1 block">Cadera (cm) *</label>
                <input
                  type="number"
                  value={formData.cadera}
                  onChange={(e) => handleInputChange('cadera', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  placeholder="95.0"
                  min="70"
                  max="150"
                  step="0.1"
                />
                <p className="text-xs text-gray-300/60 mt-1">Requerido en mujeres</p>
              </div>
            )}
            <div>
              <label className="text-gray-300/70 text-sm mb-1 block">Muslo (cm)</label>
              <input
                type="number"
                value={formData.muslo}
                onChange={(e) => handleInputChange('muslo', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                placeholder="55.0"
                min="30"
                max="90"
                step="0.1"
              />
              <p className="text-xs text-gray-300/60 mt-1">Opcional. Afina la estimacion de masa magra</p>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-white/10 text-gray-200/80 hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              onClick={calculateComposition}
              className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
            >
              Calcular
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
