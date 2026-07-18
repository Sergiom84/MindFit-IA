// AI-001 (PR 6): extracción de fotogramas de un vídeo EN EL CLIENTE para reutilizar el
// pipeline de imagen del backend (/api/ai/advanced-correction acepta `images` image/*).
// Evita subir el vídeo crudo (que el backend rechaza) y controla tamaño/duración/calidad.

export const FRAME_DEFAULTS = {
  maxFrames: 6, // nº de fotogramas a extraer
  maxDurationSec: 30, // solo se muestrea hasta aquí
  maxSizeMB: 60, // tope de tamaño del vídeo de entrada
  maxWidth: 720, // se reescala a lo ancho como máximo
  jpegQuality: 0.8, // calidad JPEG de cada fotograma
};

/**
 * Extrae fotogramas JPEG uniformemente espaciados de un vídeo.
 * @param {File|Blob} file  fichero de vídeo (type video/*)
 * @param {object} [opts]   overrides de FRAME_DEFAULTS + { signal } para cancelar
 * @param {(p:{done:number,total:number})=>void} [onProgress]
 * @returns {Promise<Blob[]>} fotogramas image/jpeg
 */
export async function extractFramesFromVideo(file, opts = {}, onProgress) {
  const cfg = { ...FRAME_DEFAULTS, ...opts };
  const { signal } = opts;

  if (!file || !(file.type || '').startsWith('video/')) {
    throw new Error('El archivo seleccionado no es un vídeo válido.');
  }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > cfg.maxSizeMB) {
    throw new Error(`El vídeo pesa ${sizeMB.toFixed(1)} MB; el máximo es ${cfg.maxSizeMB} MB.`);
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('Extracción cancelada.');
  };

  try {
    // Esperar metadatos (duración/dimensiones).
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('No se pudo leer el vídeo.'));
    });
    throwIfAborted();

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || duration <= 0) throw new Error('El vídeo no tiene una duración válida.');
    if (!video.videoWidth || !video.videoHeight) throw new Error('El vídeo no tiene dimensiones válidas.');

    const usable = Math.min(duration, cfg.maxDurationSec);
    const n = cfg.maxFrames;
    // Marcas de tiempo uniformes evitando el instante 0 (suele salir en negro).
    const stamps = Array.from({ length: n }, (_, i) => (usable * (i + 1)) / (n + 1));

    const scale = video.videoWidth > cfg.maxWidth ? cfg.maxWidth / video.videoWidth : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');

    const seekTo = (t) => new Promise((resolve, reject) => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked);
      video.onerror = () => reject(new Error('Fallo al desplazar el vídeo.'));
      // Clamp para no quedar fuera de rango (algunos navegadores no emiten seeked al final exacto).
      video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    });

    const frames = [];
    for (let i = 0; i < stamps.length; i += 1) {
      throwIfAborted();
      await seekTo(stamps[i]);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', cfg.jpegQuality));
      if (blob) frames.push(blob);
      onProgress?.({ done: i + 1, total: stamps.length });
    }

    if (!frames.length) throw new Error('No se pudieron extraer fotogramas del vídeo.');
    return frames;
  } finally {
    // Liberar recursos SIEMPRE.
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    try { video.load(); } catch { /* noop */ }
  }
}
