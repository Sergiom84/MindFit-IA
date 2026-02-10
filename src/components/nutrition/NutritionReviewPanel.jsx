import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function formatLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIsoDateEs(iso) {
  if (!iso || typeof iso !== "string" || !iso.includes("-")) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatPercent(value, digits = 0, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const showPlus = !!options?.showPlus;
  const sign = showPlus && n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function toneFromWeeklyStatus(status) {
  if (status === "ok") return "ok";
  if (status === "slow") return "warn";
  if (status === "fast") return "bad";
  return "neutral";
}

function toneFromBiweeklyStatus(status) {
  if (status === "recommend_adjustment") return "info";
  if (status === "ok") return "ok";
  if (status === "blocked_by_noise" || status === "compliance_low") return "warn";
  if (status === "insufficient" || status === "pending") return "neutral";
  return "neutral";
}

function StatusPill({ tone = "neutral", children }) {
  const classes = {
    ok: "bg-emerald-500/15 text-emerald-100 border-emerald-400/30",
    warn: "bg-amber-500/15 text-amber-100 border-amber-400/30",
    bad: "bg-red-500/15 text-red-100 border-red-400/30",
    info: "bg-sky-500/15 text-sky-100 border-sky-400/30",
    neutral: "bg-white/5 text-gray-200 border-white/10",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classes[tone] || classes.neutral}`}
    >
      {children}
    </span>
  );
}

async function fetchJsonWithAuth(url, options = {}) {
  const token = localStorage.getItem("token") || localStorage.getItem("authToken");

  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = data?.error || data?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

const DAY_TYPE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "libre", label: "Día libre" },
  { value: "cheat", label: "Cheat" },
  { value: "diet_break", label: "Diet break" },
];

const NOISE_FLAG_OPTIONS = [
  { value: "viaje", label: "Viaje" },
  { value: "enfermedad", label: "Enfermedad/medicación" },
  { value: "semana_caotica", label: "Semana caótica" },
];

export default function NutritionReviewPanel() {
  const todayIso = useMemo(() => formatLocalIsoDate(new Date()), []);

  const [review, setReview] = useState(null);
  const [daily, setDaily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formCalories, setFormCalories] = useState("");
  const [formDayType, setFormDayType] = useState("normal");
  const [formNoiseFlags, setFormNoiseFlags] = useState([]);

  const [busySave, setBusySave] = useState(false);
  const [busyAdjust, setBusyAdjust] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewRes, dailyRes] = await Promise.all([
        fetchJsonWithAuth("/api/nutrition-v2/review", { method: "GET" }),
        fetchJsonWithAuth(`/api/nutrition-v2/daily/${todayIso}`, { method: "GET" }),
      ]);

      setReview(reviewRes);

      const day = dailyRes?.daily || null;
      setDaily(day);

      setFormCalories(day?.calories === null || day?.calories === undefined ? "" : String(day.calories));
      setFormDayType(day?.day_type || "normal");
      setFormNoiseFlags(Array.isArray(day?.noise_flags) ? day.noise_flags : []);
    } catch (e) {
      setError(e?.message || "Error al cargar revisión");
      setReview(null);
      setDaily(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleNoiseFlag = (flag) => {
    setFormNoiseFlags((prev) => {
      const set = new Set(Array.isArray(prev) ? prev : []);
      if (set.has(flag)) set.delete(flag);
      else set.add(flag);
      return [...set];
    });
  };

  const handleSaveDaily = async () => {
    setFlash(null);
    setBusySave(true);
    try {
      const calories = formCalories.trim() === "" ? null : Number(formCalories);
      const payload = {
        date: todayIso,
        calories,
        day_type: formDayType,
        noise_flags: formNoiseFlags,
      };

      const res = await fetchJsonWithAuth("/api/nutrition-v2/daily", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setDaily(res?.daily || null);
      setFlash({ type: "success", message: "Registro guardado. Esto cuenta para adherencia de datos." });

      // Refresca review (adherencia/ruido pueden cambiar).
      const nextReview = await fetchJsonWithAuth("/api/nutrition-v2/review", { method: "GET" });
      setReview(nextReview);
    } catch (e) {
      setFlash({ type: "error", message: e?.message || "No se pudo guardar el registro" });
    } finally {
      setBusySave(false);
    }
  };

  const handleApplyRecommended = async () => {
    if (!review?.biweekly_review || review.biweekly_review.status !== "recommend_adjustment") return;
    const delta = review.biweekly_review.recommended_delta_kcal;
    if (!Number.isFinite(delta) || delta === 0) return;

    const ok = window.confirm(
      `Aplicar ajuste recomendado (${delta > 0 ? "+" : ""}${delta} kcal/día)?\n\nEsto regenerará tu plan activo para que todo lo que ves en pantalla sea coherente.`
    );
    if (!ok) return;

    setFlash(null);
    setBusyAdjust(true);
    try {
      const metrics = {
        date: review.date,
        mode: review.mode,
        phase: review.phase,
        windows: review.windows,
        metrics: review.metrics,
        weekly_review: review.weekly_review,
        biweekly_review: review.biweekly_review,
      };

      const res = await fetchJsonWithAuth("/api/nutrition-v2/adjustments/apply", {
        method: "POST",
        body: JSON.stringify({
          mode: "quincenal",
          source: "manual",
          delta_kcal: delta,
          reason: "Ajuste aplicado desde revisión quincenal (UI)",
          metrics,
        }),
      });

      setFlash({
        type: "success",
        message: `Ajuste aplicado: ${res?.delta_kcal > 0 ? "+" : ""}${res?.delta_kcal} kcal (nuevo objetivo: ${res?.new_kcal} kcal).`,
      });

      await load();
    } catch (e) {
      setFlash({ type: "error", message: e?.message || "No se pudo aplicar el ajuste" });
    } finally {
      setBusyAdjust(false);
    }
  };

  const handleUndoLast = async () => {
    const ok = window.confirm("Deshacer el último ajuste de kcal? (ventana 24h)");
    if (!ok) return;

    setFlash(null);
    setBusyAdjust(true);
    try {
      const res = await fetchJsonWithAuth("/api/nutrition-v2/adjustments/undo-last", {
        method: "POST",
        body: JSON.stringify({}),
      });

      setFlash({
        type: "success",
        message: `Ajuste deshecho. Restaurado: ${res?.restored_kcal} kcal.`,
      });

      await load();
    } catch (e) {
      setFlash({ type: "error", message: e?.message || "No se pudo deshacer el ajuste" });
    } finally {
      setBusyAdjust(false);
    }
  };

  const cardBase =
    "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg text-white";

  if (loading) {
    return (
      <Card className={cardBase}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-500/20 border-red-500/40 text-red-100">
        <p className="font-semibold">Revisión</p>
        <p className="text-sm">{error}</p>
      </Alert>
    );
  }

  if (!review?.success) {
    return (
      <Card className={cardBase}>
        <CardContent className="p-6">
          <Alert className="bg-white/5 border-white/10 text-gray-200">
            <p className="font-semibold">Revisión</p>
            <p className="text-sm">{review?.error || "No se pudo cargar la revisión"}</p>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const weekly = review.weekly_review || {};
  const biweekly = review.biweekly_review || {};
  const adherence = review.metrics?.adherence || {};
  const compliance = review.metrics?.compliance || {};
  const noise = review.metrics?.noise || {};
  const lastAction = review.last_adjustment_action || null;

  const showApply = biweekly.status === "recommend_adjustment" && biweekly.eligible_now;
  const showUndo = !!lastAction && lastAction.undo_available;

  return (
    <div className="space-y-4">
      <Card className={`${cardBase} border-l-2 border-l-sky-400/30`}>
        <CardHeader>
          <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>🧭 Revisión (semanal + quincenal)</span>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="neutral">Hoy: {formatIsoDateEs(review.date)}</StatusPill>
              <StatusPill tone={review.mode === "fino" ? "ok" : "neutral"}>
                Modo {review.mode === "fino" ? "FINO" : "SIMPLE"}
              </StatusPill>
              <StatusPill tone="neutral">Fase: {review.phase}</StatusPill>
              <StatusPill tone="neutral">Objetivo: {review.plan?.kcal_objetivo} kcal</StatusPill>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent>
          {flash && (
            <Alert
              className={
                flash.type === "success"
                  ? "bg-emerald-500/10 border-emerald-400/40 text-emerald-100 mb-4"
                  : "bg-red-500/20 border-red-500/40 text-red-100 mb-4"
              }
            >
              <p className="text-sm font-semibold">{flash.message}</p>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="font-semibold">Revisión semanal</p>
                <StatusPill tone={toneFromWeeklyStatus(weekly.status)}>{weekly.label || weekly.status}</StatusPill>
              </div>
              <p className="text-sm text-gray-200">{weekly.message || "-"}</p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-300">
                <div>
                  <p className="text-gray-400">Peso medio prev. 7d</p>
                  <p className="font-semibold">{formatNumber(review.windows?.prev7?.avg_weight, 2)} kg</p>
                </div>
                <div>
                  <p className="text-gray-400">Peso medio últimos 7d</p>
                  <p className="font-semibold">{formatNumber(review.windows?.curr7?.avg_weight, 2)} kg</p>
                </div>
                <div>
                  <p className="text-gray-400">Ritmo</p>
                  <p className="font-semibold">{formatPercent(review.metrics?.rate_per_week, 2, { showPlus: true })}/sem</p>
                </div>
                <div>
                  <p className="text-gray-400">Pesajes 14d</p>
                  <p className="font-semibold">{review.windows?.last14?.weigh_ins ?? "-"}</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="font-semibold">Revisión quincenal</p>
                <StatusPill tone={toneFromBiweeklyStatus(biweekly.status)}>{biweekly.status}</StatusPill>
              </div>
              <p className="text-sm text-gray-200">{biweekly.message || "-"}</p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-300">
                <div>
                  <p className="text-gray-400">Elegible</p>
                  <p className="font-semibold">
                    {biweekly.eligible_now ? "Sí" : "No"}{" "}
                    {biweekly.next_eligible_at ? `(desde ${formatIsoDateEs(biweekly.next_eligible_at)})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Registro (14d)</p>
                  <p className="font-semibold">
                    {adherence.registered_days ?? "-"} / {adherence.total_days ?? "-"} ({formatPercent(adherence.percent, 0)})
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Compliance kcal</p>
                  <p className="font-semibold">
                    {compliance.percent === null ? "-" : `${formatPercent(compliance.percent, 0)} (${compliance.hit_days}/${compliance.available_days})`}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Ruido</p>
                  <p className="font-semibold">
                    {noise.active ? `Activo (hasta ${formatIsoDateEs(noise.blocked_until)})` : "No"}
                  </p>
                </div>
              </div>

              {showApply && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Button
                    onClick={handleApplyRecommended}
                    disabled={busyAdjust}
                    className="bg-sky-500 hover:bg-sky-500/90 text-white"
                  >
                    {busyAdjust ? "Aplicando..." : `Aplicar ajuste (${biweekly.recommended_delta_kcal > 0 ? "+" : ""}${biweekly.recommended_delta_kcal} kcal)`}
                  </Button>
                  <p className="text-xs text-gray-300">
                    Se regenerará el plan activo para evitar incoherencias.
                  </p>
                </div>
              )}

              {lastAction && (
                <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-semibold">Último ajuste</p>
                    <StatusPill tone={showUndo ? "warn" : "neutral"}>
                      {showUndo ? "Deshacer disponible (24h)" : "Sin deshacer"}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-gray-300 mt-1">
                    {lastAction.delta_kcal > 0 ? "+" : ""}{lastAction.delta_kcal} kcal · {lastAction.previous_kcal} → {lastAction.new_kcal} kcal
                    {lastAction.undo_expires_at ? ` · vence ${new Date(lastAction.undo_expires_at).toLocaleString("es-ES")}` : ""}
                  </p>
                  {showUndo && (
                    <div className="mt-2">
                      <Button onClick={handleUndoLast} disabled={busyAdjust} variant="outline" className="border-white/15 text-white hover:bg-white/10">
                        {busyAdjust ? "Deshaciendo..." : "Deshacer último ajuste"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-300">
            <p className="font-semibold text-gray-200">Nota rápida</p>
            <p>
              Para entrar en modo FINO (autoajustes cada 14 días) necesitas completar datos: al menos{" "}
              <span className="font-semibold">80% días con registro</span> (kcal o día libre/cheat/diet break) y{" "}
              <span className="font-semibold">pesajes suficientes</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
        <CardHeader>
          <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>⚡ Registro rápido (hoy)</span>
            <StatusPill tone={daily ? "neutral" : "neutral"}>{formatIsoDateEs(todayIso)}</StatusPill>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-200 font-semibold">Kcal del día</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ej. 2100"
                value={formCalories}
                onChange={(e) => setFormCalories(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400"
              />
              <p className="text-xs text-gray-400">
                Con poner el total de kcal ya cuenta como “día registrado”.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-200 font-semibold">Tipo de día</label>
              <select
                value={formDayType}
                onChange={(e) => setFormDayType(e.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60"
              >
                {DAY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                “Día libre/cheat/diet break” también cuenta para adherencia de datos.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-200 font-semibold">Banderas de ruido</p>
              <div className="flex flex-wrap gap-2">
                {NOISE_FLAG_OPTIONS.map((opt) => {
                  const active = formNoiseFlags.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleNoiseFlag(opt.value)}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                        active
                          ? "bg-amber-500/15 border-amber-400/40 text-amber-100"
                          : "bg-white/5 border-white/10 text-gray-200/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                Si marcas ruido, bloqueamos ajustes automáticos 7 días (pero seguimos dando feedback).
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
            <Button
              onClick={handleSaveDaily}
              disabled={busySave}
              className="bg-yellow-400 hover:bg-yellow-300 text-black font-semibold"
            >
              {busySave ? "Guardando..." : "Guardar"}
            </Button>
            <Button onClick={load} disabled={busySave || busyAdjust} variant="outline" className="border-white/15 text-white hover:bg-white/10">
              Recargar revisión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
