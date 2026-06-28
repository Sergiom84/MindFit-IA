# Reporte tecnico - Simulacion HipertrofiaV2

## Configuracion de ejecucion

- Usuario: sim_novato_1769618123419_398@test.com (ID 36)
- API_BASE: http://localhost:3010
- Inicio plan: 2026-01-26
- Semanas simuladas: 10
- Semana 0: incluida
- Sabados: no
- Plan: 223 (Principiante)
- Motor: MindFeed v1.0 | Progresion: Por microciclo (+2.5%)
- Perfil dias: 15% skip, 15% off-plan, 20% fatiga, 20% top
- Fatiga objetiva simulada: 20% (leve)

## Bloque de adaptacion (novato total)

- Bloque ID: 4 | Plan ID: 222
- Tag IA: novato_total | Tipo: full_body
- Duracion: 1 semanas | Sesiones/semana: 4
- Sesiones ejecutadas: 4 | Saltadas: 0 | Off-plan: 1
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
- Sesiones saltadas: 12
- Dias con fatiga subjetiva: 9
- Dias top: 12
- Dias con fatiga objetiva (intencion): 9
- Ejercicios completados: 168
- Sets registrados: 285
- Volumen total estimado: 63125

## Validaciones adicionales (script)

| Check                           | OK/Total | Fuera rango | Faltantes |
| ------------------------------- | -------- | ----------- | --------- |
| Intensidad por día              | 145/168  | 23          | 0         |
| Reps objetivo 8-12              | 285/285  | 0           | 0         |
| RIR objetivo 2-3 / semana 0 3-4 | 220/285  | 65          | 0         |
| Orden Multi→Uni→Analítico       | 39/43    | 0           | 4         |
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
| 1          | 1      | Aplicada    | 2.5          | 3.75               |
| 2          | 2      | No aplicada | —            | 2.9                |
| 3          | 3      | No aplicada | —            | 2.8333333333333335 |
| 4          | 4      | No aplicada | —            | 2.760869565217391  |
| 5          | 5      | No aplicada | —            | 2.630434782608696  |
| 6          | 6      | No aplicada | —            | 3.4782608695652173 |
| 7          | 7      | Aplicada    | 2.5          | 3.5                |
| 8          | 8      | Aplicada    | 2.5          | 3.5                |
| 9          | 9      | No aplicada | —            | 2.8260869565217392 |
| 10         | 10     | No aplicada | —            | 2.4782608695652173 |

## Eventos de deload

| Microciclo | Semana | Accion      | Motivo      |
| ---------- | ------ | ----------- | ----------- |
| 6          | 6      | planificado | planificado |

## Resumen por semana

| Semana | Sesiones | RIR medio | Volumen total |
| ------ | -------- | --------- | ------------- |
| 0      | 5        | —         | 0             |
| 1      | 5        | 3.75      | 1700          |
| 2      | 5        | 2.02      | 6880          |
| 3      | 5        | 2.75      | 1820          |
| 4      | 5        | 2.76      | 10180         |
| 5      | 5        | 2.6       | 10930         |
| 6      | 5        | 3.23      | 3490          |
| 7      | 5        | 3.53      | 5525          |
| 8      | 5        | 1.19      | 1350          |
| 9      | 5        | 2.78      | 10290         |
| 10     | 5        | 2.48      | 10960         |

## Sesiones (detalle)

