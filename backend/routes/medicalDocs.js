import express from 'express'
// Nota: Requiere la columna jsonb en la tabla users:
//   ALTER TABLE users ADD COLUMN IF NOT EXISTS historial_medico_docs jsonb;

import multer from 'multer'
import { pool } from '../db.js'
import authenticateToken from '../middleware/auth.js'
import { getSupabaseAdmin, MEDICAL_DOCS_BUCKET, medicalDocPath } from '../lib/supabaseStorage.js'

const router = express.Router()

// 🛡️ Todos los endpoints requieren autenticación. El usuario SIEMPRE se toma
// del token (req.user.id); nunca de un parámetro de ruta → evita IDOR
// (acceso a documentos médicos de otros usuarios por ID).
router.use(authenticateToken)

const getUserId = (req) => req.user?.id || req.user?.userId

// Garantiza que la columna exista (idempotente)
const ensureDocsColumn = async () => {
  try {
    await pool.query('ALTER TABLE app.users ADD COLUMN IF NOT EXISTS historial_medico_docs jsonb')
    await pool.query("ALTER TABLE app.users ALTER COLUMN historial_medico_docs SET DEFAULT '[]'::jsonb")
  } catch (e) {
    // log suave; no bloquear
    console.warn('⚠️ No se pudo asegurar historial_medico_docs:', e.message)
  }
}

// Los PDFs médicos se guardan en un bucket PRIVADO de Supabase Storage (no en el
// disco efímero de Render, que se pierde en cada redeploy). Multer usa memoria
// para tener el buffer y subirlo a Storage.
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true)
    return cb(new Error('Solo se permiten archivos PDF'))
  }
})

// Descarga el buffer de un documento desde Storage. Compatibilidad: los docs
// antiguos guardaban `url` de disco local (ya no disponible); los nuevos guardan
// `storagePath`. Devuelve { buffer } o { error }.
const downloadDocBuffer = async (doc) => {
  if (!doc?.storagePath) {
    return { error: 'Documento almacenado en el sistema antiguo (disco efímero) y ya no disponible. Vuelve a subirlo.' }
  }
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.storage.from(MEDICAL_DOCS_BUCKET).download(doc.storagePath)
  if (error) return { error: error.message }
  const buffer = Buffer.from(await data.arrayBuffer())
  return { buffer }
}

// GET: servir archivo PDF específico (del propio usuario)
router.get('/:docId/view', async (req, res) => {
  try {
    const userId = getUserId(req)
    const { docId } = req.params

    const result = await pool.query('SELECT historial_medico_docs FROM app.users WHERE id=$1', [userId])
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' })

    const docs = result.rows[0].historial_medico_docs || []
    const doc = docs.find(d => String(d.id) === String(docId))
    if (!doc) return res.status(404).json({ success: false, error: 'Documento no encontrado' })

    const { buffer, error } = await downloadDocBuffer(doc)
    if (error) return res.status(404).json({ success: false, error })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName}"`)
    return res.send(buffer)
  } catch (e) {
    console.error('Error sirviendo PDF:', e)
    return res.status(500).json({ success: false, error: e.message || 'Error interno' })
  }
})

// GET: listar documentos del propio usuario
router.get('/', async (req, res) => {
  try {
    await ensureDocsColumn()
    const userId = getUserId(req)
    const result = await pool.query('SELECT historial_medico_docs FROM app.users WHERE id=$1', [userId])
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' })
    const docs = result.rows[0].historial_medico_docs || []
    return res.json({ success: true, docs })
  } catch (e) {
    console.error('Error listando docs médicos:', e)
    return res.status(500).json({ success: false, error: e.message || 'Error interno' })
  }
})

