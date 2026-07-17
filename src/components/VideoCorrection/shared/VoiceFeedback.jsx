import { alertDialog } from '../../ui/dialogService.jsx';
import React, { useRef, useEffect } from 'react';

export default function VoiceFeedback() {
  const voiceRef = useRef(null);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      const updateVoices = () => {
        const voices = window.speechSynthesis.getVoices() || [];
        const es = voices.find(v => (v.lang || '').toLowerCase().startsWith('es'));
        voiceRef.current = es || voices[0] || null;
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) {
      alertDialog('Lo siento, tu navegador no soporta síntesis de voz.');
      return;
    }
    // Cancel any ongoing speech to avoid overlap
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    if (voiceRef.current) utterance.voice = voiceRef.current;

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speakCorrections = (result) => {
    if (!result || !result.correcciones_priorizadas) {
      alertDialog('No hay correcciones disponibles para reproducir.');
      return;
    }

    let textToSpeak = 'Correcciones principales: ';

    result.correcciones_priorizadas.forEach((correction, index) => {
      const accion = typeof correction === 'string' ? correction : (correction.accion || '');
      if (accion) textToSpeak += `${index + 1}. ${accion}. `;
    });

    const fv = result.feedback_voz;
    if (Array.isArray(fv) && fv.length > 0) {
      textToSpeak += 'Indicaciones clave: ' + fv.join('. ') + '.';
    } else if (typeof fv === 'string' && fv.trim()) {
      textToSpeak += 'Indicaciones clave: ' + fv;
    }

    speakText(textToSpeak);
  };

  return {
    speakText,
    stopSpeaking,
    speakCorrections
  };
}