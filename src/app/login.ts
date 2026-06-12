import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { FirebaseService } from './firebase';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './login.html',
  host: {
    class: 'block min-h-screen bg-neutral-50 flex items-center justify-center p-4 md:p-8 animate-fade-in'
  }
})
export class Login {
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  isRegisterMode = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  loading = signal<boolean>(false);

  // Reactive Forms with rigorous type support and validations
  loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)]
    }),
    name: new FormControl('', {
      nonNullable: true
    })
  });

  constructor() {
    // If user is already logged in, push them to the system dashboard
    this.firebaseService.user$.subscribe(user => {
      if (user) {
        this.router.navigate(['/']);
      }
    });
  }

  toggleMode(): void {
    const currentMode = this.isRegisterMode();
    this.isRegisterMode.set(!currentMode);
    this.errorMessage.set(null);
    
    // Manage dynamic validations for name field when changing modes
    const nameControl = this.loginForm.controls.name;
    if (!currentMode) {
      nameControl.setValidators([Validators.required, Validators.minLength(2)]);
    } else {
      nameControl.clearValidators();
    }
    nameControl.updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.errorMessage.set('Please make sure all fields are valid.');
      return;
    }

    const { email, password, name } = this.loginForm.getRawValue();
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      if (this.isRegisterMode()) {
        await this.firebaseService.signUp(email, password, name || 'User');
      } else {
        await this.firebaseService.signIn(email, password);
      }
      this.router.navigate(['/']);
    } catch (error: unknown) {
      console.error('Authentication error: ', error);
      let errorText = 'An error occurred during authentication. Please try again.';
      const err = error as { code?: string; message?: string };
      
      // Provide a proactive, highly helpful user guide for potential configuration challenges
      if (err.code === 'auth/configuration-not-found') {
        errorText = 'Email/Password provider is not yet enabled in the Firebase Console. Please open your Firebase auth console and enable "Email/Password" sign-in method!';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorText = 'Invalid email address or password. Please verify your credentials and try again.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorText = 'This email is already registered. Try logging in instead.';
      } else if (err.message) {
        errorText = err.message;
      }
      this.errorMessage.set(errorText);
    } finally {
      this.loading.set(false);
    }
  }

  async onGoogleContinue(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const user = await this.firebaseService.signInWithGoogle();
      if (user) {
        this.router.navigate(['/']);
      }
    } catch (error: unknown) {
      console.error('Google authentication error: ', error);
      const err = error as { code?: string; message?: string };
      let errorText = 'Google sign-in could not be completed. Please try again.';

      if (err.code === 'auth/popup-closed-by-user') {
        errorText = 'Google sign-in was closed before it finished.';
      } else if (err.code === 'auth/popup-blocked') {
        errorText = 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
      } else if (err.code === 'auth/unauthorized-domain') {
        errorText = 'This domain is not authorized for Firebase sign-in. Add localhost and 127.0.0.1 in Firebase Authentication settings.';
      } else if (err.code === 'auth/configuration-not-found') {
        errorText = 'Firebase Auth configuration was not found for this project. Confirm this app uses the same Firebase project where Google is enabled.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorText = 'Firebase rejected Google sign-in for this app. Confirm the Google provider is enabled for the same Firebase project as this apiKey/authDomain.';
      } else if (err.message) {
        errorText = err.message;
      }

      this.errorMessage.set(err.code ? `${errorText} (${err.code})` : errorText);
    } finally {
      this.loading.set(false);
    }
  }
}
