import { Routes } from '@angular/router';
import { Dashboard } from './dashboard';
import { Login } from './login';
import { Admin } from './admin';
import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', component: Dashboard, canActivate: [authGuard] },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'admin', component: Admin, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
