// =====================================================================
// main.ts - the very first file that runs in the browser.
// It starts the Angular app: the root component (app/app.ts)
// with the settings in app/app.config.ts.
// =====================================================================
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
