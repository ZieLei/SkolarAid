import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HubConnection, HubConnectionState } from '@microsoft/signalr';
import { HUB_CONNECTION_FACTORY, NotificationReceived, RealtimeService } from './realtime';

/** A stand-in for the SignalR connection: records handlers so the test can "raise" server events. */
class FakeConnection {
  state = HubConnectionState.Disconnected;
  handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  reconnected?: () => void;
  closed?: () => void;
  startCalls = 0;
  failStart = false;

  on(name: string, h: (...args: unknown[]) => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), h]);
  }
  onreconnecting() {
    /* not needed */
  }
  onreconnected(h: () => void) {
    this.reconnected = h;
  }
  onclose(h: () => void) {
    this.closed = h;
  }
  async start() {
    this.startCalls++;
    if (this.failStart) throw new Error('down');
    this.state = HubConnectionState.Connected;
  }
  async stop() {
    this.state = HubConnectionState.Disconnected;
  }
  /** Simulates the server sending an event to this client. */
  raise(name: string, ...args: unknown[]) {
    (this.handlers.get(name) ?? []).forEach((h) => h(...args));
  }
}

describe('RealtimeService', () => {
  let fake: FakeConnection;
  let built: number;

  beforeEach(() => {
    fake = new FakeConnection();
    built = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: HUB_CONNECTION_FACTORY,
          useValue: () => {
            built++;
            return fake as unknown as HubConnection;
          },
        },
      ],
    });
  });

  it('publishes server events on its streams', async () => {
    const rt = TestBed.inject(RealtimeService);
    const received: NotificationReceived[] = [];
    rt.notificationReceived$.subscribe((n) => received.push(n));

    rt.connect();
    await Promise.resolve();
    fake.raise('NotificationReceived', { title: 'Payment Released!', type: 'Update' });

    expect(received).toEqual([{ title: 'Payment Released!', type: 'Update' }]);
    expect(rt.state()).toBe('Connected');
  });

  it('registers each handler once, even when connect() is called again', async () => {
    const rt = TestBed.inject(RealtimeService);
    rt.connect();
    rt.connect();
    rt.connect();
    await Promise.resolve();

    expect(built).toBe(1);
    expect(fake.handlers.get('NotificationReceived')?.length).toBe(1);
  });

  it('tells pages to reload after reconnecting', async () => {
    const rt = TestBed.inject(RealtimeService);
    let reloads = 0;
    rt.reconnected$.subscribe(() => reloads++);
    rt.connect();
    await Promise.resolve();

    fake.reconnected?.();

    expect(reloads).toBe(1);
    expect(rt.state()).toBe('Connected');
  });

  it('shows Disconnected when the server cannot be reached', async () => {
    fake.failStart = true;
    const rt = TestBed.inject(RealtimeService);
    rt.connect();
    await Promise.resolve();
    await Promise.resolve();

    expect(rt.state()).toBe('Disconnected');
    rt.disconnect(); // stops the retry timer
  });
});
