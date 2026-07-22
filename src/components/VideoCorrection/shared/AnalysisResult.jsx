import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  Play, 
  Pause,
  Image as ImageIcon
} from 'lucide-react';

export default function AnalysisResult({ 
  result, 
  onSpeakCorrections, 
  onStopSpeaking 
}) {
  if (!result) return null;
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  return (
    <Card className={`${cardBase} border-l-2 border-l-yellow-400/40 mb-8`}>
      <CardHeader>
        <CardTitle className="text-white flex items-center font-urbanist">
          <Brain className="w-5 h-5 mr-2 text-yellow-300" /> Resultado Análisis IA
        </CardTitle>
        <CardDescription className="text-gray-300/70">
          Feedback estructurado generado por el modelo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Información general */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 border-l-2 border-l-yellow-400/40">
            <div className="text-xs uppercase tracking-wide text-yellow-300">Ejercicio</div>
            <div className="text-lg font-semibold text-white">{result.ejercicio || '—'}</div>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 border-l-2 border-l-emerald-400/40">
            <div className="text-xs uppercase tracking-wide text-emerald-300">Confianza</div>
            <div className="text-lg font-semibold text-white">{result.confianza_global || result.metadata?.confidence || '—'}</div>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 border-l-2 border-l-sky-400/40">
            <div className="text-xs uppercase tracking-wide text-sky-300">Archivos</div>
            <div className="text-lg font-semibold text-white">{result.metadata?.imageCount ?? result.metadata?.videoCount ?? '—'}</div>
          </div>
        </div>

        {/* Correcciones Prioritarias */}
        {Array.isArray(result.correcciones_priorizadas) && result.correcciones_priorizadas.length > 0 && (
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center justify-between font-urbanist">
              <div className="flex items-center">
                <Target className="w-4 h-4 mr-2 text-yellow-300" /> Correcciones Prioritarias
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={onSpeakCorrections}
                  size="sm"
                  className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_10px_24px_-16px_rgba(250,204,21,0.8)]"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Escuchar
                </Button>
                <Button
                  onClick={onStopSpeaking}
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-gray-200 hover:bg-white/10"
                >
                  <Pause className="w-4 h-4 mr-1" />
                  Detener
                </Button>
              </div>
            </h4>
            <ul className="space-y-3">
              {result.correcciones_priorizadas.map((c, idx) => (
                <li key={idx} className="p-3 rounded border border-white/10 bg-white/5 border-l-2 border-l-yellow-400/40">
                  <div className="flex flex-wrap gap-2 items-center mb-1">
                    <Badge className={c.prioridad === 'alta' ? 'bg-red-500/90' : c.prioridad === 'media' ? 'bg-yellow-500/90 text-black' : 'bg-emerald-500/90'}>
                      {c.prioridad || '—'}
                    </Badge>
                    {c.cue && <span className="text-xs text-gray-400">Cue: {c.cue}</span>}
                  </div>
                  <div className="text-sm text-gray-200"><strong>Acción:</strong> {c.accion || '—'}</div>
                  {c.fundamento && (
                    <div className="text-xs text-gray-400 mt-1"><strong>Por qué:</strong> {c.fundamento}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Errores detectados */}
        {Array.isArray(result.errores_detectados) && result.errores_detectados.length > 0 && (
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
              <AlertTriangle className="w-4 h-4 mr-2 text-red-300" /> Errores Detectados
            </h4>
            <ul className="space-y-3">
              {result.errores_detectados.map((e, idx) => (
                <li key={idx} className="p-3 rounded border border-white/10 bg-white/5 border-l-2 border-l-red-400/40">
                  <div className="flex flex-wrap gap-2 items-center mb-1">
                    <Badge className="bg-red-500/80">{e.severidad || '—'}</Badge>
                    <Badge variant="outline" className="border-red-400/70 text-red-300 text-xs">{e.tipo || '—'}</Badge>
                    {e.zona && <span className="text-xs text-gray-300">{e.zona}</span>}
                  </div>
                  <div className="text-sm text-gray-200">{e.descripcion || '—'}</div>
                  {e.impacto && <div className="text-xs text-gray-400 mt-1">Impacto: {e.impacto}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Métricas */}
        {result.metricas && (
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
              <TrendingUp className="w-4 h-4 mr-2 text-emerald-300" /> Métricas
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {Object.entries(result.metricas).map(([k,v]) => {
                // Manejar valores complejos
                let displayValue;
                if (v === null || v === undefined) {
                  displayValue = '—';
                } else if (typeof v === 'object') {
                  // Si es un objeto, intentar extraer información útil
                  if (v.valor !== undefined) {
                    displayValue = `${v.valor}${v.unidad ? ' ' + v.unidad : ''}`;
                  } else if (v.value !== undefined) {
                    displayValue = `${v.value}${v.unit ? ' ' + v.unit : ''}`;
                  } else if (v.grados !== undefined) {
                    displayValue = `${v.grados}°`;
                  } else if (v.porcentaje !== undefined) {
                    displayValue = `${v.porcentaje}%`;
                  } else {
                    displayValue = JSON.stringify(v);
                  }
                } else if (typeof v === 'number') {
                  displayValue = Number.isInteger(v) ? v.toString() : v.toFixed(1);
                } else {
                  displayValue = String(v);
                }

                return (
                  <div key={k} className="p-2 rounded bg-white/5 border border-white/10 border-l-2 border-l-emerald-400/40">
                    <div className="text-xs uppercase tracking-wide text-emerald-300">{k.replace(/_/g,' ')}</div>
                    <div className="text-white font-semibold">{displayValue}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Puntos clave & Riesgos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.isArray(result.puntos_clave) && result.puntos_clave.length > 0 && (
            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
                <CheckCircle className="w-4 h-4 mr-2 text-emerald-300" /> Puntos Clave
              </h4>
              <ul className="space-y-2 text-sm">
                {result.puntos_clave.map((p,idx)=>(
                  <li key={idx} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" /> 
                    <span className="text-gray-300">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(result.riesgos_potenciales) && result.riesgos_potenciales.length > 0 && (
            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
                <AlertTriangle className="w-4 h-4 mr-2 text-yellow-300" /> Riesgos Potenciales
              </h4>
              <ul className="space-y-2 text-sm">
                {result.riesgos_potenciales.map((p,idx)=>(
                  <li key={idx} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" /> 
                    <span className="text-gray-300">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Feedback de Voz sugerido */}
        {Array.isArray(result.feedback_voz) && result.feedback_voz.length > 0 && (
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center justify-between font-urbanist">
              <div className="flex items-center">
                <Play className="w-4 h-4 mr-2 text-purple-300" /> Cues Verbales
              </div>
              <Button
                onClick={onSpeakCorrections}
                size="sm"
                className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white"
              >
                <Play className="w-4 h-4 mr-1" />
                Reproducir
              </Button>
            </h4>
            <div className="flex flex-wrap gap-2">
              {result.feedback_voz.map((c,idx)=>(
                <Badge key={idx} className="bg-purple-500/80 text-white border border-purple-300/30">{c}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Overlay recomendado */}
        {Array.isArray(result.overlay_recomendado) && result.overlay_recomendado.length > 0 && (
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
              <ImageIcon className="w-4 h-4 mr-2 text-sky-300" /> Overlays Recomendados
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {result.overlay_recomendado.map((o,idx)=>{
                if (typeof o === 'string') {
                  return (
                    <span key={idx} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-sky-200">{o}</span>
                  )
                }
                const tipo = o.tipo || o.type || 'overlay'
                const range = (o.from != null && o.to != null) ? ` (${o.from}-${o.to})` : ''
                return (
                  <span key={idx} title={JSON.stringify(o)} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-sky-200">{`${tipo}${range}`}</span>
                )
              })}
            </div>
          </div>
        )}

        {/* Siguiente paso */}
        {result.siguiente_paso && (
          <div className="p-4 rounded border border-white/10 bg-white/5 border-l-2 border-l-teal-400/40">
            <div className="text-xs uppercase tracking-wide text-teal-300 mb-1">Siguiente Paso</div>
            <div className="text-sm text-teal-100">{result.siguiente_paso}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
