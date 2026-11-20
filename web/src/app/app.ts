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
