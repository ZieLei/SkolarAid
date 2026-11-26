import { HttpErrorResponse, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject, isDevMode } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { AuthService } from './auth';

/** Adds the Bearer token to API calls and signs the user out when the server says the session is invalid. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authed = token && req.url.startsWith('/api') ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((err) => {
      if (err.status === 401 && !req.url.endsWith('/auth/login') && auth.isLoggedIn()) void auth.logout(false);
      return throwError(() => err);
    }),
  );
};

/**
 * Development aid: logs every API call with its status and duration, e.g. "[HTTP] GET /api/scholar/payments -> 200 (14 ms)".
 * Filter the browser console by "[HTTP]" to follow requests; "FAILED 0" means the API could not be reached.
 */
export const httpLoggingInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isDevMode()) return next(req);
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  return next(req).pipe(
    tap({
      next: (event) => { if (event.type === HttpEventType.Response) console.log(`[HTTP] ${req.method} ${req.urlWithParams} -> ${event.status} (${ms()} ms)`); },
      error: (err: HttpErrorResponse) => console.warn(`[HTTP] ${req.method} ${req.urlWithParams} -> FAILED ${err.status} (${ms()} ms)`),
    }),
  );
};

export const roleGuard = (role: 'ADMIN' | 'SCHOLAR'): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.parseUrl('/login');
  if (auth.user()!.role !== role) return router.parseUrl(auth.homeRoute());
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).parseUrl(auth.homeRoute()) : true;
};
