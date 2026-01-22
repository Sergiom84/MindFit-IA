# Reporte tecnico - Simulacion HipertrofiaV2

## Configuracion de ejecucion

- Usuario: entrenaconia@test.com (ID 33)
- API_BASE: http://localhost:3010
- Inicio plan: 2026-01-26
- Semanas simuladas: 10
- Semana 0: omitida
- Sabados: no
- Plan: — (—)
- Motor: — | Progresion: —

## Flujo ejecutado

1. Login usuario
2. Cancelacion de plan activo
3. Generacion de plan D1-D5 HipertrofiaV2
4. Confirmacion del plan
5. Simulacion de 10 semanas x 5 sesiones
6. Registro de sets, progreso y cierre de sesion
7. Avance de ciclo y progresion por microciclo
8. Verificacion de deload
9. Resumen de progreso y estado final

## Resumen global

- Sesiones completadas: 0
- Ejercicios completados: 0
- Sets registrados: 0
- Volumen total estimado: 0

## Progresion por microciclo

Sin datos.

## Eventos de deload

Sin datos.

## Resumen por semana

Sin datos.

## Sesiones (detalle)

Sin datos.

## Estado final

Sin datos

## Progreso agregado

Sin datos

## Observaciones

- La semana 0 se omitio porque el endpoint de sesiones no acepta week_number=0.
- Las fechas reales de sesion quedan con la fecha actual del servidor; el calendario del plan se respeta via week_number/day_name.
