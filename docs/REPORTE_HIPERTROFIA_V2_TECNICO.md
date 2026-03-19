# Reporte tecnico - Simulacion HipertrofiaV2

## Configuracion de ejecucion

- Usuario: sim_novato_1769619995444_492@test.com (ID 38)
- API_BASE: http://localhost:3010
- Inicio plan: 2026-01-26
- Semanas simuladas: 10
- Semana 0: incluida
- Sabados: no
- Plan: 226 (Principiante)
- Motor: MindFeed v1.0 | Progresion: Por microciclo (+2.5%)
- Perfil dias: 0% skip, 0% off-plan, 0% fatiga, 0% top
- Fatiga objetiva simulada: 0% (leve)

## Bloque de adaptacion (novato total)

- Bloque ID: 6 | Plan ID: 225
- Tag IA: novato_total | Tipo: full_body
- Duracion: 1 semanas | Sesiones/semana: 4
- Sesiones ejecutadas: 4 | Saltadas: 0 | Off-plan: 0
- Evaluacion: OK
- Transicion: OK

## Flujo ejecutado

1. Registro/login usuario
2. Cancelacion de plan activo
3. Generacion y ejecucion de bloque de adaptacion
4. Evaluacion y transicion a D1-D5
5. Generacion de plan D1-D5 HipertrofiaV2
6. Confirmacion del plan
7. Simulacion de 10 + semana 0 semanas x 5 sesiones
8. Registro de sets, progreso y cierre de sesion
9. Avance de ciclo y progresion por microciclo
10. Verificacion de deload
11. Resumen de progreso y estado final

## Resumen global

- Sesiones simuladas: 55
- Sesiones saltadas: 0
- Dias con fatiga subjetiva: 0
- Dias top: 0
- Dias con fatiga objetiva (intencion): 0
- Ejercicios completados: 230
- Sets registrados: 437
- Volumen total estimado: 97895

## Validaciones adicionales (script)

| Check                           | OK/Total | Fuera rango | Faltantes |
| ------------------------------- | -------- | ----------- | --------- |
| Intensidad por día              | 207/230  | 23          | 0         |
| Reps objetivo 8-12              | 437/437  | 0           | 0         |
| RIR objetivo 2-3 / semana 0 3-4 | 382/437  | 55          | 0         |
| Orden Multi→Uni→Analítico       | 50/55    | 0           | 5         |
| Volumen fijo (series)           | 50/55    | 5           | 0         |

### Variaciones de volumen detectadas (baseline semana 1)

| Semana | Ciclo | Motivo                                  |
| ------ | ----- | --------------------------------------- |
| 6      | D1    | Cambio de series/ejercicios vs baseline |
| 6      | D2    | Cambio de series/ejercicios vs baseline |
| 6      | D3    | Cambio de series/ejercicios vs baseline |
| 6      | D4    | Cambio de series/ejercicios vs baseline |
| 6      | D5    | Cambio de series/ejercicios vs baseline |

## Progresion por microciclo

| Microciclo | Semana | Progresion  | Incremento % | RIR medio          |
| ---------- | ------ | ----------- | ------------ | ------------------ |
| 1          | 1      | Aplicada    | 2.5          | 3                  |
| 2          | 2      | No aplicada | —            | 2.8260869565217392 |
| 3          | 3      | No aplicada | —            | 2.9565217391304346 |
| 4          | 4      | No aplicada | —            | 2.9782608695652173 |
| 5          | 5      | Aplicada    | 2.5          | 3.1956521739130435 |
| 6          | 6      | No aplicada | —            | 3.4782608695652173 |
| 7          | 7      | No aplicada | —            | 2.9782608695652173 |
| 8          | 8      | No aplicada | —            | 2.9565217391304346 |
| 9          | 9      | Aplicada    | 2.5          | 3.0217391304347827 |
| 10         | 10     | No aplicada | —            | 2.9347826086956523 |

## Eventos de deload

| Microciclo | Semana | Accion      | Motivo      |
| ---------- | ------ | ----------- | ----------- |
| 6          | 6      | planificado | planificado |

## Resumen por semana

| Semana | Sesiones | RIR medio | Volumen total |
| ------ | -------- | --------- | ------------- |
| 0      | 5        | —         | 0             |
| 1      | 5        | 2.98      | 10470         |
| 2      | 5        | 2.84      | 10470         |
| 3      | 5        | 2.98      | 10470         |
| 4      | 5        | 2.95      | 10470         |
| 5      | 5        | 3.2       | 10470         |
| 6      | 5        | 3.47      | 3665          |
| 7      | 5        | 2.97      | 10470         |
| 8      | 5        | 2.98      | 10470         |
| 9      | 5        | 3.02      | 10470         |
| 10     | 5        | 2.88      | 10470         |

## Sesiones (detalle)

