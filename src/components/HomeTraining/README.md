# Entrenamiento en Casa — Resumen funcional y cambios recientes

Este documento resume el estado funcional actual de la funcionalidad “Entrenamiento en Casa” y los cambios realizados en esta iteración.

## Visión general

- Selección de equipamiento por tarjetas (Mínimo / Básico / Avanzado) y nuevo modo “Mi equipamiento”.
- Selección de tipo de entrenamiento (Funcional / HIIT / Fuerza).
- Generación de plan con IA (OpenAI) usando el perfil del usuario, su equipamiento y su historial.
- Visualización del plan, inicio de sesión de entrenamiento, progreso y registro de ejercicios.

## Novedades clave de esta iteración

### 1) Tarjeta “Mi equipamiento” (centrada y con poder de selección)
- Componente: `UserEquipmentSummaryCard.jsx`
- Estado: centrada, muestra un resumen (curated + custom) y dos acciones:
  - “Gestionar mi equipamiento” → navega a Perfil > Mi equipamiento.
  - “Usar este equipamiento” → selecciona un modo de equipamiento especial que usa exactamente el inventario del usuario.
- Integración en HomeTraining: el botón llama a un handler (`onUsePersonalized`) que establece `selectedEquipment = 'usar_este_equipamiento'`.

### 2) Nuevo modo de equipamiento “usar_este_equipamiento”
- Frontend: `HomeTrainingSection.jsx` envía en el body de la generación:
  ```json
  { "equipment_type": "usar_este_equipamiento", "training_type": "hiit|fuerza|funcional" }
  ```
- Backend: `IAHomeTraining.js`
  - Acepta `equipment_type` en {`minimo`,`basico`,`avanzado`,`personalizado`,`usar_este_equipamiento`}.
  - Para `personalizado` y `usar_este_equipamiento` arma el guardarraíl de implementos con el inventario real del usuario:
    - Curated (codes) de `app.user_equipment`.
    - Custom (texto libre) de `app.user_custom_equipment` (normalizados a tokens simples).

### 3) Perfil > Mi equipamiento — UX
- Componente: `EquipmentTab.jsx`
- Columnas rápidas por nivel (chips):
  - Mínimo: Toallas, Silla/Sofá
  - Básico: Esterilla, Cintas elásticas, Mancuernas, Banco/Step
  - Avanzado: TRX, Barra con discos profesionales
- Catálogo completo filtrable: reactivado bajo un toggle “Mostrar/Ocultar catálogo completo”.
- Texto libre: permite añadir elementos personalizados (persisten y se listan).

### 4) Ajustes backend relacionados
- `routes/IAHomeTraining.js`:
  - Carga perfil desde `app.v_user_profile_normalized`.
  - Carga equipamiento curado y personalizado del usuario.
  - Construye prompt con perfil, historial mixto (completado y propuesto, priorizando completado), guardarraíl de implementos y directrices según tipo de entrenamiento.
- `routes/equipment.js`:
  - Catalog: usa `app.equipment_catalog` si existe; si no, `app.equipment_items`.
  - User equipment: compatibilidad con `equipment_key` y (cuando existe) `equipment_id`.
  - Custom equipment: inserta `user_custom_equipment (user_id, name)` con `ON CONFLICT (user_id, name) DO NOTHING`.

## Flujo de uso

1) El usuario gestiona su inventario en Perfil > Mi equipamiento:
   - Marca chips (curated) y/o añade texto libre (custom).
   - Puede desplegar el catálogo completo por niveles.
2) En Entrenamiento en Casa:
   - Puede elegir una de las tarjetas de nivel (Mínimo/Básico/Avanzado), o bien pulsar “Usar este equipamiento” en la tarjeta grande.
   - Selecciona tipo (Funcional/HIIT/Fuerza).
   - Pulsa “Generar mi entrenamiento”.
3) El backend genera un plan con IA y se muestra en un modal; desde ahí puede iniciar entrenamiento y se registra el progreso/estado de cada ejercicio.

## Componentes principales

- `HomeTrainingSection.jsx`
  - Estados: `selectedEquipment`, `selectedTrainingType`, `isGenerating`, `generatedPlan`, `showPersonalizedMessage`, progreso de sesión, etc.
  - Función `generateTraining()` → POST `/api/ia-home-training/generate`.
  - Render: tarjetas de equipamiento, tarjeta “Mi equipamiento”, selector de tipo, CTA de generar, modales de plan y ejercicio, progreso.

- `UserEquipmentSummaryCard.jsx`
  - Obtiene curated y custom del usuario desde `/api/equipment/user`.
  - Muestra un preview (hasta 6 elementos).
  - Acciones: gestionar (navega a Perfil) y usar este equipamiento (activa el modo personalizado).

- `EquipmentTab.jsx` (Perfil)
  - Carga catálogo y equipamiento del usuario.
  - Columnas rápidas + (toggle) catálogo completo por niveles.
  - Añadir/Eliminar personalizados.

- Backend `routes/IAHomeTraining.js`
  - Valida parámetros, carga perfil/equipo/historial, define inventarios por nivel o personalizados y llama OpenAI.
  - Normaliza descansos y calcula duración estimada cuando no se provee.

## Notas de integración / BD

- Si tu esquema tiene `app.user_equipment` con FK a `app.equipment_catalog(id)`, el modo `usar_este_equipamiento` funciona igual; sólo recuerda que para guardar chips nuevos el `code` debe existir en catálogo.
- Alternativa (recomendada para iterar rápido): trabajar sólo con `equipment_key` sin FK dura a catálogo. (Pendiente de decidir y ejecutar la migración simple si se desea.)
- La vista `app.v_user_profile_normalized` expone “lesiones” y “limitaciones_fisicas” (compatibilidad), priorizando `lesiones`.

## Ejemplo de petición a la IA

```http
POST /api/ia-home-training/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "equipment_type": "usar_este_equipamiento", // o minimo|basico|avanzado|personalizado
  "training_type": "hiit" // o fuerza|funcional
}
```

## Próximos pasos propuestos (opcionales)
- Migración a sólo `equipment_key` para simplificar altas de nuevos implementos.
- Toggle opcional para volver a mostrar permanentemente el catálogo completo en Perfil.
- Vista/endpoint admin para ver mapeo `code -> id` del catálogo y detectar faltantes.

