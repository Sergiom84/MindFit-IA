/**
 * Silencia la consola del proceso hijo del runner de tests (side-effect on import).
 *
 * Por qué: node:test ejecuta cada fichero en su propio proceso y multiplexa el
 * stdout/stderr de todos con su canal IPC v8 (structuredClone). Un volumen alto de
 * logs desde un fichero (los módulos de calistenia loguean con profusión al
 * ejercitarse: reEvaluator, logger de single-day, imports de rutas) corrompe
 * intermitentemente el framing del reporte de OTRO fichero, aflorando como
 * "Unable to deserialize cloned data due to invalid or unsupported version".
 *
 * Importar este módulo EL PRIMERO (antes que cualquier módulo de producción) muta la
 * consola antes de que se ejecute el código de import de los demás, cubriendo también
 * el logging de tiempo de importación. node:test reporta los fallos por su propio
 * canal (no por console), así que los asertos siguen siendo visibles.
 */
for (const method of ["log", "info", "warn", "error", "debug"]) {
  console[method] = () => {};
}