| Semana | Dia       | Ciclo | Sesion                               | Perfil   | Saltada | Fatiga subj | Fatiga obj | RIR medio | Volumen | Intensidad avg | Intensidad exp | Orden M/U/A | Reps ok | RIR ok |
| ------ | --------- | ----- | ------------------------------------ | -------- | ------- | ----------- | ---------- | --------- | ------- | -------------- | -------------- | ----------- | ------- | ------ |
| 0      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal   | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal   | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Miércoles | D3    | Piernas Completas                    | normal   | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal   | No      | —           | —          | —         | 0       | —              | 70%            | unknown     | 0/0     | 0/0    |
| 0      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 1      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 1      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 1      | Miércoles | D3    | Piernas Completas                    | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 1      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 1      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | fatigue  | No      | light       | —          | 3.75      | 1700    | 73             | 70-75%         | ok          | 8/8     | 2/8    |
| 2      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal   | No      | —           | —          | 3         | 1820    | 80             | 80%            | ok          | 8/8     | 7/8    |
| 2      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal   | No      | —           | —          | 2.67      | 1520    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 2      | Miércoles | D3    | Piernas Completas                    | off_plan | No      | —           | —          | 1.38      | 890     | 80             | 80%            | ok          | 4/4     | 4/4    |
| 2      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | off_plan | No      | —           | —          | 1.63      | 830     | 73             | 70-75%         | ok          | 4/4     | 3/4    |
| 2      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | off_plan | No      | —           | —          | 1.44      | 1820    | 73             | 70-75%         | ok          | 8/8     | 8/8    |
| 3      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal   | No      | —           | —          | 2.75      | 1820    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 3      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 3      | Miércoles | D3    | Piernas Completas                    | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 3      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 3      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 4      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal   | No      | —           | —          | 2.75      | 1820    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 4      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal   | No      | —           | —          | 2.67      | 1520    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 4      | Miércoles | D3    | Piernas Completas                    | normal   | No      | —           | —          | 2.88      | 1830    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 4      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal   | No      | —           | light      | 2.75      | 1610    | 73             | 70-75%         | ok          | 8/8     | 4/8    |
| 4      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal   | No      | —           | light      | 2.75      | 3400    | 73             | 70-75%         | ok          | 16/16   | 13/16  |
| 5      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | top      | No      | —           | light      | 2         | 1780    | 80             | 80%            | ok          | 8/8     | 6/8    |
| 5      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | top      | No      | —           | —          | 2.67      | 1600    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 5      | Miércoles | D3    | Piernas Completas                    | top      | No      | —           | —          | 2.75      | 1920    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 5      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | top      | No      | —           | —          | 2.75      | 1800    | 73             | 70-75%         | ok          | 8/8     | 8/8    |
| 5      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | top      | No      | —           | —          | 2.81      | 3830    | 73             | 70-75%         | ok          | 16/16   | 16/16  |
| 6      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | top      | No      | —           | light      | 2         | 620     | 56             | 80%            | ok          | 4/4     | 2/4    |
| 6      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | top      | No      | —           | light      | 1.67      | 525     | 56             | 80%            | ok          | 3/3     | 1/3    |
| 6      | Miércoles | D3    | Piernas Completas                    | fatigue  | No      | light       | —          | 4.25      | 590     | 56             | 80%            | ok          | 4/4     | 0/4    |
| 6      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | fatigue  | No      | light       | —          | 4         | 565     | 51.1           | 70-75%         | ok          | 4/4     | 0/4    |
| 6      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | fatigue  | No      | light       | —          | 4.25      | 1190    | 51.1           | 70-75%         | ok          | 8/8     | 0/8    |
| 7      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | fatigue  | No      | light       | —          | 3.75      | 850     | 80             | 80%            | ok          | 4/4     | 1/4    |
| 7      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | fatigue  | No      | light       | light      | 2.67      | 1320    | 80             | 80%            | ok          | 6/6     | 2/6    |
| 7      | Miércoles | D3    | Piernas Completas                    | fatigue  | No      | light       | —          | 3.5       | 850     | 80             | 80%            | ok          | 4/4     | 2/4    |
| 7      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | fatigue  | No      | light       | —          | 4         | 805     | 73             | 70-75%         | ok          | 4/4     | 0/4    |
| 7      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | fatigue  | No      | light       | —          | 3.75      | 1700    | 73             | 70-75%         | ok          | 8/8     | 2/8    |
| 8      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | off_plan | No      | —           | —          | 1.38      | 900     | 80             | 80%            | ok          | 4/4     | 4/4    |
| 8      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | off_plan | No      | —           | —          | 1         | 450     | 80             | 80%            | ok          | 2/2     | 2/2    |
| 8      | Miércoles | D3    | Piernas Completas                    | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 8      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 8      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | miss     | Si      | —           | —          | —         | 0       | —              | —              | —           | —       | —      |
| 9      | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | normal   | No      | —           | —          | 2.75      | 1820    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 9      | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | normal   | No      | —           | —          | 2.83      | 1520    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 9      | Miércoles | D3    | Piernas Completas                    | normal   | No      | —           | light      | 2.5       | 1700    | 80             | 80%            | ok          | 8/8     | 6/8    |
| 9      | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | normal   | No      | —           | light      | 2.75      | 1610    | 73             | 70-75%         | ok          | 8/8     | 4/8    |
| 9      | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | normal   | No      | —           | —          | 3.06      | 3640    | 73             | 70-75%         | ok          | 16/16   | 15/16  |
| 10     | Lunes     | D1    | Empuje Principal (Pecho + Tríceps)   | top      | No      | —           | light      | 2.38      | 1920    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 10     | Martes    | D2    | Tirón Principal (Espalda + Bíceps)   | top      | No      | —           | —          | 2.5       | 1600    | 80             | 80%            | ok          | 6/6     | 6/6    |
| 10     | Miércoles | D3    | Piernas Completas                    | top      | No      | —           | —          | 2.5       | 1920    | 80             | 80%            | ok          | 8/8     | 8/8    |
| 10     | Jueves    | D4    | Empuje Frecuencia 2 (Ligero)         | top      | No      | —           | light      | 2.5       | 1690    | 73             | 70-75%         | ok          | 8/8     | 6/8    |
| 10     | Viernes   | D5    | Tirón Frecuencia 2 + Complementarios | top      | No      | —           | —          | 2.5       | 3830    | 73             | 70-75%         | ok          | 16/16   | 16/16  |

## Estado final

- Cycle day: 1
- Microciclos completados: 10
- Deload activo: no

## Progreso agregado

- Sesiones completadas: 34
- Ejercicios completados: 168
- Series completadas: 285

## Errores

Sin errores.

## Observaciones

- La semana 0 se simulo como calibracion (RIR 3-4, sin progresion).
- Las fechas reales de sesion quedan con la fecha actual del servidor; el calendario del plan se respeta via week_number/day_name.
