# Especificacion nutricional sinergica

Version: `crossfit-nutrition/2.0.0`. No crea un calculador paralelo. Reutiliza energia, restricciones, preferencias, recetas, menu y lista de compra del motor canonico. `DESARROLLO_DESBLOQUEADO_FLAG_OFF`: el mapping se implementa y prueba ahora, pero solo puede activarse cuando CrossFit emita `training-load/v1` valido, complete shadow y reciba aprobación.

## Jerarquia del calculo

1. Perfil nutricional canonico y objetivo.
2. Energia estimada/observada y fase actual.
3. Carga real `D0/D1/D2`, duracion, demandas y proximidad de otra sesion.
4. Nivel CrossFit solo para limitar rangos compatibles con su volumen habitual.
5. Preferencias, alergias, intolerancias, dieta, disponibilidad y adherencia.

El nivel nunca fija calorias. Dos avanzados con masa, objetivo y volumen distintos no reciben el mismo plan.

## Energia y objetivo

Sobre el mantenimiento canonico de Mindfit, antes de redondeo:

| Objetivo         | Rango inicial | Ritmo/gate de ajuste                                       |
| ---------------- | ------------- | ---------------------------------------------------------- |
| Rendimiento      | 0 a +5 %      | rendimiento/recuperacion; no subir por etiqueta D2 aislada |
| Recomposicion    | -5 a +5 %     | medidas, rendimiento y adherencia 2-3 semanas              |
| Perdida de grasa | -10 a -20 %   | objetivo 0,25-0,75 % peso/semana; nunca >1 % sin revision  |
| Ganancia de masa | +5 a +10 %    | objetivo 0,1-0,3 % peso/semana                             |

Salida se redondea al multiplo de 25 kcal, pero se almacena el valor previo y el motivo. Ajuste ordinario: `100-200 kcal`; no mas de 10 % semanal sin profesional. Si adherencia <80 %, no cambiar energia: simplificar menu.

## Macros por nivel y carga

| Nivel        | Proteina base g/kg | D0 carb g/kg | D1 carb g/kg | D2 carb g/kg |
| ------------ | ------------------ | ------------ | ------------ | ------------ |
| Principiante | 1,6-1,8            | 2-3          | 3-4          | 4-5          |
| Intermedio   | 1,6-2,0            | 2,5-3,5      | 3,5-5        | 5-7          |
| Avanzado     | 1,8-2,2            | 3-4          | 4-6          | 5,5-8        |

En perdida de grasa/proteccion de masa magra, proteina puede subir a `1,8-2,4 g/kg`, con maximo de producto 2,4. La seleccion final se limita por energia y tolerancia; D2 no obliga a 8 g/kg. Grasa: `max(0,8 g/kg, 20 % kcal)` como default; 0,6-0,79 solo con profesional y nunca de forma automatica. Fibra: `14 g/1000 kcal`, limitada normalmente a 25-40 g y reducida en la comida cercana al entrenamiento si causa sintomas.

Calculo:

```text
protein_g = round_to_5(weight_basis_kg * selected_protein_gkg)
fat_floor_g = max(0.8 * weight_basis_kg, 0.20 * kcal / 9)
carb_range_g = weight_basis_kg * load_and_level_range
carb_g = clamp((kcal - 4*protein_g - 9*fat_g)/4, carb_range)
if energy_cannot_fit_floors: raise NUTR_CF_MACRO_CONSTRAINT and review energy
```

`weight_basis_kg` usa el contrato nutricional existente; obesidad o edema no se resuelven inventando un peso ajustado en este modulo.

## Mapping `training-load/v1`

| Dia | Condicion                                                                               | Nutricion                                      |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| D0  | rest/recovery, tier rest/low                                                            | carbos D0, energia de fase                     |
| D1  | tier low/moderate y sin test/competition                                                | carbos D1; timing segun hora                   |
| D2  | tier high/very_high, test/competition o alta demanda glicolitica con duracion relevante | carbos D2; recuperar si siguiente sesion <24 h |

Formato solo no determina dia. Un EMOM tecnico es D1; un interval largo denso puede ser D2. Mapping exacto en [`data/training_load_mapping.csv`](./data/training_load_mapping.csv).

## Timing

| Situacion                  | Regla inicial                                                         |
| -------------------------- | --------------------------------------------------------------------- |
| Pre D1, 1-3 h              | 0,5-1 g/kg carb + 0,25-0,35 g/kg proteina                             |
| Pre D2, 1-4 h              | 1-2 g/kg carb + 0,25-0,35 g/kg proteina; grasa/fibra segun tolerancia |
| Temprano, 30-60 min        | 0,3-0,6 g/kg carb opcional o cena previa; alimento tolerado           |
| Durante <60 min            | agua segun sed/plan; no carbos rutinarios                             |
| 60-90 min D2/calor         | 20-40 g carb/h solo si tolerado y utilidad real                       |
| >90 min o doble autorizada | 30-60 g/h; avanzado y supervision                                     |
| Post habitual              | 0,25-0,4 g/kg proteina; completar ingesta diaria                      |
| Siguiente sesion <8 h      | 0,8-1,2 g/kg carb temprano + plan de recuperacion                     |
| Nocturna                   | pre mas ligero; post digerible sin forzar gran comida                 |

