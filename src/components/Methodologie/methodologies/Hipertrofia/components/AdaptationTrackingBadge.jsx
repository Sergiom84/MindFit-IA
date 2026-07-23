import React from "react";
import { Loader, CheckCircle, Calendar } from "lucide-react";

export default function AdaptationTrackingBadge({
  loading,
  hasBlock,
  block,
  readyForTransition,
  onReload,
  onTransition
}) {
  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800/70 border border-gray-700 rounded-lg text-sm text-gray-300">
        <Loader className="w-4 h-4 animate-spin text-purple-300" />
        Cargando adaptación…
      </div>
    );
  }

  if (!hasBlock) return null;

  return (
    <div className="inline-flex items-center gap-3 px-4 py-3 bg-purple-900/20 border border-purple-600/40 rounded-lg text-sm text-purple-100">
      <Calendar className="w-4 h-4 text-purple-300" />
      <div className="flex flex-col">
        <span className="font-semibold text-purple-100">
          Adaptación activa ({block?.blockType === 'half_body' ? 'Half Body' : 'Full Body'})
        </span>
        <span className="text-xs text-purple-200">
          Semanas: {block?.weeksTracked ?? block?.durationWeeks ?? "-"} / {block?.durationWeeks ?? "-"}
        </span>
        {readyForTransition ? (
          <span className="text-xs text-green-300 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Listo para D1–D5
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onReload}
          className="px-2 py-1 bg-gray-800/60 border border-gray-700 rounded text-xs text-gray-200 hover:border-gray-500"
        >
          Recargar
        </button>
        {readyForTransition && (
          <button
            onClick={onTransition}
            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
          >
            Transicionar
          </button>
        )}
      </div>
    </div>
  );
}
