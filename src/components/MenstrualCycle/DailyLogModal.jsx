import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Droplet, Frown, Moon, X, Zap } from "lucide-react";

const DEFAULT_FORM = {
  is_period_day: false,
  energy_level: 3,
  pain_level: 1,
  sleep_quality: 3,
  notes: "",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const SliderInput = ({
  label,
  icon: Icon,
  value,
  onChange,
  colorClasses,
  labels = ["Muy bajo", "Bajo", "Normal", "Alto", "Muy alto"],
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${colorClasses?.icon || "text-pink-300"}`} />
        <span className="text-sm text-gray-300/80">{label}</span>
      </div>
      <span className="text-xs text-gray-400/70">{labels[value - 1]}</span>
    </div>
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`flex-1 h-8 rounded transition-all ${
            level <= value
              ? colorClasses?.active || "bg-pink-500/70 hover:bg-pink-500"
              : "bg-white/5 border border-white/10 hover:bg-white/10"
          }`}
        />
      ))}
    </div>
  </div>
);

const DailyLogModal = ({ isOpen, date, onClose, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [log, setLog] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const title = useMemo(() => {
    if (!date) return "Registro diario";
    try {
      return new Date(date).toLocaleDateString("es-ES", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return date;
    }
  }, [date]);

  useEffect(() => {
    if (!isOpen || !date) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`/api/menstrual-cycle/log/${date}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("No se pudo cargar el registro.");
        const data = await resp.json();
        const serverLog = data?.log || null;
        setLog(serverLog);
        setFormData({
          is_period_day: Boolean(serverLog?.is_period_day),
          energy_level: clamp(Number(serverLog?.energy_level ?? DEFAULT_FORM.energy_level), 1, 5),
          pain_level: clamp(Number(serverLog?.pain_level ?? DEFAULT_FORM.pain_level), 1, 5),
          sleep_quality: clamp(Number(serverLog?.sleep_quality ?? DEFAULT_FORM.sleep_quality), 1, 5),
          notes: String(serverLog?.notes ?? DEFAULT_FORM.notes),
        });
      } catch (err) {
        setError(err?.message || "Error cargando el registro.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOpen, date]);

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        log_date: date,
        is_period_day: formData.is_period_day,
        energy_level: formData.energy_level,
        pain_level: formData.pain_level,
        sleep_quality: formData.sleep_quality,
        notes: formData.notes?.trim() || null,
      };
      if (!payload.notes) delete payload.notes;

      const resp = await fetch("/api/menstrual-cycle/log", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error("No se pudo guardar el registro.");
      const data = await resp.json();
      setLog(data?.log || log);
      onSaved?.(data?.log || null);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Error guardando el registro.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-lg bg-neutral-900/80 rounded-2xl border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white font-urbanist">{title}</h3>
                <p className="text-xs text-gray-400/70">
                  {log?.synthetic ? "Periodo activo detectado (registro sintético)" : "Edita tu registro diario"}
                </p>
              </div>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 text-sm text-rose-200 bg-rose-500/10 border border-rose-400/20 rounded-lg p-3">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-pink-400 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, is_period_day: !prev.is_period_day }))}
                  className={`w-full p-4 rounded-lg border transition-all flex items-center justify-center gap-3 ${
                    formData.is_period_day
                      ? "bg-white/5 border-rose-400/50 text-rose-200"
                      : "bg-white/5 border-white/10 text-gray-300/80 hover:border-white/20"
                  }`}
                >
                  <Droplet className={`w-5 h-5 ${formData.is_period_day ? "fill-current" : ""}`} />
                  <span className="font-medium">{formData.is_period_day ? "Día de periodo" : "Marcar día de periodo"}</span>
                </button>

                <SliderInput
                  label="Nivel de energía"
                  icon={Zap}
                  value={formData.energy_level}
                  onChange={(v) => setFormData((prev) => ({ ...prev, energy_level: v }))}
                  labels={["Agotada", "Baja", "Normal", "Buena", "Excelente"]}
                  colorClasses={{ icon: "text-yellow-300", active: "bg-yellow-500/70 hover:bg-yellow-500" }}
                />

                <SliderInput
                  label="Dolor/Molestias"
                  icon={Frown}
                  value={formData.pain_level}
                  onChange={(v) => setFormData((prev) => ({ ...prev, pain_level: v }))}
                  labels={["Ninguno", "Leve", "Moderado", "Fuerte", "Muy fuerte"]}
                  colorClasses={{ icon: "text-rose-300", active: "bg-red-500/70 hover:bg-red-500" }}
                />

                <SliderInput
                  label="Calidad del sueño"
                  icon={Moon}
                  value={formData.sleep_quality}
                  onChange={(v) => setFormData((prev) => ({ ...prev, sleep_quality: v }))}
                  labels={["Muy mal", "Mal", "Regular", "Bien", "Excelente"]}
                  colorClasses={{ icon: "text-sky-300", active: "bg-blue-500/70 hover:bg-blue-500" }}
                />

                <div className="space-y-2">
                  <label className="text-sm text-gray-300/80">Notas</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-400/40"
                    placeholder="Dolor, antojos, entrenamiento, estado general…"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black rounded-lg font-semibold hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_12px_30px_-18px_rgba(244,114,182,0.7)]"
                >
                  {saving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Guardar registro
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DailyLogModal;

