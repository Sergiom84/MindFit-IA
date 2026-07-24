# Active implementation

- active_slug: crossfit-profesional-v2
- active_path: docs/crossfit
- branch: codex/crossfit-profesional-v2-clean
- worktree: /tmp/mindfit-crossfit-clean
- base_sha: c233ceb10aa69863e1b2efe483a77a324400273f
- synced_main_sha: c233ceb10aa69863e1b2efe483a77a324400273f
- pr: pendiente; sustituirá Sergiom84/MindFit-IA#63
- code_evidence_ci: 30050111128
- documentation_evidence_ci: 30052016347
- started_at: 2026-07-22 Europe/Madrid
- status: rebuilding_clean_history_from_sanitized_main

Límites: rama aislada; sin escritura en Supabase/Render,
despliegues, migraciones productivas ni activación de flags.
`CROSSFIT_EMITS_TRAINING_LOAD` y nutrición CrossFit permanecen desactivados hasta
completar shadow, métricas y las validaciones humanas preproducción.
El saneamiento de la plantilla se fusionó mediante PR #67 en `main@c233ceb` con
CI y GitGuardian verdes. La implementación se reconstruye desde ese SHA sin
heredar el commit histórico contaminado; PR #63 permanece abierto hasta que el
PR sustituto demuestre equivalencia y todos sus checks sean verdes. Las
validaciones humana/legal, el shadow productivo y la autorización de rollout
siguen abiertos.
