// =====================================================================
// api.ts - the ONE place pages use to talk to the back end.
//
// Example from a page:
// this.api.get<Scholar[]>('/admin/scholars', { search: 'ana' })
// -> GET /api/admin/scholars?search=ana
// The login token is added automatically by authInterceptor (core/http.ts).
// In dev the /api calls are forwarded to the ASP.NET API (proxy).
// =====================================================================
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

type Params = Record<string, string | number | boolean | null | undefined>;

/** Thin wrapper over HttpClient. All endpoints are relative to /api (proxied in dev, reverse-proxied in Docker). */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  // Turn { a: 1, b: '' } into "?a=1" (empty values are skipped).
  private params(p?: Params): HttpParams {
    let hp = new HttpParams();
    for (const [k, v] of Object.entries(p ?? {})) if (v !== null && v !== undefined && v !== '') hp = hp.set(k, String(v));
    return hp;
  }

  get<T>(url: string, p?: Params): Observable<T> { return this.http.get<T>(`${this.base}${url}`, { params: this.params(p) }); }
  post<T>(url: string, body: unknown = {}): Observable<T> { return this.http.post<T>(`${this.base}${url}`, body); }
  put<T>(url: string, body: unknown = {}): Observable<T> { return this.http.put<T>(`${this.base}${url}`, body); }
  delete<T>(url: string): Observable<T> { return this.http.delete<T>(`${this.base}${url}`); }

  upload<T>(url: string, form: FormData): Observable<T> { return this.http.post<T>(`${this.base}${url}`, form); }

  /** Fetches a file (CSV, Word, attachment) with the auth header and hands it to the browser as a download. */
  async download(url: string, p?: Params, fallbackName = 'download'): Promise<void> {
    const res = await new Promise<HttpResponse<Blob>>((resolve, reject) =>
      this.http.get(`${this.base}${url}`, { params: this.params(p), responseType: 'blob', observe: 'response' }).subscribe({ next: resolve, error: reject }));
    this.save(res, fallbackName);
  }

  /** Same as download(), for files the server builds from a POSTed body (e.g. blank Word templates). */
  async downloadPost(url: string, body: unknown, fallbackName = 'download'): Promise<void> {
    const res = await new Promise<HttpResponse<Blob>>((resolve, reject) =>
      this.http.post(`${this.base}${url}`, body, { responseType: 'blob', observe: 'response' }).subscribe({ next: resolve, error: reject }));
    this.save(res, fallbackName);
  }

  private save(res: HttpResponse<Blob>, fallbackName: string): void {
    // Take the file name from the server's Content-Disposition header, then
    // "click" a hidden link so the browser saves the file.
    const cd = res.headers.get('Content-Disposition') ?? '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : fallbackName;
    const a = document.createElement('a');
    const href = URL.createObjectURL(res.body!);
    a.href = href; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  /** Opens an attachment in a new tab (PDF/image viewers), like the desktop app opening the file. */
  async open(url: string): Promise<void> {
    const res = await new Promise<HttpResponse<Blob>>((resolve, reject) =>
      this.http.get(`${this.base}${url}`, { responseType: 'blob', observe: 'response' }).subscribe({ next: resolve, error: reject }));
    const href = URL.createObjectURL(res.body!);
    window.open(href, '_blank');
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
}

/** Turns a ProblemDetails / validation error response into one readable sentence. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Please check your connection.';
    const b = err.error;
    if (b && typeof b === 'object') {
      if (b.errors && typeof b.errors === 'object') {
        const first = Object.values(b.errors as Record<string, string[]>)[0];
        if (Array.isArray(first) && first.length) return first[0];
      }
      if (typeof b.detail === 'string' && b.detail) return b.detail;
      if (typeof b.title === 'string' && b.title) return b.title;
    }
    if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (err.status === 403) return 'You do not have permission to do that.';
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
