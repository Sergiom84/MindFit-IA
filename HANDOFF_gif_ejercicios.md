# HANDOFF · Implementar demostraciones visuales (gif/imagen) por ejercicio

> Objetivo: que la sección "ejercicios a entrenar" muestre una demostración visual de cada
> ejercicio (ej. "Press de Pecho con Mancuernas en Suelo"), sin grabar 678 vídeos a mano
> y sin crear una app aparte.
>
> Estrategia elegida: **mapear cada ejercicio del catálogo a una librería de demostraciones
> existente** y guardar solo la referencia (`gif_url`) en cada tabla. La app pinta esa media.
> Documento de análisis previo: ver `test_mapeo_ejercicios.md` (en outputs de la sesión).

---

## 1. Contexto / hallazgos (datos reales)

Base de datos: Supabase, proyecto nuevo `sbqcnlwpvjavmljzkmfy` (org "Entrena"), schema **`app`**.
Credenciales en `backend/.env` (`DATABASE_URL`, `SUPABASE_*`, `OPENAI_API_KEY`). `DB_SEARCH_PATH=app,public`.

El catálogo está **partido en 11 tablas por metodología**, con **678 ejercicios**:

| Tabla (`app."..."`)      | Filas | ¿columna `gif_url`? | Columna nombre | Otras útiles para el match             |
| ------------------------ | ----- | ------------------- | -------------- | -------------------------------------- |
| Ejercicios_Hipertrofia   | 110   | ❌ NO               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_CrossFit      | 120   | ❌ NO               | `nombre`       | `equipamiento`, `dominio`, `categoria` |
| Ejercicios_Casa          | 100   | ✅ SÍ               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_Powerlifting  | 77    | ❌ NO               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_Calistenia    | 65    | ❌ NO               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_Halterofilia  | 65    | ✅ SÍ               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_Funcional     | 54    | ✅ SÍ               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_Heavy_Duty    | 44    | ❌ NO               | `nombre`       | `equipamiento`, `patron`, `categoria`  |
| Ejercicios_Bomberos      | 43    | ❌ NO               | `nombre`       | `equipamiento`, `categoria`            |
| Ejercicios_Guardia_Civil | 0     | ❌ NO               | `nombre`       | —                                      |
| Ejercicios_Policia_Local | 0     | ❌ NO               | `nombre`       | —                                      |

Estado actual de la media:

- Las 3 columnas `gif_url` que existen están **vacías al 100%**.
- En el bucket de Storage `exercise-videos` hay **un único** archivo: `Press de pecho inclinado.mp4`.

Conclusión: la pieza visual está sin hacer para ~677 ejercicios. Hay que (a) tener columna
`gif_url` en las 11 tablas, (b) rellenarla con referencias a una librería, (c) pintarla en el front.

---

## 2. Librería de demostraciones (decisión + licencia)