La evidencia CrossFit aguda no muestra beneficio consistente de carbohidrato intra en WOD corto; por eso no se recomienda por defecto.

## Hidratacion y electrolitos

- Base educativa inicial: 30-35 ml/kg/dia, ajustada al motor existente, alimentos, clima y condiciones.
- Tasa de sudor: `(peso_pre - peso_post + liquido - orina) / horas`, con medicion repetida; evitar ganar peso durante la sesion.
- Reponer de forma individual para limitar perdidas aproximadas >2 % sin sobrebeber.
- Sodio inicial solo en >60-75 min, calor o sudorador alto: 300-600 mg/h como rango educativo, nunca universal; ajustar por sudor, dieta y profesional.
- Enfermedad renal/cardiaca, hipertension no controlada o medicacion relevante: no sugerir electrolitos dosificados; derivar.

## Ajuste semanal

| Regla                                                                 | Ventana        | Accion                                                                     |
| --------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| rendimiento comparable cae >=5 % dos veces + hambre/fatiga/sueno bajo | 7-14 d         | revisar training load; +100-200 kcal principalmente carb o reducir deficit |
| perdida >1 %/sem o signos RED-S                                       | inmediata      | parar deficit y derivar                                                    |
| objetivo sin tendencia y adherencia >=85 %                            | 2-3 sem        | +/-100-150 kcal segun objetivo                                             |
| adherencia <80 %                                                      | 2 sem          | no tocar kcal; simplificar recetas/lista                                   |
| RPE alto con actual load normal                                       | 2 exposiciones | revisar sueno/estres antes de energia                                      |
| peso cambia pero rendimiento y medidas objetivo mejoran               | 2-3 sem        | HOLD                                                                       |

## Baja disponibilidad energetica y derivacion

Flags: perdida rapida, fatiga persistente, deterioro de rendimiento, alteraciones menstruales declaradas, lesiones por estres, frio, hambre extrema, libido baja o conductas alimentarias de riesgo. La app no diagnostica RED-S ni trastorno alimentario. `NUTR_CF_REDS_RISK` detiene deficit y solicita valoracion por nutricionista/medico. Embarazo/posparto no recibe deficit automatizado ni periodizacion CrossFit hasta contrato clinico.

## Integracion con menu, recetas y compras

El dia de entrenamiento aporta `day_id`, hora y carga. El motor redistribuye macros entre comidas existentes, prioriza recetas compatibles y recalcula lista de compra; no crea un segundo menu. Cambio de sesion reperiodiza solo dias no consumidos/no cerrados, conserva sustituciones y registra diff. Error de outbox o carga degradada mantiene plan base, muestra estado `sync_pending` y reintenta idempotentemente.

Estado implementado en rama: la generación del plan enlaza cada día por
`plan_id + day_id`, conserva `metadata.session_time`, persiste el contrato en
`periodization_context` y solo sirve D0/D1/D2 cuando el modo es `active` y
autoritativo. `/active-plan` devuelve ese contexto al propietario; la UI muestra
timing e hidratación únicamente en active, nunca durante shadow. Recetas y
sustituciones siguen en las tablas canónicas. La lista V2 se deriva de los
`nutrition_meal_items` realmente persistidos, agrega gramajes de forma
determinista y separa estados crudo/cocido/seco, por lo que no inventa ni sustituye
alimentos.

La migración `20260722_crossfit_v2_nutrition_day_types.sql`, preparada y no
aplicada, amplía el constraint histórico para admitir `entreno_normal` y
`entreno_alto`; sin ella el modo active fallaría al insertar. El cierre registra
la carga actual completa en la decisión del bridge y las métricas agregan muestras
planned/actual. La reperiodización persistente por cambios futuros de calendario y
el estado visible `sync_pending` siguen siendo gate E2E/BD, no se declaran validados.

## Reason codes y limites

`NUTR_CF_D0/D1/D2`, `NUTR_CF_LOW_ADHERENCE`, `NUTR_CF_PERFORMANCE_DROP`, `NUTR_CF_REDS_RISK`, `NUTR_CF_HYDRATION_PERSONALIZE`, `NUTR_CF_MACRO_CONSTRAINT`. Toda recomendacion muestra rango y razon, no decimal clinico falso. `REQUIERE_VALIDACION_HUMANA` por nutricionista deportivo.
