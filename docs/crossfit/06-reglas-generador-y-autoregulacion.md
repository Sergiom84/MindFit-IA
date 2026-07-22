# Indice normativo: generador y autorregulacion

La primera version mezclaba principios y una heuristica insuficiente. La especificacion implementable queda separada:

- [Biblioteca WOD y composicion](./14-biblioteca-wods-y-composicion.md)
- [Contrato del generador e invariantes](./15-contrato-generador-e-invariantes.md)
- [Maquina de estados de autorregulacion](./16-maquina-estados-autoregulacion.md)
- [Invariantes CSV](./data/generator_invariants.csv)
- [Reason codes](./data/reason_codes.csv)
- [Reglas de formatos WOD](./data/wod_format_rules.csv)

## Reemplazo exacto del comportamiento legacy

| Legacy                                  | Reemplazo v2                                                |
| --------------------------------------- | ----------------------------------------------------------- |
| nivel decidido por prompt               | score multidimensional + confianza + permisos               |
| eleccion aleatoria                      | seed, hard filters, integer scoring y hash tie-break        |
| dos faciles progresan/tres duros deload | reducer NORMAL/BUILD/HOLD/RECOVERY/DELOAD/RETURN/BLOCKED    |
| lesiones por regex de zona              | screening estructurado + matriz, regex fallback conservador |
| Rx como señal de nivel                  | escala independiente por movimiento                         |
| texto WOD                               | contrato versionado con score/dosis/stimulus                |
| historial mutable/opaco                 | eventos idempotentes + snapshot y trace                     |

## Invariantes maestras

1. Ninguna salida invalida puede persistirse.
2. Un fallback nunca relaja seguridad, skill o equipo.
3. Misma entrada/version/revision produce mismo plan.
4. Una sesion completada no se regenera.
5. Solo una variable progresa por sesion.
6. La seguridad prevalece sobre rendimiento.
7. IA solo explica o ordena candidatos ya validos.
8. Toda decision lleva ruleset y reason code.

`IMPLEMENTACION_EN_RAMA`; carga y eventos se desarrollan con flags apagados. Su activación permanece `PENDIENTE_GATE_LOAD_SHADOW`.
