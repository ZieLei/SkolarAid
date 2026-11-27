// =====================================================================
// app.ts - the root component. Everything on screen lives inside it.
// <router-outlet>   -> shows the page that matches the URL (see app.routes.ts)
// <app-dialog-host> -> shows confirm pop-ups (core/dialog.ts)
// <app-toast-host>  -> shows small "Saved!" style messages (core/toast.ts)
// =====================================================================
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DialogHost } from './shared/dialog-host';
import { ToastHost } from './shared/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DialogHost, ToastHost],
  template: `<router-outlet /><app-dialog-host /><app-toast-host />`,
})
export class App {}
