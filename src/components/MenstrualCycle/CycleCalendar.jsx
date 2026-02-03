import { ChevronLeft, ChevronRight, Droplet, Zap } from "lucide-react";

const PHASE_STYLES = {
  menstrual: {
    cell: "bg-red-500/15 text-red-100 border-red-400/30 hover:bg-red-500/20",
    legend: "bg-red-500/30",
    label: "Menstrual",
  },
  follicular: {
    cell: "bg-emerald-500/15 text-emerald-100 border-emerald-400/30 hover:bg-emerald-500/20",
    legend: "bg-emerald-500/30",
    label: "Folicular",
  },
  ovulation: {
    cell: "bg-yellow-500/15 text-yellow-100 border-yellow-400/30 hover:bg-yellow-500/20",
    legend: "bg-yellow-500/30",
    label: "Ovulación",
  },
  luteal: {
    cell: "bg-orange-500/15 text-orange-100 border-orange-400/30 hover:bg-orange-500/20",
    legend: "bg-orange-500/30",
    label: "Lútea",
  },
};

const normalizeLogDate = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.split("T")[0];
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).split("T")[0];
};

const getPhaseForDate = ({ dateStr, config, log, mode }) => {
  if (log?.is_period_day) return "menstrual";
  if (mode !== "phase") return null;

  const lastBleedStart = config?.last_bleed_start_date || config?.last_period_start;
  if (!lastBleedStart) return null;

  const cycleLength = config?.cycle_length_days || config?.cycle_length || 28;
  const bleedLength = config?.bleed_length_days || config?.period_length || 5;
  const lutealLength = config?.luteal_length_days || 14;
  const confidence = config?.cycle_confidence || "low";

  if (confidence === "low") return null;

  const start = new Date(lastBleedStart);
  const d = new Date(dateStr);
  const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24)) + 1;
  if (!Number.isFinite(diffDays) || diffDays < 1) return null;

  let cycleDay = diffDays % cycleLength;
  if (cycleDay === 0) cycleDay = cycleLength;

  const ovulationDay = cycleLength - lutealLength;
  const window = confidence === "high" ? 1 : 2;
  const ovulationStart = ovulationDay - window;
  const ovulationEnd = ovulationDay + window;
  const lutealLateStart = cycleLength - 4;

  if (cycleDay <= bleedLength) return "menstrual";
  if (cycleDay >= lutealLateStart) return "luteal";
  if (cycleDay >= ovulationStart && cycleDay <= ovulationEnd) return "ovulation";
  if (cycleDay < ovulationStart) return "follicular";
  return "luteal";
};

const generateCalendarDays = ({ selectedMonth, calendarLogs }) => {
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();

  const logsByDate = new Map(
    (calendarLogs || [])
      .map((log) => [normalizeLogDate(log.log_date), log])
      .filter(([k]) => Boolean(k))
  );

  const days = [];

  for (let i = 0; i < startingDay; i++) {
    days.push({ day: null, log: null, date: null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const log = logsByDate.get(dateStr) || null;
    days.push({ day, log, date: dateStr });
  }

  return days;
};

const CycleCalendar = ({ selectedMonth, onChangeMonth, calendarLogs, config, onSelectDate, mode }) => {
  const days = generateCalendarDays({ selectedMonth, calendarLogs });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))}
          className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-semibold font-urbanist">
          {selectedMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
        </h3>

        <button
          type="button"
          onClick={() => onChangeMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))}
          className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => (
          <div key={day} className="text-center text-xs text-gray-400/80 py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((item, idx) => {
          const phase = item.day ? getPhaseForDate({ dateStr: item.date, config, log: item.log, mode }) : null;
          const phaseStyle = phase ? PHASE_STYLES[phase]?.cell : null;

          const baseClasses = "aspect-square rounded-lg flex flex-col items-center justify-center text-sm border transition-colors";
          const emptyClasses = "border-transparent";
          const defaultClasses = "bg-white/5 text-gray-300/70 border-white/10 hover:bg-white/10";

          const classes = item.day
            ? `${baseClasses} ${phaseStyle || defaultClasses}`
            : `${baseClasses} ${emptyClasses}`;

          return (
            <button
              key={idx}
              type="button"
              disabled={!item.day}
              onClick={() => item.day && onSelectDate?.({ date: item.date, log: item.log, phase })}
              className={`${classes} ${item.day ? "cursor-pointer" : "cursor-default"}`}
            >
              {item.day && (
                <>
                  <span className="font-medium">{item.day}</span>
                  {item.log && (
                    <div className="flex gap-0.5 mt-1">
                      {item.log.is_period_day && <Droplet className="w-2 h-2 fill-current text-red-400" />}
                      {item.log.energy_level !== undefined && item.log.energy_level !== null && (
                        <Zap className="w-2 h-2 text-yellow-300" />
                      )}
                    </div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {mode === "phase" && (
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-300/70">
          {["menstrual", "follicular", "ovulation", "luteal"].map((phase) => (
            <div key={phase} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${PHASE_STYLES[phase].legend}`} />
              <span>{PHASE_STYLES[phase].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CycleCalendar;
