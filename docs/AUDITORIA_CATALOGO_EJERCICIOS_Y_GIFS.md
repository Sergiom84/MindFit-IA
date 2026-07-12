# Auditoría del catálogo de ejercicios y gifs · 2026-07-12

Revisión completa de coherencia ejercicio↔metodología y de los gifs/imágenes asignados,
sobre la BD de producción Supabase (`sbqcnlwpvjavmljzkmfy`, esquema `app`).

## Infraestructura de la auditoría

- **Backup local**: `backups/app-schema-20260712.dump` (pg_dump -Fc del esquema `app` completo, PG17, 3,2 MB).
- **Sandbox Docker**: contenedor `entrenaconia-audit-pg` (postgres:17, puerto local **55432**, pwd `audit123`) con el backup restaurado (139 tablas). Las pruebas de UPDATE se validaron ahí antes de tocar producción.
- **Datos exportados**: `backend/output/catalog-audit/` → `ejercicios.json` (515), `ejercicios_crossfit.json` (120), `ejercicios_bomberos.json` (43), `gif_map.json`, `gif_verdicts.json` (555 veredictos), `broken_urls.json`, `exercisedb_numeric.json` (mapeo id→nombre de los gifs).

## Alcance

| Tabla                                                           | Filas | Contenido                                                                                                              |
| --------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `app.ejercicios`                                                | 515   | 7 disciplinas: hipertrofia 110, casa 100, powerlifting 77, halterofilia 65, calistenia 65, funcional 54, heavy_duty 44 |
| `app."Ejercicios_CrossFit"`                                     | 120   | catálogo CrossFit (legacy, sigue activo)                                                                               |
| `app."Ejercicios_Bomberos"`                                     | 43    | pruebas de oposición                                                                                                   |
| `app."Ejercicios_Guardia_Civil"` / `"Ejercicios_Policia_Local"` | 0     | vacías                                                                                                                 |

## 1. Coherencia ejercicio↔metodología

Veredictos por disciplina (auditoría con revisión de los ~680 ejercicios uno a uno):

| Disciplina   | Veredicto               | Problema principal                                                                                                                                                                                                                                                                                           |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Halterofilia | ✅ Coherente (la mejor) | Progresiones en texto libre no enlazables (~83% punteros muertos)                                                                                                                                                                                                                                            |
| Powerlifting | ✅ Coherente            | `progresion_desde/hacia` 100% null (única disciplina sin cadena)                                                                                                                                                                                                                                             |
| Heavy Duty   | ✅ Con ajustes          | 5 pares de nombres duplicados exactos entre niveles (313/322 Dips, 318/325 talones, 287/302 pec-deck, 295/315 prensa, 296/314 extensión); triple "jalón supino" (305/311/321)                                                                                                                                |
| Hipertrofia  | ⚠️ Necesita ajustes     | Bloque de fuerza 3-6 reps sin etiquetar (ids 339,345,368,371,379,393); prensa de piernas cuadruplicada (349/385/361/386)                                                                                                                                                                                     |
| Calistenia   | ✅ Con reservas         | `descanso_seg` null en los 65; grafo de progresiones roto (nodo fantasma "Dominada strict"; ~70% referencias irresolubles)                                                                                                                                                                                   |
| Casa         | ✅ Aprobado             | Progresiones inexistentes (100% null); 3 ejercicios con silla como cajón/anclaje (120, 113, 118) cuestionables por seguridad; 163 Shoulder Dislocates mal clasificado como Avanzado                                                                                                                          |
| Funcional    | ✅ Con reservas         | Progresiones inexistentes; 210 V-sit con dosis irreal (3x20-40s); 184 landmine/214 yoke exigen material de gimnasio                                                                                                                                                                                          |
| CrossFit     | ⚠️ Apto con reservas    | Movimientos y cargas RX correctos, PERO columnas del motor vacías: `time_domain`, `pairing_tags`, `avoid_pairing_with` null en 120/120 y `supports_strength_block=0` en TODOS (contradice `wod_types: Strength`); id 111 nota "Fran weight" errónea (Fran es 43/30, id 43); id 120 mezcla neumático/Worm/Pig |
| Bomberos     | ✅ Con reservas         | Pruebas y baremos fieles a convocatorias reales (incl. 2.800 m Madrid); PERO `ejecucion/consejos/errores_evitar` null en 43/43; falta circuito de agilidad; campo baremo mezcla baremo real y prescripción de series                                                                                         |

