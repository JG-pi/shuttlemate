import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { FirebaseService } from './firebase';

/**
 * Waits until Firebase has finished restoring the auth session (authReady$ === true)
 * before deciding anything. This is the key to avoiding the "kicked back to login"
 * race: on a fresh page load the current user is momentarily null while Firebase
 * checks persistence, so we must not judge logged-in/logged-out until it has answered.
 */
export const authGuard: CanActivateFn = () => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);

  return firebase.authReady$.pipe(
    filter(ready => ready),
    take(1),
    map(() => (firebase.currentUserSig() ? true : router.createUrlTree(['/login'])))
  );
};

/**
 * Inverse of authGuard for the /login route: if the visitor is already signed in,
 * send them to the dashboard instead of showing the login form again.
 */
export const guestGuard: CanActivateFn = () => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);

  return firebase.authReady$.pipe(
    filter(ready => ready),
    take(1),
    map(() => (firebase.currentUserSig() ? router.createUrlTree(['/']) : true))
  );
};
