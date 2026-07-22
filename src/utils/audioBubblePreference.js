/**
 * Preferencia de visibilidad de la burbuja flotante de música (AudioBubble).
 *
 * Es una preferencia local del dispositivo (localStorage), pensada para
 * poder ocultar la burbuja durante las pruebas. Por defecto está OCULTA:
 * solo se muestra si el usuario la activa explícitamente en Perfil → Música.
 */

export const AUDIO_BUBBLE_PREF_KEY = 'audioBubbleEnabled';
export const AUDIO_BUBBLE_PREF_EVENT = 'audioBubblePrefChange';

// Por defecto OCULTA: devuelve true solo si el valor guardado es exactamente 'true'.
export function isAudioBubbleEnabled() {
  try {
    return localStorage.getItem(AUDIO_BUBBLE_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAudioBubbleEnabled(enabled) {
  try {
    localStorage.setItem(AUDIO_BUBBLE_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    /* almacenamiento no disponible: no persiste, pero igual notificamos */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUDIO_BUBBLE_PREF_EVENT, { detail: !!enabled }));
  }
}
