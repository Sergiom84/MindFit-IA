# Seguridad, sintomas y sustituciones

Version: `crossfit-safety/2.0.0`. No diagnostica, trata ni rehabilita. Una lesion diagnosticada se registra como declarada por usuario/profesional; la app decide solo si reducir, sustituir, convertir, bloquear o derivar.

## Estados

| Estado                       | Definicion operativa                                      | Accion maxima                           |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Molestia                     | 1-2/10 estable, no altera tecnica                         | ajustar y monitorizar                   |
| Dolor moderado               | 3-4 o aumento >=2                                         | parar patrón, sustituir/`regress`       |
| Dolor severo/agudo           | >=5, punzante, creciente o perdida funcional              | bloquear sesion y derivar               |
| Lesion diagnosticada estable | restricciones y autorizacion conocidas                    | respetar plan profesional; no inferir   |
| Retorno autorizado           | criterios/fecha/profesional declarados                    | estado `regress` + protocolo de retorno |
| Red flag                     | cardiorrespiratoria, neurologica, obstetrica o traumatica | bloqueo inmediato/atencion apropiada    |

## Stop rules

Detener movimiento: tecnica 0/3, dolor aumenta >=2, mecanica compensada, perdida de balance, dos misses olimpicos consecutivos o dos intervalos fuera del limite. Detener sesion y evaluar: dolor >=5, sintoma neurologico, mareo/presincope, disnea desproporcionada, palpitacion inusual o RPE >=9 durante warm-up ligero. Bloquear/derivar: dolor toracico, disnea en reposo/esfuerzo leve, sincope, deficit neurologico, edema/dolor unilateral de pantorrilla, deformidad aguda, incapacidad de apoyo o signos obstetricos ACOG.

## Orden de modificacion

1. Reducir velocidad/impacto.
2. Reducir rango si sigue indoloro y autorizado.
3. Reducir carga/dosis.
4. Cambiar variante del mismo patron.
5. Cambiar patron conservando demanda energetica.
6. Convertir a recuperacion.
7. Bloquear.

Preservar stimulus nunca prevalece sobre seguridad. Todas las reglas concretas estan en [`data/safety_rules.csv`](./data/safety_rules.csv).

## Poblaciones y condiciones

- Edad: no bloquea por si sola. La experiencia, screening, impacto, tecnica y recuperacion mandan.
- Desentrenamiento: `RETURN_PROTOCOL_REQUIRED` dentro de `regress`; no etiquetar enfermedad.
- Obesidad: no bloquea; priorizar impacto bajo, rango tolerado, control termico y equipo adecuado.
- Hipertension/cardiovascular/metabolica/renal conocida: aplicar screening ACSM; sintomas o alta intensidad sin autorizacion cuando proceda -> bloqueo/derivacion. No ajustar medicacion ni sodio clinicamente.
- Embarazo/posparto: `BLOQUEADO_CLINICAL_PROFILE_CONTRACT`. Sin trimestre/posparto, sintomas y autorizacion estructurados, no generar alta intensidad ni posiciones de riesgo. El producto puede ofrecer solo mensaje y derivacion.
- Menores: onboarding admite desde 13; esta metodologia profesional requiere politica de consentimiento/supervision no existente. Hasta decidirla, <18 se limita a principiante tecnico y `REQUIERE_DECISION_PABLO_SERGIO`.

## Contrato de perfil necesario

`safety_screening`: timestamp, activity_status, known_conditions declaradas, exertional_symptoms, pregnancy/postpartum state, clearance status/source/date/expiry, current pain entries, diagnosed restrictions, return status, emergency acknowledgement. Los campos sensibles llevan minimizacion, cifrado/acceso y retencion definida. Texto legacy se muestra para confirmar/migrar; no se convierte automaticamente en diagnostico.

## Integracion actual

`limitaciones_fisicas` canonico se reutiliza y la regex legacy queda como fallback de confianza baja: solo puede endurecer/bloquear, no autorizar un movimiento. El safety evaluator V2 se ejecuta antes del composer y de cualquier sustitución; dolor/red flag prevalece sobre stimulus. Equipamiento se consulta de inventario; sueño/estres/fatiga se capturan por check-in temporal y no se guardan como atributo fijo del perfil. La persistencia y las políticas RLS ya pasaron QA PostgreSQL aislada, incluido
aislamiento entre usuarios y append-only; solo su migración productiva continúa
pendiente de autorización.

## Validacion profesional

`REQUIERE_VALIDACION_HUMANA`: entrenador revisa tecnica/escalas y un profesional sanitario define limites del copy y screening. Embarazo/posparto necesita revision especifica. La app debe mostrar que dolor agudo/red flags no se resuelven con una sustitucion automatica.
