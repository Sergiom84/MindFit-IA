/**
 * Servicio de diálogos accesibles (QA-001): reemplaza `window.confirm`/`window.alert`
 * nativos (no accesibles, bloquean el hilo, sin foco atrapado ni roles ARIA) por
 * diálogos Radix (@/components/ui/dialog): foco atrapado, cierre con ESC, títulos y
 * descripciones etiquetados y navegación por teclado.
 *
 * API imperativa usable desde cualquier fichero (incluidos utils sin hooks):
 *   const ok = await confirmDialog({ title, description, confirmText, cancelText, destructive })
 *   await alertDialog({ title, description })            // o alertDialog('mensaje')
 *
 * Requiere montar <DialogServiceHost /> una sola vez cerca de la raíz de la app.
 */
import { useSyncExternalStore, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';

let currentDialog = null;
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentDialog;
}

function openDialog(config) {
  return new Promise((resolve) => {
    currentDialog = { ...config, resolve };
    emit();
  });
}

function resolveCurrent(value) {
  const dialog = currentDialog;
  currentDialog = null;
  emit();
  if (dialog) dialog.resolve(value);
}

const normalizeOptions = (options) =>
  typeof options === 'string' ? { description: options } : (options || {});

/** Confirmación accesible. Resuelve a `true`/`false`. */
export function confirmDialog(options) {
  const o = normalizeOptions(options);
  return openDialog({
    kind: 'confirm',
    title: o.title || 'Confirmar',
    description: o.description || '',
    confirmText: o.confirmText || 'Aceptar',
    cancelText: o.cancelText || 'Cancelar',
    destructive: Boolean(o.destructive)
  });
}

/** Aviso accesible. Resuelve cuando el usuario cierra. */
export function alertDialog(options) {
  const o = normalizeOptions(options);
  return openDialog({
    kind: 'alert',
    title: o.title || 'Aviso',
    description: o.description || '',
    confirmText: o.confirmText || 'Entendido'
  });
}

export function DialogServiceHost() {
  const dialog = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const handleOpenChange = useCallback((open) => {
    // Cerrar por ESC / click fuera equivale a cancelar (confirm) o cerrar (alert).
    if (!open) resolveCurrent(dialog?.kind === 'confirm' ? false : undefined);
  }, [dialog]);

  if (!dialog) return null;

  const isConfirm = dialog.kind === 'confirm';

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-neutral-900/95 border border-white/10 ring-1 ring-white/5 text-white">
        <DialogHeader>
          <DialogTitle>{dialog.title}</DialogTitle>
          {dialog.description
            ? <DialogDescription className="whitespace-pre-line text-gray-200/80">{dialog.description}</DialogDescription>
            : null}
        </DialogHeader>
        <DialogFooter>
          {isConfirm && (
            <Button
              variant="outline"
              className="border-white/10 text-gray-200/80 hover:bg-white/10"
              onClick={() => resolveCurrent(false)}
            >
              {dialog.cancelText}
            </Button>
          )}
          <Button
            autoFocus
            className={dialog.destructive
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'}
            onClick={() => resolveCurrent(isConfirm ? true : undefined)}
          >
            {dialog.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