// POST: subir PDF a Storage y anexar metadatos en jsonb (al propio usuario)
router.post('/', uploadPdf.single('file'), async (req, res) => {
  try {
    await ensureDocsColumn()
    const userId = getUserId(req)
    const file = req.file
    if (!file) return res.status(400).json({ success: false, error: 'Archivo no recibido' })

    const ts = Date.now()
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${ts}-${safe}`
    const storagePath = medicalDocPath(userId, filename)

    // Subir a bucket privado
    const sb = getSupabaseAdmin()
    const { error: upErr } = await sb.storage
      .from(MEDICAL_DOCS_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false })
    if (upErr) {
      console.error('Error subiendo a Storage:', upErr)
      return res.status(502).json({ success: false, error: 'No se pudo almacenar el documento' })
    }

    const current = await pool.query('SELECT historial_medico_docs FROM app.users WHERE id=$1', [userId])
    if (current.rows.length === 0) {
      // Limpieza: no dejar el fichero huérfano si el usuario no existe
      await sb.storage.from(MEDICAL_DOCS_BUCKET).remove([storagePath]).catch(() => {})
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' })
    }

    const prev = current.rows[0].historial_medico_docs || []
    const doc = {
      id: String(ts),
      filename,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      storagePath,
      uploadedAt: new Date().toISOString(),
      ai: null
    }
    const next = [...prev, doc]

    await pool.query('UPDATE app.users SET historial_medico_docs=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(next), userId])

    return res.json({ success: true, doc, docs: next })
  } catch (e) {
    console.error('Error subiendo doc médico:', e)
    return res.status(500).json({ success: false, error: e.message || 'Error interno' })
  }
})

// POST: extraer texto del PDF (requiere pdf-parse)
router.post('/:docId/extract', async (req, res) => {
  try {
    const userId = getUserId(req)
    const { docId } = req.params
    const result = await pool.query('SELECT historial_medico_docs FROM app.users WHERE id=$1', [userId])
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' })
    const docs = result.rows[0].historial_medico_docs || []
    const doc = docs.find(d => String(d.id) === String(docId))
    if (!doc) return res.status(404).json({ success: false, error: 'Documento no encontrado' })

    let pdfParse
    try {
      pdfParse = (await import('pdf-parse')).default
    } catch {
      return res.status(501).json({ success: false, error: 'pdf-parse no instalado' })
    }

    const { buffer, error } = await downloadDocBuffer(doc)
    if (error) return res.status(404).json({ success: false, error })

    const parsed = await pdfParse(buffer)
    return res.json({ success: true, plainText: parsed.text || '' })
  } catch (err) {
    console.error('Error extrayendo texto de PDF:', err)
    return res.status(500).json({ success: false, error: err.message || 'Error interno' })
  }
})

// DELETE: eliminar un documento específico (del propio usuario)
router.delete('/:docId', async (req, res) => {
  try {
    const userId = getUserId(req)
    const { docId } = req.params

    const result = await pool.query('SELECT historial_medico_docs FROM app.users WHERE id=$1', [userId])
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' })
    }

    const docs = result.rows[0].historial_medico_docs || []
    const docToDelete = docs.find(d => String(d.id) === String(docId))

    if (!docToDelete) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado' })
    }

    // Eliminar el objeto de Storage (si es un doc nuevo con storagePath)
    if (docToDelete.storagePath) {
      try {
        const sb = getSupabaseAdmin()
        const { error } = await sb.storage.from(MEDICAL_DOCS_BUCKET).remove([docToDelete.storagePath])
        if (error) console.warn(`No se pudo borrar el objeto de Storage ${docToDelete.storagePath}:`, error.message)
      } catch (stErr) {
        console.warn('Error borrando de Storage (se procede a limpiar metadato):', stErr.message)
      }
    }

    const nextDocs = docs.filter(d => String(d.id) !== String(docId))

    await pool.query('UPDATE app.users SET historial_medico_docs=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(nextDocs), userId])

    return res.json({ success: true, message: 'Documento eliminado correctamente', docs: nextDocs })
  } catch (e) {
    console.error('Error en el proceso de eliminación del documento médico:', e)
    return res.status(500).json({ success: false, error: e.message || 'Error interno del servidor' })
  }
})

export default router
