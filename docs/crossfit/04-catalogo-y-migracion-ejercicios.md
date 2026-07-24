# Catalogo canonico y plan de migracion

Estado: implementación preparada, sin aplicar. Fuente viva: 120 filas de `app."Ejercicios_CrossFit"` reconsultadas read-only el 2026-07-22.

## Artefactos

- [`catalogo_crossfit_auditoria_120.csv`](./data/catalogo_crossfit_auditoria_120.csv): las 120 filas, una por una, con accion, canonico y hallazgo.
- [`catalogo_crossfit_snapshot_120.csv`](./data/catalogo_crossfit_snapshot_120.csv): snapshot documental read-only de todos los campos reales, incluidas las 120 instrucciones existentes; no es un seed.
- [`catalogo_canonico_propuesto.csv`](./data/catalogo_canonico_propuesto.csv): movimientos core y altas necesarias con taxonomia, permisos, scaling, tecnica, cues, errores, contraindicaciones, progresiones, sustituciones, pairing y media.
- [`catalogo_reference_sets.json`](./data/catalogo_reference_sets.json): texto reutilizable y arboles de progresion.
- [`catalogo_operaciones_propuestas.csv`](./data/catalogo_operaciones_propuestas.csv): altas, merges, deprecaciones, backfills, validacion y rollback.

## Hallazgos fila a fila consolidados

- Las 120 instrucciones actuales se conservan como fuente primaria; consejos y errores estan vacios en 120/120.
- Distancia, calorias, intensidad, altura o carga forman parte de la dosis, no de la identidad: row 500/1000/2000, run 400/mile/5k, bike 20/50/100 cal, box 24/20 y cargas fijas se fusionan logicamente.
- `Burpee escalado` y `Burpees RX` son escalas del canonico `burpee`.
- Step-ups 6/23/63 son un movimiento con dose/cadence.
- `is_benchmark` no pertenece al movimiento. Benchmarks se modelan como WOD versionado.
- Los 19 registros Elite se conservan por historia, pero se excluyen del generador core. No se borran.
- Se proponen altas funcionales: strict press, bike erg, bear crawl, suitcase/front-rack/sandbag carry, sled pull, med-ball clean y landmine press. Cubren progresiones, equipo y sustituciones sin inflar una lista infinita.

## Modelo futuro

Entidades: `catalog_version`, `movement`, `variant`, `progression_edge`, `substitution_edge`, `movement_rule`, `media_asset`, `benchmark_workout`. Dosis vive en `prescription`, con reps, tiempo, distancia, calorias, carga absoluta/relativa, altura y cadence.

Claves:

- `canonical_id` ASCII estable; nombre es traducible.
- aliases normalizados sin diacriticos para busqueda, pero no son IDs.
- `min_level` es techo de seleccion por complejidad; `skill_prerequisites` manda.
- `media_status`: `missing|existing_unverified|verified_owned|verified_licensed|rejected`.
- `deleted_at` es baja logica; una version activa es inmutable.

## Deduplicacion e idempotencia

1. Normalizar nombre/alias, equipo y patrón.
2. Si cambia solo dosis, mapear al mismo `canonical_id`.
3. Si cambia mecanica o prerequisito, crear variante.
4. Si solo ensena una etapa, marcar `progression`.
5. Si combina movimientos con score propio, marcar `composite` o WOD, no movimiento atomico.
6. Upsert por `(catalog_version, canonical_id)`; hash de contenido evita doble aplicacion.
7. Backfill guarda `source_table/source_id`; reejecucion no duplica.

## Validadores de activacion

- 100 % IDs unicos, campos obligatorios y referencias resolubles.
- cero alias ambiguos dentro del mismo equipo/patron sin disambiguador.
- cero variante activa sin canonico.
- cero sustitucion circular de prioridad igual.
- cada movimiento core con instruccion, >=2 cues, >=2 errores, safety key y al menos una regresion o justificacion.
- toda media `verified_*` con propietario/licencia, checksum y fecha de revision.
- cero URL inventada. `existing_unverified` no se muestra como recurso validado.
- `benchmark_relation` solo referencia entidad benchmark separada.

## Migracion futura

Preparada en `backend/migrations/20260722_crossfit_v2_catalog.sql`, sin ejecutar.
Crea versiones, movimientos, variantes, edges, benchmarks, media y mapping legacy;
activa RLS sobre las tablas nuevas, limita lectura autenticada a la versión activa
y vuelve inmutable el catálogo activo. No modifica la tabla legacy, Elite ni
históricos. `backend/scripts/import-crossfit-v2-catalog.mjs` valida en dry-run y
solo admite `--apply` contra PostgreSQL local con `NODE_ENV=test` y acuse
`EPHEMERAL_ONLY`; carga `draft` y nunca activa.

Resultado reproducible: 92 canónicos, 104 variantes locales heredadas, 236 edges,
120/120 mappings legacy y cero media verificada. Diez IDs Elite huérfanos del
dossier se mapearon como variantes/dosis legacy inactivas al movimiento core más
próximo; no entran en generación. Las variantes heredadas conservan
`human_review_required:true`. `REQUIERE_MIGRACION_AUTORIZADA` para aplicar y
`REQUIERE_VALIDACION_HUMANA` antes de activar. Rollback = conservar tablas y
restaurar puntero; nunca borrar resultados históricos.

## Definition of Done de catalogo

El artefacto queda estructuralmente válido y sin dangling IDs: 92 movimientos,
104 variantes, 236 relaciones y mapping 120/120. Para declarar una versión
activable faltan PostgreSQL efímero con migración/RLS/idempotencia, revisión
humana de variantes/altas y el gate de 10.000 generaciones por nivel.
