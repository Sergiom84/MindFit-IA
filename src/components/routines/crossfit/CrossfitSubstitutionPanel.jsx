import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

const REASONS = [
  { value: 'pain', label: 'Dolor o molestia' },
  { value: 'technique', label: 'Técnica inestable' },
  { value: 'equipment', label: 'Material no disponible' },
  { value: 'preference', label: 'Otra adaptación' }
];
const PAIN_LOCATIONS = ['hombro', 'codo', 'muneca', 'lumbar', 'cadera', 'rodilla', 'tobillo', 'otra'];

function equipmentList(movement) {
  const raw = movement?.equipamiento ?? movement?.equipment ?? [];
  return (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
}

export default function CrossfitSubstitutionPanel({ movement, onCancel, onSubmit, loading, error }) {
  const [reason, setReason] = useState('pain');
  const [painScore, setPainScore] = useState(3);
  const [painLocation, setPainLocation] = useState('');
  const [techniqueScore, setTechniqueScore] = useState(1);
  const [redFlag, setRedFlag] = useState(false);
  const [equipment, setEquipment] = useState('');

  useEffect(() => {
    setReason('pain');
    setPainScore(3);
    setPainLocation('');
    setTechniqueScore(1);
    setRedFlag(false);
    setEquipment(equipmentList(movement).join(', '));
  }, [movement]);

  const canSubmit = !loading
    && (reason !== 'pain' || painLocation)
    && (reason !== 'equipment' || equipment.trim());

  const submit = () => {
    if (!canSubmit) return;
    const unavailable = reason === 'equipment'
      ? equipment.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    onSubmit({
      reason,
      checkIn: {
        pain: reason === 'pain'
          ? { score: Number(painScore), delta: 0, quality: null, locations: [painLocation] }
          : { score: 0, delta: 0, quality: null, locations: [] },
        technique_score: reason === 'technique' ? Number(techniqueScore) : undefined,
        red_flags: [],
        red_flag: redFlag,
        acute_injury: redFlag
      },
      temporarilyUnavailableEquipment: unavailable
    });
  };

  return (
    <div className="border-t border-yellow-400/20 bg-yellow-400/5 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-yellow-100">
            <ShieldCheck className="h-4 w-4" /> Sustitución segura
          </p>
          <p className="mt-1 text-xs text-gray-400">El servidor conservará el estímulo o bloqueará la propuesta.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Cerrar sustitución" className="text-gray-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mt-3 block text-xs text-gray-300">
        Motivo
        <select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white">
          {REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {reason === 'pain' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-300">
            Dolor (1-4)
            <input type="number" min="1" max="4" value={painScore} onChange={(event) => setPainScore(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-gray-300">
            Zona
            <select value={painLocation} onChange={(event) => setPainLocation(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white">
              <option value="">Selecciona</option>
              {PAIN_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </label>
        </div>
      )}

      {reason === 'technique' && (
        <label className="mt-3 block text-xs text-gray-300">
          Calidad técnica
          <select value={techniqueScore} onChange={(event) => setTechniqueScore(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white">
            <option value="1">1 · Inestable</option>
            <option value="0">0 · Detener movimiento</option>
          </select>
        </label>
      )}

      {reason === 'equipment' && (
        <label className="mt-3 block text-xs text-gray-300">
          Material no disponible, separado por comas
          <input value={equipment} onChange={(event) => setEquipment(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white" />
        </label>
      )}

      <label className="mt-3 flex items-start gap-2 text-xs text-red-100">
        <input type="checkbox" checked={redFlag} onChange={(event) => setRedFlag(event.target.checked)} className="mt-0.5 accent-red-500" />
        Hay lesión aguda o señal de alarma. La app debe detener, no sustituir.
      </label>

      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-lg border border-red-400/20 bg-red-500/10 p-2 text-xs text-red-100">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs text-gray-300">Cancelar</button>
        <button type="button" disabled={!canSubmit} onClick={submit} className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">
          {loading ? 'Validando...' : 'Validar sustitución'}
        </button>
      </div>
    </div>
  );
}
