// =====================================================================
// dialog.ts - pop-up boxes (confirm, info, success, warning, error).
//
// How to use from a page:
// if (await this.dialog.confirm('Delete this file?')) { ...delete... }
//
// How it works: confirm() saves the box in the "current" signal and
// returns a Promise. DialogHost (shared/dialog-host.ts) shows the box.
// When the user clicks a button, close(true/false) answers the Promise.
// =====================================================================
import { Injectable, signal } from '@angular/core';

export interface DialogState {
  title: string; message: string; kind: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  confirmText: string; cancelText: string; danger?: boolean; resolve: (ok: boolean) => void;
}

/** Replacement for WinForms MessageBox: a confirm()/alert() that works inside the page. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogState | null>(null);

  private open(title: string, message: string, kind: DialogState['kind'], confirmText = 'OK', cancelText = 'Cancel', danger = false): Promise<boolean> {
    return new Promise((resolve) => this.current.set({ title, message, kind, confirmText, cancelText, danger, resolve }));
  }

  // Called by DialogHost when a button is clicked: hide the box and answer the waiting page.
  close(ok: boolean): void { const c = this.current(); this.current.set(null); c?.resolve(ok); }

  /** `danger` styles the confirm button red (irreversible actions). */
  confirm(message: string, title = 'Confirm', confirmText = 'Yes', cancelText = 'No', danger = false): Promise<boolean> { return this.open(title, message, 'confirm', confirmText, cancelText, danger); }
  info(message: string, title = 'Information'): Promise<boolean> { return this.open(title, message, 'info'); }
  success(message: string, title = 'Success'): Promise<boolean> { return this.open(title, message, 'success'); }
  warning(message: string, title = 'Warning'): Promise<boolean> { return this.open(title, message, 'warning'); }
  error(message: string, title = 'Error'): Promise<boolean> { return this.open(title, message, 'error'); }
}