Recomendada para empezar: **free-exercise-db** (https://github.com/yuhonas/free-exercise-db)

- ~870 ejercicios con imágenes (estáticas, 2 frames) + nombre, músculos, equipo, instrucciones.
- Licencia **Unlicense (dominio público)** → sin fricción legal, uso comercial libre.
- Dataset: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`
- Imagen de un ejercicio: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/0.jpg`
  (cada item del JSON trae `id` e `images: ["<id>/0.jpg", "<id>/1.jpg"]`).

Alternativa si se quiere **GIF animado**: **ExerciseDB** (11.000+ ejercicios con GIF).

- ⚠️ Legal: su API es **AGPL v3** (copyleft). Mostrar los GIF en la app es OK, pero NO
  redistribuir el dataset, y si self-hosteas su código la AGPL te obliga a abrir el tuyo.
  Ofrecen licencia perpetua de pago para evitarlo. Revisar antes de producción.

> Recomendación práctica: implementar primero con free-exercise-db (gratis, legal, ya validado).
> Dejar la fuente como parámetro configurable para poder cambiar a ExerciseDB después.

---

## 3. Plan de implementación

### Paso 0 — Migración: añadir `gif_url` donde falta

Crear migración en `backend/migrations/` (p.ej. `add_gif_url_to_exercise_tables.sql`):

```sql
ALTER TABLE app."Ejercicios_Hipertrofia"    ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_CrossFit"       ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_Powerlifting"   ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_Calistenia"     ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_Heavy_Duty"     ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_Bomberos"       ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_Guardia_Civil"  ADD COLUMN IF NOT EXISTS gif_url text;
ALTER TABLE app."Ejercicios_Policia_Local"  ADD COLUMN IF NOT EXISTS gif_url text;
-- (Casa, Funcional, Halterofilia ya la tienen)
-- Opcional, para trazar el origen del match:
-- ADD COLUMN IF NOT EXISTS gif_source text, ADD COLUMN IF NOT EXISTS gif_match_confidence numeric;
```

### Paso 1 — Script de mapeo (Node, en `backend/scripts/`)

Crear `backend/scripts/map-exercise-gifs.mjs`. Comportamiento:

1. **Cargar dataset** de free-exercise-db (`dist/exercises.json`). Cachear en disco para no
   redescargar en cada ejecución.
2. **Leer** todas las filas de las 11 tablas `app."Ejercicios_*"` (`exercise_id`/`slug`, `nombre`,
   `equipamiento`, `patron`/`dominio`, `categoria`).
3. **Match difuso** por ejercicio:
   - Normalizar (minúsculas, sin tildes) el `nombre` español.
   - Traducir términos clave a EN para puntuar contra el `name` de la librería:
     mancuernas→dumbbell, barra→barbell, polea→cable/pulldown, máquina→machine, banca→bench,
     sentadilla→squat, peso muerto→deadlift, jalón→pulldown, elevación lateral→lateral raise,
     curl→curl, press→press, fondos→dips, dominadas→pull up, zancada→lunge, etc.
   - Puntuar con similitud de tokens (p.ej. `string-similarity` o Jaccard) + bonus si coincide
     el equipo (dumbbell/barbell/cable…).
   - Confianza alta (≥ umbral): asignar `id` → `gif_url = .../exercises/<id>/0.jpg`.
   - Confianza baja: dejar `gif_url` NULL y marcar para revisión.
4. **(Opcional) Desempate con IA** para los de baja confianza: usar `OPENAI_API_KEY` del `.env`
   pasando el nombre español + top-5 candidatos y pidiendo el mejor `id` (o "ninguno").
5. **Modo `--dry-run` por defecto**: NO escribe en BD; genera `backend/scripts/_out/gif_mapping_report.csv`
   con `tabla, exercise_id, nombre, id_match, gif_url, confianza, fuente`. Solo con `--apply` hace los `UPDATE`.
6. **Informe final**: % cubierto automáticamente por tabla y lista de pendientes de revisión.

Conexión a BD: usar `pg` con `process.env.DATABASE_URL` (ya en `.env`). Las tablas van con
comillas dobles por las mayúsculas: `UPDATE app."Ejercicios_Hipertrofia" SET gif_url=$1 WHERE exercise_id=$2`.

> ⚠️ Clave técnica (lección del test): **el `id` NO se adivina traduciendo el nombre**.
> Ej.: "Sentadilla búlgara" → en la librería NO existe "Bulgarian_Split_Squat"; el match real
> es "Barbell Side Split Squat". Por eso es obligatorio el fuzzy match contra el dataset real
>
> - revisión de baja confianza, nunca hardcodear nombres traducidos.

### Paso 2 — Backend (API)

Asegurar que los endpoints que devuelven ejercicios incluyan `gif_url` en la respuesta.
Revisar: `backend/routes/exerciseCatalog.js`, `backend/services/exerciseRepository.js`,
`backend/routes/trainingSession/*`, `backend/routes/homeTraining/exerciseInfo.js`.
Si el front pide info por nombre, añadir `gif_url` al SELECT/serialización.

### Paso 3 — Frontend (render)

En el componente de la sección de ejercicios (buscar dónde se pinta cada ejercicio de la sesión;
candidatos: `src/components/routines/tabs/TodayTrainingTab/...`, `src/components/Methodologie/exercises/...`):

- Si `exercise.gif_url` existe → `<img src={gif_url} alt={nombre} loading="lazy" />`.
- Fallback si NULL: placeholder + (opcional) link a buscar el ejercicio.
- Considerar precargar/lazy-load porque son imágenes externas (GitHub raw / CDN).

> Producción: no servir desde `raw.githubusercontent.com` directamente. O bien (a) copiar las
> imágenes usadas a tu bucket `exercise-videos` de Supabase Storage y guardar esa URL, o
> (b) ponerlas tras un CDN. Evita depender de GitHub raw en runtime.

---

## 4. Test ya realizado (10 ejercicios reales)

3 verificados contra el dataset real; resto candidatos a confirmar por el script:

| Ejercicio (tu BD)                      | id free-exercise-db                            | Estado         |
| -------------------------------------- | ---------------------------------------------- | -------------- |
| Press Arnold con mancuernas            | `Arnold_Dumbbell_Press`                        | ✅ verificado  |
| Press de banca                         | `Barbell_Bench_Press_-_Medium_Grip`            | ✅ verificado  |
| Curl con barra                         | `Barbell_Curl`                                 | ✅ verificado  |
| Press de Pecho con Mancuernas en Suelo | `Dumbbell_Floor_Press`                         | 🟡 candidato   |
| Press inclinado con mancuernas         | `Incline_Dumbbell_Press`                       | 🟡 candidato   |
| Elevación lateral con mancuernas       | `Side_Lateral_Raise`                           | 🟡 candidato   |
| Curl de Bíceps con Mancuernas          | `Dumbbell_Bicep_Curl`                          | 🟡 candidato   |
| Peso muerto rumano (RDL) con barra     | `Romanian_Deadlift`                            | 🟡 candidato   |
| Jalón al pecho en polea (agarre ancho) | `Wide-Grip_Lat_Pulldown`                       | 🟡 candidato   |
| Sentadilla búlgara con mancuernas      | `Barbell_Side_Split_Squat` (no "Bulgarian\_…") | ⚠️ fuzzy match |

---

## 5. Criterios de aceptación

- [ ] Migración aplicada: las 11 tablas tienen `gif_url`.
- [ ] `map-exercise-gifs.mjs` corre en `--dry-run` y genera el CSV de informe.
- [ ] Con `--apply`, ≥ ~80% de ejercicios con `equipamiento` reconocible quedan con `gif_url`.
- [ ] Informe lista los pendientes de revisión manual (baja confianza / sin match).
- [ ] La API devuelve `gif_url`; el front lo muestra con fallback.
- [ ] (Producción) imágenes servidas desde Storage/CDN propio, no GitHub raw.

## 6. Notas / decisiones abiertas

- Imagen estática (free-exercise-db, gratis) vs GIF animado (ExerciseDB, de pago/AGPL): empezar
  con la gratis; dejar la fuente parametrizable.
- Guardia_Civil y Policia_Local están a 0 filas: sin acción hasta poblarlas.
- Respetar `CLAUDE.md` / `CLAUDE_RULES.md`: alcance mínimo, no reiniciar servicios sin pedirlo,
  backend en puerto fijo 3010.