**Problemas transversales** (arreglar a nivel de esquema, no fila a fila):

1. `progresion_desde/hacia` es texto libre: no enlaza con nombres del catálogo en ninguna disciplina (rotas las cadenas de progresión si algo las consume).
2. `tempo` solo poblado en halterofilia y funcional.
3. Los textos `como_hacerlo` son correctos en el ~100% de los casos revisados (ningún texto describe otro ejercicio). El contenido pedagógico es bueno; el problema está en los metadatos.

## 2. Gifs: el problema gordo

**Cobertura** (698 ejercicios): 287 con gif animado de ExerciseDB, 268 con **foto estática** JPG
de free-exercise-db (no gif), 123 sin nada (Bomberos 40/43 sin imagen).

**Solo existen 36 gifs animados únicos** en el bucket `exercise-gifs/crossfit/` para esos 287
ejercicios. Se asignaron con un matcher difuso (`backend/scripts/map-exercise-gifs.mjs` y
`scripts/match_crossfit_gifs.mjs`, con mapeos manuales ya erróneos de origen).

**Veredicto de correspondencia (555 ejercicios con imagen):** OK 265 (48%) · PARCIAL 180 (32%) · **MAL 110 (20%)**.

Los ~110 MAL se concentran en ~10 "gifs comodín":

| Gif real                                 | Se usa (mal) para                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| kettlebell double snatch                 | TODOS los snatch con barra (halterofilia + CrossFit, ~16 ejercicios)   |
| kettlebell one-arm clean & jerk          | todos los clean / clean&jerk con barra                                 |
| dumbbell push press                      | strict press, push jerk, split jerk, Sotts press… (8+)                 |
| air bike (¡es el abdominal "bicicleta"!) | las 4 filas de Assault Bike                                            |
| archer pull-up                           | dominadas, dead hang, scap pulls y hasta remos invertidos (23 usos)    |
| clap push-up                             | todas las variantes de flexión, incl. flexión en pared de principiante |
| smith chair squat                        | sentadillas al aire / asistidas (¡máquina Smith para peso corporal!)   |
| box jump down                            | step-ups y box jumps (movimiento inverso)                              |
| barbell side split squat                 | sentadillas búlgaras en 5 disciplinas                                  |
| kettlebell thruster                      | wall balls                                                             |

Peor disciplina: **halterofilia (24 MAL de 64)** — el usuario nunca ve el levantamiento con barra.
Mejores: heavy_duty (1 MAL) e hipertrofia (6 MAL), porque free-exercise-db cubre bien máquinas/mancuernas.

**Corregido ya en producción** (2026-07-12, probado antes en Docker): 5 URLs 404 con ruta
malformada `/exercises/<slug>/images/<slug>/0.jpg` en `Ejercicios_CrossFit` (ids 5, 13, 48, 51, 55).

## 3. Mejor fuente de gifs/vídeos (investigación jul-2026)

Recomendación: **activos autoalojados con pago único** (compatibles con Supabase Storage y la app Android). Evitar suscripciones que prohíben almacenar los medios.

1. **ExerciseDB dataset de pago** (exercisedb.io): 1.394 gifs, mismos ids que ya usamos → migración casi nula. Mobile 299 $ / Cross-Platform 599 $, pago único, autoalojable. Cubre el ~80% del catálogo (gimnasio/casa/funcional/powerlifting básico).
2. **Gymvisual a la carta** (~0,90 $/gif en packs): para los huecos — halterofilia (tienen snatch/clean&jerk), CrossFit (kipping, wall ball…), calistenia avanzada, oposiciones. ~150-250 gifs ≈ 150-300 $. Licencia N-CRFL perpetua, descarga directa.
3. **free-exercise-db** (dominio público): mantener como fallback estático donde ya acierta.
4. Nichos imposibles: encargo en Fiverr de Gymvisual (~10 $/animación) o embed puntual de YouTube.

