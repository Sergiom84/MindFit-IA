import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';

// 🎨 MethodologyCard (nivel de módulo: referencia estable, sin remontajes).
// Extraído de MethodologiesScreen.jsx (ARCH-002): tarjeta presentacional de una
// metodología. Recibe todo por props; sin estado propio.
export default function MethodologyCard({ methodology, manualActive, onDetails, onSelect }) {
  // Nombre visible (puede diferir del identificador interno `name`).
  const label = methodology.displayName || methodology.name;
  return (
    <Card
      className={`bg-neutral-900/70 border border-white/10 border-l-2 border-l-yellow-400/30 ring-1 ring-white/5 backdrop-blur-lg transition-all duration-300 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] ${
        manualActive
          ? 'hover:border-yellow-400/40 hover:border-l-yellow-400/60 hover:shadow-[0_25px_60px_-45px_rgba(250,204,21,0.35)]'
          : 'hover:border-white/20 hover:border-l-yellow-400/50'
      }`}
      aria-label={`Tarjeta de metodología ${label}`}
    >
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {methodology.icon && <methodology.icon className="w-7 h-7 text-yellow-300" />}
            <h3 className="text-white text-base sm:text-xl font-semibold font-urbanist leading-tight break-words">
              {label}
            </h3>
          </div>
          <span className="text-xs px-2 py-1 border border-white/10 bg-white/5 text-gray-200 rounded">
            {methodology.level}
          </span>
        </div>
        <p className="text-gray-300 mt-2 text-sm">{methodology.description}</p>
      </div>
      <div className="px-4 pb-4 space-y-3">
        <div className="space-y-2">
          {[
            { label: 'Frecuencia', value: methodology.frequency },
            { label: 'Volumen', value: methodology.volume },
            { label: 'Intensidad', value: methodology.intensity }
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-400">{label}:</span>
              <span className="text-white">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 border border-white/10 text-gray-200 hover:bg-white/10 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onDetails(methodology);
            }}
            aria-label={`Ver detalles de ${label}`}
          >
            Ver Detalles
          </Button>
          <Button
            className={`flex-1 ${manualActive
              ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'
              : 'bg-gradient-to-r from-yellow-300/70 via-yellow-400/70 to-amber-500/70 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              // Activar modo manual (si hace falta) y seleccionar en un solo clic.
              onSelect(methodology, !manualActive);
            }}
            aria-label={`Seleccionar metodología ${label}`}
          >
            Seleccionar
          </Button>
        </div>
      </div>
    </Card>
  );
}
