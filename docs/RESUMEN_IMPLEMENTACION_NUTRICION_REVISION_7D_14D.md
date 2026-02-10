Ahora mismo, el módulo de nutrición hace esto (y es lo que hemos implementado):

- **Te muestra una “Revisión semanal”** basada en tendencia (media de los últimos 7 días vs los 7 anteriores) y te dice algo tipo: _“Vas bien / vas lento / vas rápido / datos insuficientes”_.  
  Importante: **esto no toca tus calorías por defecto**, es solo feedback claro.

- **Te muestra una “Revisión quincenal” (cada 14 días)** que, cuando toca por cadencia, puede **recomendar un ajuste de kcal** (subir o bajar) usando:
  - comparativa 7d vs 7d
  - confirmación anti-ruido (solo actúa con datos suficientes)
  - y reglas para **no ajustar si hay “ruido”** (viaje/enfermedad/semana caótica, cheat/diet break, outliers de peso).

- **Dos modos según tus datos**:
  - **Modo SIMPLE**: aunque no registres comidas/kcal, **te damos feedback** con tus pesajes; **no hay autoajustes**.
  - **Modo FINO**: si hay **datos suficientes**, habilita la lógica de ajuste quincenal (y la UI te lo deja claro).

- **“Adherencia” aquí significa “completitud de datos”**, no “ser perfecto”:
  - un día cuenta si metes **kcal totales**, o comidas/macros, o marcas **día libre/cheat/diet break**.
  - para entrar en modo FINO: **≥80% días registrados (14d)** y **pesajes suficientes**.

- **Separación clave para no liarla**:
  - una cosa es “tengo datos suficientes”
  - otra es “estoy cumpliendo el objetivo de kcal”.  
    Si hay datos pero **cumplimiento bajo**, el sistema **no ajusta kcal** y te lo explica (porque el problema no es el cálculo, es la ejecución).

- **Botón de “Aplicar ajuste” y “Deshacer”**:
  - en este rollout, el sistema **no te cambia calorías solo**: te muestra recomendación y tú decides.
  - si aplicas un ajuste, se **regenera el plan nutricional activo** para que no haya el típico bug de “perfil nuevo / plan viejo”.
  - se guarda una acción reversible y tienes **“Deshacer” durante 24h**.

- **UI nueva (visible en tu captura)**:
  - bloque fijo de revisión semanal/quincenal con métricas usadas (medias, ritmo, adherencia, pesajes, ruido, compliance).
  - “Registro rápido” para hoy: kcal + tipo de día + banderas de ruido.

- **Arreglos de coherencia UX que vimos en tus capturas**:
  - ahora el objetivo semanal deja claro si es **pérdida o ganancia**, y el “ritmo” muestra **signo** y si vas **subiendo/bajando**.
  - el panel de progresión (ICG/IPG) ya no se queda en fase `unknown` si puede deducirla del plan de nutrición.
  - cuando IPG/ICG no aplica, ya no pone “Desconocido”: pone **“Sin señal”** y explica **por qué**.

- **Tests**:
  - añadimos y ejecutamos tests de backend que simulan 7/14 días para validar todo esto **sin tener que esperar dos semanas en la vida real** (migraciones, review, ruido, apply/undo, edge cases). Pasan.

- **Para que lo vieras “hoy”**: te cargué datos de ejemplo en tu usuario (registros diarios y mediciones) para que el panel entrase en **Modo FINO** y mostrase tendencia inmediatamente. La **quincenal** te sale “pendiente” porque tu plan activo es de hoy y respeta la cadencia de 14 días.