**Coste total estimado: 450-900 $ una sola vez.** Alternativas valoradas y descartadas: MuscleWiki API (vídeos excelentes pero **prohíbe almacenarlos** → ata a su CDN y suscripción), RapidAPI ExerciseDB (pagar para siempre por lo mismo), datasets de Kaggle/GitHub con gifs de ExerciseDB re-empaquetados (**sin derechos, riesgo legal en Play Store**), gym-animations.com (denuncias por contenido robado), wger (solo ~286 imágenes estáticas), ExRx/WorkoutLabs (caros/fricción).

## 4. Plan de corrección

**Fase A — datos (sin coste): ✅ COMPLETADA y aplicada a producción el 2026-07-12**
(parches en `backend/output/catalog-audit/fixes/` y `output/catalog-audit/fixes/`, probados en Docker antes de producción):

1. ✅ Parche 01: 110 gifs MAL → 69 remapeados a free-exercise-db (URLs verificadas) y 41 a NULL.
2. ✅ Parche 02: `descanso_seg` de calistenia (65 filas) + grafo de progresiones normalizado (0 refs rotas).
3. ✅ Parche 03: duplicados heavy_duty renombrados, prensas de hipertrofia diferenciadas, bloque fuerza etiquetado, seguridad casa, categorías/niveles, 18 progresiones powerlifting, `'-'` → NULL.
4. ✅ Parche 04: CrossFit `supports_strength_block` (30), `time_domain` y `pairing_tags` 120/120, `avoid_pairing_with` (31), `is_benchmark` saneado, 10 puntuales (nota Fran, Worm, etc.).
5. ✅ Parche 05: Bomberos `ejecucion/consejos/errores_evitar` redactados 43/43 + categoría Agilidad→Acondicionamiento (41, 42), descanso oficiales (29, 30, 33), nota apnea (3).

6. ✅ Parche 06: doble semántica del baremo de Bomberos resuelta — `baremo_hombres/mujeres` contienen solo marcas reales de examen (filas `Oficial`); en Preparatoria/Técnica la prescripción se consolidó en `series_reps_objetivo` y el baremo pasó a NULL. Verificado que ningún código consumía estas columnas (el frontend usa `BomberosPruebas.js` hardcodeado).

7. ✅ Parche 07 + frontend: baremos reales de Bomberos calibrados sobre convocatorias reales (Comunidad de Madrid como base + Ayto. Madrid + estándares de consorcio) y **alineados entre BD y ficha** `BomberosPruebas.js` (el umbral "apto" de cada tramo coincide con `baremo_*` de la BD). Añadido descargo `NOTA_BAREMOS` visible en el flujo de generación. Números orientativos: cada convocatoria fija los suyos.

8. ✅ Oposiciones no implementadas (Guardia Civil, Policía Nacional, Policía Local): sustituido el `alert('… próximamente')` por estado **"Próximamente"** en la tarjeta (badge + botón deshabilitado + guarda en el handler). Bomberos es la única con flujo real; las otras tres solo tienen prompt de especialista, sin catálogo ni UI.

Infraestructura retirada: el contenedor `entrenaconia-audit-pg` se eliminó al cerrar la Fase A; el backup `backups/app-schema-20260712.dump` se conserva (restaurable con postgres:17 + pg_restore).

**Fase B — medios (requiere decisión de compra):** 8. Comprar ExerciseDB dataset (299-599 $) → reemplaza los 36 gifs comodín y da gif animado a los 268 que hoy tienen foto estática. 9. Comprar en Gymvisual los ~100-150 huecos (halterofilia/CrossFit/calistenia/oposiciones). 10. Subir todo a `exercise-gifs/` con nomenclatura por slug y remapear `gif_url` por id (no por fuzzy match).
