// =====================================================================
// avatar.ts - <app-avatar path="/me/picture" /> shows a profile picture.
//
// The picture needs the login token, so a plain <img src> cannot load it.
// Instead we fetch it with HttpClient (the token is added automatically),
// turn it into a temporary "blob:" address and show that.
// No picture (the API answers 204) -> a plain person icon.
// It reloads when the path changes or when ProfilePictures.changed() is called
// (e.g. right after the user uploads a new picture).
// =====================================================================
import { Component, Injectable, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppIcon } from './icon';

/** Tells every avatar on screen to reload (after an upload or removal). */
@Injectable({ providedIn: 'root' })
export class ProfilePictures {
  readonly version = signal(0);
  changed(): void { this.version.update((v) => v + 1); }
}

@Component({
  selector: 'app-avatar',
  imports: [AppIcon],
  host: { class: 'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e6eef0] text-brand' },
  template: `@if (url(); as u) { <img [src]="u" [alt]="alt()" class="h-full w-full object-cover" /> } @else { <app-icon name="user" class="h-[70%] w-[70%]" [attr.aria-label]="alt() || null"></app-icon> }`,
})
export class Avatar {
  /** API path of the picture, without "/api" (e.g. "/me/picture"). */
  path = input.required<string>();
  alt = input('');
  url = signal<string | null>(null);
  private http = inject(HttpClient);
  private pictures = inject(ProfilePictures);

  constructor() {
    effect((onCleanup) => {
      const path = this.path(); this.pictures.version();
      let href: string | null = null;
      const sub = this.http.get(`/api${path}`, { responseType: 'blob' }).subscribe({
        // An empty answer (204) means "no picture yet".
        next: (b) => { if (!b || b.size === 0) { this.url.set(null); return; } href = URL.createObjectURL(b); this.url.set(href); },
        error: () => this.url.set(null),
      });
      // Free the old image when the path changes or the avatar leaves the screen.
      onCleanup(() => { sub.unsubscribe(); if (href) URL.revokeObjectURL(href); });
    });
  }
}
