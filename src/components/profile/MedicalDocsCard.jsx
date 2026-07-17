import { confirmDialog, alertDialog } from '../ui/dialogService.jsx';
import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { FileText, Upload, Eye, Trash2, Download, AlertCircle } from 'lucide-react'
import tokenManager from '@/utils/tokenManager'

export const MedicalDocsCard = ({ userProfile, setUserProfile }) => {
  const [uploading, setUploading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [medicalDocs, setMedicalDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
  const fileInputRef = useRef(null)

  // El usuario se identifica por el token (el backend lo deriva de req.user).
  // El token principal se guarda como 'authToken' vía tokenManager.
  const authHeaders = () => {
    const token = tokenManager.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // Cargar documentos del backend al montar el componente
  const fetchDocs = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/medical-docs', { headers: authHeaders() })
      const data = await response.json()

      if (data.success) {
        setMedicalDocs(data.docs || [])
      }
    } catch (error) {
      console.error('Error cargando documentos:', error)
    } finally {
      setLoading(false)
    }
  }

  // Cargar documentos al montar el componente
  React.useEffect(() => {
    fetchDocs()
  }, [])

  // Libera el blob URL al cambiar de documento o al desmontar (evita fugas).
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleFileSelect = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // Validar tipo de archivo
    if (file.type !== 'application/pdf') {
      alertDialog('Solo se permiten archivos PDF')
      return
    }

    // Validar tamaño (máximo 25MB para coincidir con el backend)
    if (file.size > 25 * 1024 * 1024) {
      alertDialog('El archivo es demasiado grande. Máximo 25MB.')
      return
    }

    setUploading(true)

    try {
      // Crear FormData para enviar el archivo
      const formData = new FormData()
      formData.append('file', file)

      // No fijar Content-Type: el navegador añade el boundary de multipart.
      const response = await fetch('/api/medical-docs', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        // Actualizar la lista de documentos
        setMedicalDocs(data.docs || [])

        // Limpiar input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }

        alertDialog('Documento subido exitosamente')
      } else {
        throw new Error(data.error || 'Error al subir el archivo')
      }
    } catch (error) {
      console.error('Error subiendo archivo:', error)
      alertDialog('Error al subir el archivo: ' + error.message)
    } finally {
      setUploading(false)
    }
  }



  const handlePreview = async (doc) => {
    setSelectedDoc(doc)
    setShowPreview(true)
    setPreviewUrl(null)
    try {
      // El iframe no puede enviar cabecera Authorization; descargamos el PDF
      // con el token y lo mostramos como blob URL.
      const response = await fetch(`/api/medical-docs/${doc.id}/view`, { headers: authHeaders() })
      if (!response.ok) throw new Error('No se pudo cargar el documento')
      const blob = await response.blob()
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (error) {
      console.error('Error cargando vista previa:', error)
    }
  }

  const closePreview = () => {
    setShowPreview(false)
    // El useEffect de previewUrl se encarga de revocar el blob.
    setPreviewUrl(null)
  }

  const handleDelete = async (docId) => {
    const confirmed = await confirmDialog({
      title: 'Eliminar documento',
      description: '¿Estás seguro de que quieres eliminar este documento?',
      confirmText: 'Eliminar',
      destructive: true
    });
    if (confirmed) {
      try {
        const response = await fetch(`/api/medical-docs/${docId}`, {
          method: 'DELETE',
          headers: authHeaders()
        })

        const data = await response.json()

        if (data.success) {
          // Actualizar la lista de documentos
          setMedicalDocs(data.docs || [])
          alertDialog('Documento eliminado exitosamente')
        } else {
          throw new Error(data.error || 'Error al eliminar el documento')
        }
      } catch (error) {
        console.error('Error eliminando documento:', error)
        alertDialog('Error al eliminar el documento: ' + error.message)
      }
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <>
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center">
            <FileText className="mr-2 text-yellow-400" />
            Documentación Médica
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Botón de subida */}
          <div className="border-2 border-dashed border-white/10 bg-white/5 rounded-lg p-6 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-300/70 mb-4" />
            <p className="text-gray-300/70 mb-4">
              Sube tus documentos médicos (PDF únicamente)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-yellow-400 hover:bg-yellow-500 text-black"
            >
              {uploading ? 'Subiendo...' : 'Seleccionar Archivo'}
            </Button>
            <p className="text-xs text-gray-300/60 mt-2">
              Máximo 25MB por archivo
            </p>
          </div>

          {/* Lista de documentos */}
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto mb-4"></div>
              <p className="text-gray-300/70">Cargando documentos...</p>
            </div>
          ) : medicalDocs.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-200/80">
                Documentos subidos ({medicalDocs.length})
              </h4>
              {medicalDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-red-400" />
                    <div>
                      <p className="text-white font-medium text-sm">
                        {doc.originalName || doc.fileName}
                      </p>
                      <p className="text-gray-300/70 text-xs">
                        {formatFileSize(doc.size)} • {formatDate(doc.uploadedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {doc.ai && (
                      <div className="flex items-center text-green-400 text-xs">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Analizado
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreview(doc)}
                      className="border-white/10 text-gray-200/80 hover:bg-white/10"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(doc.id)}
                      className="border-red-600 text-red-400 hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="mx-auto h-16 w-16 text-gray-500 mb-4" />
              <p className="text-gray-300/70">
                No hay documentos médicos subidos
              </p>
              <p className="text-gray-300/60 text-sm">
                Sube tus informes médicos para un mejor seguimiento
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de previsualización */}
      {showPreview && selectedDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900/85 border border-white/10 ring-1 ring-white/5 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-white font-medium">
                {selectedDoc.fileName}
              </h3>
              <Button
                onClick={closePreview}
                variant="outline"
                size="sm"
                className="border-white/10 text-gray-200/80 hover:bg-white/10"
              >
                Cerrar
              </Button>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              <div className="bg-white rounded-lg h-full min-h-[500px] flex items-center justify-center">
                {previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full min-h-[500px] rounded"
                    title={selectedDoc.originalName || selectedDoc.fileName}
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto mb-3"></div>
                    Cargando documento...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