| Semana | Dia       | Ciclo | Sesion                               | Perfil | Saltada | Fatiga subj | Fatiga obj | RIR medio | Volumen | Intensidad avg | Intensidad exp | Orden M/U/A | Reps ok | RIR ok |
| ------ | --------- | ----- | ------------------------------------ | ------ | ------- | ----------- | ---------- | --------- | ------- | -------------- | -------------- | ----------- | ------- | ------ |
| 0      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 1      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 3.25      | 1880    | 80             | 80%            | ok          | 8/8     | 6/8    |
| 1      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 2.67      | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 1      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 2.75      | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 1      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.25      | 1670    | 73             | 70-75%         | ok          | 8/8     | 6/8    |
| 1      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3         | 3610    | 73             | 70-75%         | ok          | 16/16   | 14/16  |
| 2      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 3         | 1880    | 80             | 80%            | ok          | 8/8     | 7/8    |
| 2      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 2.5       | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 2      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 2.88      | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 2      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.13      | 1670    | 73             | 70-75%         | ok          | 8/8     | 7/8    |
| 2      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 2.69      | 3610    | 73             | 70-75%         | ok          | 16/16   | 16/16  |
| 3      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 2.75      | 1880    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 3      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 3         | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 3      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 3         | 1830    | 80             | 80%            | ok          | 8/8     | 7/8    |
| 3      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.25      | 1670    | 73             | 70-75%         | ok          | 8/8     | 6/8    |
| 3      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 2.88      | 3610    | 73             | 70-75%         | ok          | 16/16   | 15/16  |
| 4      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 2.75      | 1880    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 4      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 2.67      | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 4      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 2.88      | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 4      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.38      | 1670    | 73             | 70-75%         | ok          | 8/8     | 5/8    |
| 4      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3.06      | 3610    | 73             | 70-75%         | ok          | 16/16   | 14/16  |
| 5      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 3         | 1880    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 5      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 3.17      | 1480    | 80             | 80%            | ok          | 6/6     | 5/6    |
| 5      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 3.13      | 1830    | 80             | 80%            | ok          | 8/8     | 7/8    |
| 5      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.5       | 1670    | 73             | 70-75%         | ok          | 8/8     | 4/8    |
| 5      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3.19      | 3610    | 73             | 70-75%         | ok          | 16/16   | 13/16  |
| 6      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 3.5       | 660     | 56             | 80%            | ok          | 4/4     | 2/4    |
| 6      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 3.33      | 520     | 56             | 80%            | ok          | 3/3     | 2/3    |
| 6      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 3.5       | 640     | 56             | 80%            | ok          | 4/4     | 2/4    |
| 6      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.5       | 585     | 51.1           | 70-75%         | ok          | 4/4     | 2/4    |
| 6      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3.5       | 1260    | 51.1           | 70-75%         | ok          | 8/8     | 4/8    |
| 7      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 2.75      | 1880    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 7      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 2.83      | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 7      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 3         | 1830    | 80             | 80%            | ok          | 8/8     | 7/8    |
| 7      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.25      | 1670    | 73             | 70-75%         | ok          | 8/8     | 6/8    |
| 7      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3         | 3610    | 73             | 70-75%         | ok          | 16/16   | 15/16  |
| 8      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 2.88      | 1880    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 8      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 3         | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 8      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 2.63      | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 8      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.5       | 1670    | 73             | 70-75%         | ok          | 8/8     | 4/8    |
| 8      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 2.88      | 3610    | 73             | 70-75%         | ok          | 16/16   | 16/16  |
| 9      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 2.75      | 1880    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 9      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | —          | 2.83      | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 9      | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 3         | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 9      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.5       | 1670    | 73             | 70-75%         | ok          | 8/8     | 4/8    |
| 9      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3         | 3610    | 73             | 70-75%         | ok          | 16/16   | 15/16  |
| 10     | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal | No      | —           | —          | 3         | 1880    | 80             | 80%            | ok          | 8/8     | 7/8    |
| 10     | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal | No      | —           | light      | 2.33      | 1480    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 10     | Miércoles | D3    | Piernas Completas                    | normal | No      | —           | —          | 2.75      | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 10     | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal | No      | —           | —          | 3.25      | 1670    | 73             | 70-75%         | ok          | 8/8     | 6/8    |
| 10     | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal | No      | —           | —          | 3.06      | 3610    | 73             | 70-75%         | ok          | 16/16   | 14/16  |

## Estado final

- Cycle day: 1
- Microciclos completados: 10
- Deload activo: no

## Progreso agregado

- Sesiones completadas: 50
- Ejercicios completados: 230
- Series completadas: 437

## Errores

Sin errores.

## Observaciones

- La semana 0 se simulo como calibracion (RIR 3-4, sin progresion).
- Las fechas reales de sesion quedan con la fecha actual del servidor; el calendario del plan se respeta via week_number/day_name.
