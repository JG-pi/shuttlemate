import {RenderMode, ServerRoute} from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Auth state only exists in the browser, so prerendering these routes at build
    // time bakes in a "logged out" redirect. Render on the client instead and let the
    // route guards decide once Firebase has restored the session.
    path: '**',
    renderMode: RenderMode.Client,
  },
];
