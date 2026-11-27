// =====================================================================
// realtime.ts - LIVE updates from the server (SignalR).
//
// Full flow:
// API service changes data -> AppEvents -> RealtimeNotifier (API)
// -> SignalR message over a WebSocket -> this service
// -> a Subject (e.g. paymentsChanged$) fires
// -> pages that called reloadOn([...]) fetch fresh data over HTTP.
//
// The shells (layout/admin-shell.ts, layout/scholar-shell.ts) call
// connect() after login and disconnect() on logout.
// =====================================================================
import { Injectable, InjectionToken, inject, isDevMode, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, debounceTime, merge } from 'rxjs';
import { AuthService } from './auth';

// ---- Server events (names and payloads match api/src/IskolarAid.Api/Realtime/RealtimeNotifier.cs) ----
export interface NotificationReceived { title: string; type: string; }
export interface CountChanged { count: number; }
export interface PaymentsChanged { status: 'Processed' | 'Released'; count: number; }
export interface ComplianceChanged { scholarId: number; requirement: string; status: string; byScholar: boolean; }

export type HubState = 'Disconnected' | 'Connecting' | 'Connected' | 'Reconnecting';

/** Builds the hub connection. A token so tests can hand in a fake connection. */
export const HUB_CONNECTION_FACTORY = new InjectionToken<(accessToken: () => string) => HubConnection>('HUB_CONNECTION_FACTORY', {
  providedIn: 'root',
  factory: () => (accessToken) => new HubConnectionBuilder()
    // Browsers cannot put an Authorization header on a WebSocket; SignalR sends this token as ?access_token=.
    .withUrl('/hubs/notifications', { accessTokenFactory: accessToken })
    .withAutomaticReconnect() // retries after 0, 2, 10 and 30 seconds
    .configureLogging(isDevMode() ? LogLevel.Information : LogLevel.Warning)
    .build(),
});

const RETRY_MS = 5000;

/**
 * ONE SignalR connection for the whole app. Handlers are registered once, when the connection is built, and
 * server events are exposed as RxJS streams. Pages subscribe with takeUntilDestroyed() and reload over HTTP
 * (the source of truth). After any reconnect, `reconnected$` fires so pages can reload what they missed.
 * The server puts each connection in its group (admins / one scholar) from the token, so a reconnect needs no re-join.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private auth = inject(AuthService);
  private build = inject(HUB_CONNECTION_FACTORY);

  readonly state = signal<HubState>('Disconnected');

  readonly notificationReceived$ = new Subject<NotificationReceived>();
  readonly notificationsChanged$ = new Subject<CountChanged>();
  readonly paymentsChanged$ = new Subject<PaymentsChanged>();
  readonly complianceChanged$ = new Subject<ComplianceChanged>();
  readonly reconnected$ = new Subject<void>();

  private connection: HubConnection | null = null;
  private wanted = false;
  private everConnected = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  /** Opens the connection (called by the signed-in shells). Safe to call more than once. */
  connect(): void {
    this.wanted = true;
    if (!this.connection) this.connection = this.create();
    void this.start();
  }

  /** Closes the connection (shell destroyed, i.e. logout). */
  disconnect(): void {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    const c = this.connection;
    this.connection = null;
    this.everConnected = false;
    this.state.set('Disconnected');
    if (c) void c.stop().catch(() => undefined);
  }

  private create(): HubConnection {
    const c = this.build(() => this.auth.token() ?? '');
    // Register handlers ONCE. Registering again would make every event fire twice.
    c.on('NotificationReceived', (e: NotificationReceived) => this.notificationReceived$.next(e));
    c.on('NotificationsChanged', (e: CountChanged) => this.notificationsChanged$.next(e));
    c.on('PaymentsChanged', (e: PaymentsChanged) => this.paymentsChanged$.next(e));
    c.on('ComplianceChanged', (e: ComplianceChanged) => this.complianceChanged$.next(e));

    // Connection lifecycle events
    c.onreconnecting(() => this.state.set('Reconnecting'));
    c.onreconnected(() => { this.state.set('Connected'); this.reconnected$.next(); });
    c.onclose(() => {
      if (c !== this.connection) return; // an old connection closing after logout
      this.state.set('Disconnected');
      this.scheduleRetry(); // automatic reconnect gave up (e.g. the API was down for a while)
    });
    return c;
  }

  private async start(): Promise<void> {
    const c = this.connection;
    if (!this.wanted || !c || c.state !== HubConnectionState.Disconnected) return;
    this.state.set('Connecting');
    try {
      await c.start();
      if (c !== this.connection) return;
      this.state.set('Connected');
      // A fresh start after a lost connection: events may have been missed while offline.
      if (this.everConnected) this.reconnected$.next();
      this.everConnected = true;
    } catch {
      if (c !== this.connection) return;
      this.state.set('Disconnected');
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer);
    if (this.wanted && this.auth.isLoggedIn()) this.retryTimer = setTimeout(() => void this.start(), RETRY_MS);
  }
}

/**
 * Re-runs `reload` (an HTTP load) whenever one of `sources` fires, and after reconnecting.
 * Bursts are combined (one reload per 300 ms). Call from a constructor or field initializer: the subscription
 * ends with the component (takeUntilDestroyed), so revisiting a page never adds a second listener.
 */
export function reloadOn(sources: Observable<unknown>[], reload: () => unknown): void {
  const rt = inject(RealtimeService);
  merge(...sources, rt.reconnected$).pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => { Promise.resolve().then(reload).catch(() => undefined); });
}
