# Active implementation

- active_slug: crossfit-profesional-v2
- active_path: docs/crossfit
- branch: codex/crossfit-profesional-v2
- worktree: /Users/pablo/Documents/mindfit-crossfit-profesional
- base_sha: e7f57116363d9283a27c1d5d375da674414ddf1f
- synced_main_sha: 649360080325ea4f72182db54bafc8f12799ccba
- pr: Sergiom84/MindFit-IA#63
- code_evidence_ci: 30050111128
- documentation_evidence_ci: 30052016347
- started_at: 2026-07-22 Europe/Madrid
- status: technical_ci_green_security_incident_blocks_merge

Límites: rama aislada y PR #63 en borrador; sin escritura en Supabase/Render,
despliegues, migraciones productivas ni activación de flags.
`CROSSFIT_EMITS_TRAINING_LOAD` y nutrición CrossFit permanecen desactivados hasta
completar shadow, métricas y las validaciones humanas preproducción.
PostgreSQL/RLS/E2E ya están verdes en CI aislado. El PR no puede pasar a ready ni
fusionarse mientras GitGuardian mantenga el hallazgo histórico `Triggered`;
rotación/remediación de la credencial, validación humana/legal, shadow productivo
y autorización de rollout siguen abiertos.
