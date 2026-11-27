// =====================================================================
// app.routes.ts - which page shows for which URL.
//
// /login, /signup     -> only when NOT logged in (guestGuard)
// /admin/...          -> only for ADMIN users; pages sit inside AdminShell (sidebar)
// /scholar/...        -> only for SCHOLAR users; pages sit inside ScholarShell
// anything else       -> back to /login
//
// loadComponent(() => import(...)) loads a page's code only when it is
// first opened, so the app starts faster.
// Guards (roleGuard, guestGuard) are in core/http.ts.
// =====================================================================
import { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/http';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login').then((m) => m.LoginPage),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/signup').then((m) => m.SignUpPage),
  },
  { path: 'register', redirectTo: 'signup' }, // old link
  {
    path: 'admin',
    canActivate: [roleGuard('ADMIN')],
    loadComponent: () => import('./layout/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/admin/dashboard').then((m) => m.AdminDashboardPage),
      },
      {
        path: 'scholars',
        loadComponent: () => import('./pages/admin/scholars').then((m) => m.ScholarsPage),
      },
      {
        path: 'payroll',
        loadComponent: () => import('./pages/admin/payroll').then((m) => m.PayrollPage),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/admin/reports').then((m) => m.ReportsPage),
      },
      {
        path: 'activity-logs',
        loadComponent: () => import('./pages/admin/activity-logs').then((m) => m.ActivityLogsPage),
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/admin/notifications').then((m) => m.NotificationsPage),
      },
    ],
  },
  {
    path: 'scholar',
    canActivate: [roleGuard('SCHOLAR')],
    loadComponent: () => import('./layout/scholar-shell').then((m) => m.ScholarShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/scholar/dashboard').then((m) => m.ScholarDashboardPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/scholar/profile').then((m) => m.ScholarProfilePage),
      },
      {
        path: 'payments',
        loadComponent: () => import('./pages/scholar/payments').then((m) => m.ScholarPaymentsPage),
      },
      {
        path: 'compliance',
        loadComponent: () =>
          import('./pages/scholar/compliance').then((m) => m.ScholarCompliancePage),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./pages/scholar/notifications').then((m) => m.ScholarNotificationsPage),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
