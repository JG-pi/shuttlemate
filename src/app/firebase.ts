import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, User, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, getRedirectResult, setPersistence, browserLocalPersistence, inMemoryPersistence, signInWithPopup, signInWithRedirect, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore, Firestore, collection, doc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, getDocFromServer, getDoc, getDocsFromServer, serverTimestamp, Timestamp, orderBy, limit } from 'firebase/firestore';
import { firebaseConfig } from './firebase.config';
import { Observable, BehaviorSubject } from 'rxjs';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export interface AppEvent {
  id: string;
  name: string;
  date: string;
  durationHours?: number;
  capacity: number;
  location: string;
  additionalInfo: string;
  cost: number;
  courtCost?: number;
  shuttlecockCost?: number;
  finalised: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface AppBooking {
  id: string; // eventId_userId
  eventId: string;
  userId: string;
  userEmail: string;
  userName: string;
  paid: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AppUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  providerId: string;
  emailVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface AppLocation {
  id: string;
  name: string;
  pricePerCourtHour: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface AppShuttlecock {
  id: string;
  name: string;
  pricePerTube: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface AppRuntimeError {
  id: string;
  area: string;
  stage: string;
  message: string;
  code: string | null;
  name: string | null;
  stack: string | null;
  attemptedEmail: string | null;
  userId: string | null;
  userEmail: string | null;
  emailVerified: boolean | null;
  providerIds: string;
  route: string | null;
  url: string | null;
  userAgent: string | null;
  online: boolean | null;
  projectId: string;
  authDomain: string;
  databaseId: string;
  contextJson: string;
  createdAt: Timestamp;
}

export interface RuntimeErrorInput {
  area: string;
  stage: string;
  error: unknown;
  attemptedEmail?: string | null;
  context?: Record<string, unknown>;
}

const ADMIN_EMAILS = [
  'jamesguoas@gmail.com',
  'khoiphan21@gmail.com',
  'admin@luna.academy'
];

export function isUserAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private platformId = inject(PLATFORM_ID);
  
  app!: FirebaseApp;
  auth!: Auth;
  db!: Firestore;

  private userSubject = new BehaviorSubject<User | null>(null);
  private authReadySubject = new BehaviorSubject<boolean>(false);
  user$ = this.userSubject.asObservable();
  authReady$ = this.authReadySubject.asObservable();
  currentUserSig = signal<User | null>(null);
  isBrowser = false;

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      this.db = getFirestore(this.app, firebaseConfig.firestoreDatabaseId);
      this.auth = getAuth(this.app);

      this.initializeBrowserAuth();
    } else {
      this.authReadySubject.next(true);
    }
  }

  private initializeBrowserAuth(): void {
    void this.configureAuthPersistence();

    onAuthStateChanged(this.auth, (user) => {
      this.userSubject.next(user);
      this.currentUserSig.set(user);
      this.authReadySubject.next(true);
      
      if (user) {
        void this.syncUserProfile(user, 'auth-state-profile-sync');
        this.testConnection();
      }
    }, (error) => {
      console.error('Auth state listener failed', error);
      void this.recordRuntimeError({
        area: 'login',
        stage: 'auth-state-listener',
        error
      });
      this.userSubject.next(null);
      this.currentUserSig.set(null);
      this.authReadySubject.next(true);
    });

    void this.handlePendingGoogleRedirect();
  }

  private async configureAuthPersistence(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
    } catch (error) {
      console.warn('Local auth persistence is unavailable. Falling back to in-memory persistence.', error);
      void this.recordRuntimeError({
        area: 'login',
        stage: 'browser-local-persistence',
        error,
        context: {
          fallback: 'inMemoryPersistence'
        }
      });
      try {
        await setPersistence(this.auth, inMemoryPersistence);
      } catch (fallbackError) {
        console.warn('In-memory auth persistence is unavailable. Continuing with Firebase default persistence.', fallbackError);
        void this.recordRuntimeError({
          area: 'login',
          stage: 'in-memory-persistence',
          error: fallbackError,
          context: {
            fallback: 'firebaseDefaultPersistence'
          }
        });
      }
    }
  }

  // Mandatory database connection verification
  private async testConnection() {
    try {
      await getDocFromServer(doc(this.db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration: the client is offline.");
        void this.recordRuntimeError({
          area: 'login',
          stage: 'auth-connection-check',
          error
        });
      }
    }
  }

  // Standardized error mapping as mandated by Firebase Integration Skill
  handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: this.auth?.currentUser?.uid || null,
        email: this.auth?.currentUser?.email || null,
        emailVerified: this.auth?.currentUser?.emailVerified || null,
        isAnonymous: this.auth?.currentUser?.isAnonymous || null,
        providerInfo: this.auth?.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error Detailed Info: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  isAdmin(): boolean {
    const user = this.currentUserSig();
    return isUserAdmin(user?.email);
  }

  async ensureFirestoreAuth(): Promise<boolean> {
    if (!this.isBrowser) return false;
    const currentUser = this.auth.currentUser;
    if (!currentUser) return false;
    try {
      await currentUser.getIdToken();
      return true;
    } catch {
      return false;
    }
  }

  async fetchShuttlecocksFromServer(): Promise<AppShuttlecock[]> {
    if (!this.isBrowser) return [];
    const path = 'shuttlecocks';
    const authReady = await this.ensureFirestoreAuth();
    if (!authReady) return [];

    const snapshot = await getDocsFromServer(query(collection(this.db, path)));
    const shuttlecocks: AppShuttlecock[] = [];
    snapshot.forEach((docSnap) => {
      shuttlecocks.push(docSnap.data() as AppShuttlecock);
    });
    shuttlecocks.sort((a, b) => a.name.localeCompare(b.name));
    return shuttlecocks;
  }

  private async withTimeout<T>(promise: Promise<T>, action: string, timeoutMs = 12000): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${action} timed out. Check your Firestore rules, network connection, and Firebase project configuration.`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async recordRuntimeError(input: RuntimeErrorInput): Promise<void> {
    if (!this.isBrowser || !this.db) return;

    const currentUser = this.auth?.currentUser || null;
    const serializedError = this.serializeRuntimeError(input.error);
    const errorId = `rte_${Date.now()}_${this.randomIdSuffix()}`;
    const context = {
      ...input.context,
      storage: this.getStorageDiagnostics(),
      screen: this.getScreenDiagnostics(),
      timestampClient: new Date().toISOString()
    };

    const runtimeError: Omit<AppRuntimeError, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
      id: errorId,
      area: this.safeText(input.area, 64) || 'unknown',
      stage: this.safeText(input.stage, 128) || 'unknown',
      message: this.safeText(serializedError.message, 2000) || 'Unknown runtime error',
      code: this.safeText(serializedError.code, 128),
      name: this.safeText(serializedError.name, 128),
      stack: this.safeText(serializedError.stack, 6000),
      attemptedEmail: this.safeText(input.attemptedEmail?.toLowerCase() || null, 256),
      userId: this.safeText(currentUser?.uid || null, 128),
      userEmail: this.safeText(currentUser?.email || null, 256),
      emailVerified: currentUser?.emailVerified ?? null,
      providerIds: this.safeText(currentUser?.providerData.map(provider => provider.providerId).join(',') || '', 256) || '',
      route: this.safeText(typeof window !== 'undefined' ? window.location.pathname : null, 512),
      url: this.safeText(typeof window !== 'undefined' ? window.location.href : null, 2048),
      userAgent: this.safeText(typeof navigator !== 'undefined' ? navigator.userAgent : null, 1024),
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      projectId: this.safeText(firebaseConfig.projectId, 128) || '',
      authDomain: this.safeText(firebaseConfig.authDomain, 256) || '',
      databaseId: this.safeText(firebaseConfig.firestoreDatabaseId, 128) || '',
      contextJson: this.safeText(JSON.stringify(context), 8000) || '{}',
      createdAt: serverTimestamp()
    };

    try {
      await this.withTimeout(setDoc(doc(this.db, 'RuntimeError', errorId), runtimeError), 'Saving runtime error', 3000);
    } catch (loggingError) {
      console.error('Could not save runtime error log', loggingError);
    }
  }

  private serializeRuntimeError(error: unknown): { code: string | null; message: string; name: string | null; stack: string | null } {
    if (error instanceof Error) {
      const codedError = error as Error & { code?: string };
      return {
        code: codedError.code || null,
        message: error.message,
        name: error.name,
        stack: error.stack || null
      };
    }

    if (typeof error === 'object' && error !== null) {
      const err = error as { code?: unknown; message?: unknown; name?: unknown; stack?: unknown };
      return {
        code: typeof err.code === 'string' ? err.code : null,
        message: typeof err.message === 'string' ? err.message : JSON.stringify(error),
        name: typeof err.name === 'string' ? err.name : null,
        stack: typeof err.stack === 'string' ? err.stack : null
      };
    }

    return {
      code: null,
      message: String(error),
      name: null,
      stack: null
    };
  }

  private safeText(value: unknown, maxLength: number): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 15)}... [truncated]` : text;
  }

  private randomIdSuffix(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID().slice(0, 8);
    }

    return Math.random().toString(36).slice(2, 10);
  }

  private getStorageDiagnostics(): Record<string, boolean> {
    return {
      localStorage: this.canAccessStorage('localStorage'),
      sessionStorage: this.canAccessStorage('sessionStorage'),
      indexedDb: typeof indexedDB !== 'undefined',
      redirectPersistence: this.canUseRedirectPersistence()
    };
  }

  private getScreenDiagnostics(): Record<string, number | null> {
    if (typeof window === 'undefined') {
      return {
        width: null,
        height: null,
        devicePixelRatio: null
      };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    };
  }

  private canAccessStorage(storageName: 'localStorage' | 'sessionStorage'): boolean {
    try {
      if (typeof window === 'undefined' || !window[storageName]) return false;
      const testKey = `__runtime_error_${storageName}_test__`;
      window[storageName].setItem(testKey, '1');
      window[storageName].removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private async syncUserProfile(user: User, stage: string): Promise<void> {
    try {
      await this.upsertUserProfile(user);
    } catch (error) {
      console.error('User profile sync failed', error);
      void this.recordRuntimeError({
        area: 'login',
        stage,
        error,
        attemptedEmail: user.email,
        context: {
          providerIds: user.providerData.map(provider => provider.providerId).join(','),
          uid: user.uid,
          emailVerified: user.emailVerified
        }
      });
    }
  }

  // --- AUDIO & AUTH ACTIONS ---
  async signUp(email: string, password: string, name: string): Promise<User> {
    if (!this.isBrowser) throw new Error('Not running in browser state');
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await this.syncUserProfile(credential.user, 'email-password-sign-up-profile-sync');
      this.userSubject.next(credential.user);
      this.currentUserSig.set(credential.user);
      this.authReadySubject.next(true);
      return credential.user;
    } catch (e) {
      console.error('Sign up error', e);
      void this.recordRuntimeError({
        area: 'login',
        stage: 'email-password-sign-up',
        error: e,
        attemptedEmail: email,
        context: {
          hasDisplayName: name.trim().length > 0
        }
      });
      throw e;
    }
  }

  async signIn(email: string, password: string): Promise<User> {
    if (!this.isBrowser) throw new Error('Not running in browser state');
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      await this.syncUserProfile(credential.user, 'email-password-sign-in-profile-sync');
      this.userSubject.next(credential.user);
      this.currentUserSig.set(credential.user);
      this.authReadySubject.next(true);
      return credential.user;
    } catch (e) {
      console.error('Sign in error', e);
      void this.recordRuntimeError({
        area: 'login',
        stage: 'email-password-sign-in',
        error: e,
        attemptedEmail: email
      });
      throw e;
    }
  }

  async signInWithGoogle(): Promise<User | null> {
    if (!this.isBrowser) throw new Error('Not running in browser state');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const credential = await signInWithPopup(this.auth, provider, browserPopupRedirectResolver);
      await this.syncUserProfile(credential.user, 'google-popup-profile-sync');
      this.userSubject.next(credential.user);
      this.currentUserSig.set(credential.user);
      this.authReadySubject.next(true);
      return credential.user;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const popupUnavailable =
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/operation-not-supported-in-environment' ||
        err.code === 'auth/cancelled-popup-request';

      if (popupUnavailable && this.canUseRedirectPersistence()) {
        await signInWithRedirect(this.auth, provider, browserPopupRedirectResolver);
        return null;
      }

      console.error('Google sign in error', e);
      void this.recordRuntimeError({
        area: 'login',
        stage: 'google-sign-in',
        error: e,
        context: {
          strategy: 'popup-first',
          redirectPersistenceAvailable: this.canUseRedirectPersistence()
        }
      });
      throw e;
    }
  }

  private canUseRedirectPersistence(): boolean {
    try {
      if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return false;
      }

      const testKey = '__firebase_redirect_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private async handlePendingGoogleRedirect(): Promise<void> {
    try {
      const credential = await getRedirectResult(this.auth);
      if (!credential?.user) return;

      await this.syncUserProfile(credential.user, 'google-redirect-profile-sync');
      this.userSubject.next(credential.user);
      this.currentUserSig.set(credential.user);
      this.authReadySubject.next(true);
    } catch (e) {
      console.error('Google redirect sign in error', e);
      void this.recordRuntimeError({
        area: 'login',
        stage: 'google-redirect-result',
        error: e
      });
    }
  }

  private async upsertUserProfile(user: User): Promise<void> {
    const userDocRef = doc(this.db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    const profile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL || null,
      providerId: user.providerData[0]?.providerId || 'google.com',
      emailVerified: user.emailVerified,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    };

    if (userDoc.exists()) {
      await this.withTimeout(setDoc(userDocRef, profile, { merge: true }), 'Updating user profile');
      return;
    }

    await this.withTimeout(setDoc(userDocRef, {
      ...profile,
      createdAt: serverTimestamp()
    }), 'Creating user profile');
  }

  async logOut(): Promise<void> {
    if (!this.isBrowser) return;
    await signOut(this.auth);
    this.userSubject.next(null);
    this.currentUserSig.set(null);
  }

  // --- FIRESTORE EVENTS QUERIES/COMMANDS ---
  async createEvent(
    name: string,
    date: string,
    capacity: number,
    location: string,
    additionalInfo: string,
    cost: number,
    courtCost: number,
    shuttlecockCost: number,
    durationHours: number
  ): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'events';
    const eventId = 'ev_' + Date.now().toString();
    try {
      const eventDocRef = doc(this.db, path, eventId);
      const newEvent = {
        id: eventId,
        name,
        date,
        capacity,
        location,
        additionalInfo,
        cost,
        courtCost,
        shuttlecockCost,
        durationHours,
        finalised: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: this.auth.currentUser?.uid || 'system'
      };
      await this.withTimeout(setDoc(eventDocRef, newEvent), 'Scheduling event');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.CREATE, `${path}/${eventId}`);
    }
  }

  async updateEvent(eventId: string, updates: Partial<Omit<AppEvent, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'events';
    try {
      const eventDocRef = doc(this.db, path, eventId);
      await this.withTimeout(updateDoc(eventDocRef, {
        ...updates,
        updatedAt: serverTimestamp()
      }), 'Updating event');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.UPDATE, `${path}/${eventId}`);
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'events';
    try {
      const eventDocRef = doc(this.db, path, eventId);
      await this.withTimeout(deleteDoc(eventDocRef), 'Deleting event');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${path}/${eventId}`);
    }
  }

  // --- ADMIN LOCATION SETTINGS ---
  selectLocations(): Observable<AppLocation[]> {
    return new Observable<AppLocation[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }

      const path = 'locations';
      const q = query(collection(this.db, path));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const locations: AppLocation[] = [];
        snapshot.forEach((doc) => {
          locations.push(doc.data() as AppLocation);
        });
        locations.sort((a, b) => a.name.localeCompare(b.name));
        subscriber.next(locations);
      }, (error) => {
        subscriber.error(error);
      });

      return () => unsubscribe();
    });
  }

  async createLocation(name: string, pricePerCourtHour: number): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'locations';
    const locationId = 'loc_' + Date.now().toString();

    try {
      const locationDocRef = doc(this.db, path, locationId);
      await this.withTimeout(setDoc(locationDocRef, {
        id: locationId,
        name,
        pricePerCourtHour,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: this.auth.currentUser?.uid || 'system'
      }), 'Saving location');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.CREATE, `${path}/${locationId}`);
    }
  }

  async updateLocation(locationId: string, updates: Pick<AppLocation, 'name' | 'pricePerCourtHour'>): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'locations';

    try {
      const locationDocRef = doc(this.db, path, locationId);
      await this.withTimeout(updateDoc(locationDocRef, {
        ...updates,
        updatedAt: serverTimestamp()
      }), 'Updating location');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.UPDATE, `${path}/${locationId}`);
    }
  }

  async deleteLocation(locationId: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'locations';

    try {
      const locationDocRef = doc(this.db, path, locationId);
      await this.withTimeout(deleteDoc(locationDocRef), 'Deleting location');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${path}/${locationId}`);
    }
  }

  // --- ADMIN SHUTTLECOCK SETTINGS ---
  selectShuttlecocks(): Observable<AppShuttlecock[]> {
    return new Observable<AppShuttlecock[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }

      let unsubscribe = () => {};
      let cancelled = false;

      void this.ensureFirestoreAuth().then((authReady) => {
        if (cancelled || !authReady) {
          if (!cancelled && !authReady) {
            subscriber.error(new Error('Missing or insufficient permissions.'));
          }
          return;
        }

        const path = 'shuttlecocks';
        const q = query(collection(this.db, path));
        unsubscribe = onSnapshot(q, (snapshot) => {
          const shuttlecocks: AppShuttlecock[] = [];
          snapshot.forEach((docSnap) => {
            shuttlecocks.push(docSnap.data() as AppShuttlecock);
          });
          shuttlecocks.sort((a, b) => a.name.localeCompare(b.name));
          subscriber.next(shuttlecocks);
        }, (error) => {
          subscriber.error(error);
        });
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    });
  }

  async createShuttlecock(name: string, pricePerTube: number): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'shuttlecocks';
    const shuttlecockId = 'shuttle_' + Date.now().toString();
    const currentUser = this.auth.currentUser;
    const payload = {
      id: shuttlecockId,
      name,
      pricePerTube,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: currentUser?.uid || 'system'
    };

    try {
      const shuttlecockDocRef = doc(this.db, path, shuttlecockId);
      await this.withTimeout(setDoc(shuttlecockDocRef, payload), 'Saving shuttlecock');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.CREATE, `${path}/${shuttlecockId}`);
    }
  }

  async deleteShuttlecock(shuttlecockId: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'shuttlecocks';

    try {
      const shuttlecockDocRef = doc(this.db, path, shuttlecockId);
      await this.withTimeout(deleteDoc(shuttlecockDocRef), 'Deleting shuttlecock');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${path}/${shuttlecockId}`);
    }
  }

  // Observable stream of events
  selectEvents(): Observable<AppEvent[]> {
    return new Observable<AppEvent[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const path = 'events';
      const q = query(collection(this.db, path));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const events: AppEvent[] = [];
        snapshot.forEach((doc) => {
          events.push(doc.data() as AppEvent);
        });
        // Sort by date ascending
        events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        subscriber.next(events);
      }, (error) => {
        subscriber.error(error);
      });
      return () => unsubscribe();
    });
  }

  // --- FIRESTORE BOOKINGS QUERIES/COMMANDS ---
  async addBooking(eventId: string, userName: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'bookings';
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('Must be logged in to book events');
    const bookingId = `${eventId}_${currentUser.uid}`;
    try {
      const bookingDocRef = doc(this.db, path, bookingId);
      const newBooking = {
        id: bookingId,
        eventId,
        userId: currentUser.uid,
        userEmail: currentUser.email || 'anonymous',
        userName: userName,
        paid: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await this.withTimeout(setDoc(bookingDocRef, newBooking), 'Adding booking');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.CREATE, `${path}/${bookingId}`);
    }
  }

  async removeBooking(eventId: string, userId: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'bookings';
    const bookingId = `${eventId}_${userId}`;
    try {
      const bookingDocRef = doc(this.db, path, bookingId);
      await this.withTimeout(deleteDoc(bookingDocRef), 'Removing booking');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${path}/${bookingId}`);
    }
  }

  async updateBookingPayment(eventId: string, userId: string, paid: boolean): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'bookings';
    const bookingId = `${eventId}_${userId}`;
    try {
      const bookingDocRef = doc(this.db, path, bookingId);
      await this.withTimeout(updateDoc(bookingDocRef, {
        paid,
        updatedAt: serverTimestamp()
      }), 'Updating booking payment');
    } catch (e) {
      this.handleFirestoreError(e, OperationType.UPDATE, `${path}/${bookingId}`);
    }
  }

  // Stream bookings for a specific event
  selectBookingsForEvent(eventId: string): Observable<AppBooking[]> {
    return new Observable<AppBooking[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const path = 'bookings';
      const q = query(collection(this.db, path), where('eventId', '==', eventId));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const bookings: AppBooking[] = [];
        snapshot.forEach((doc) => {
          bookings.push(doc.data() as AppBooking);
        });
        subscriber.next(bookings);
      }, (error) => {
        subscriber.error(error);
      });
      return () => unsubscribe();
    });
  }

  // Stream all bookings of currently signed-in user
  selectMyBookings(): Observable<AppBooking[]> {
    return new Observable<AppBooking[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        subscriber.next([]);
        return;
      }
      const path = 'bookings';
      const q = query(collection(this.db, path), where('userId', '==', currentUser.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const bookings: AppBooking[] = [];
        snapshot.forEach((doc) => {
          bookings.push(doc.data() as AppBooking);
        });
        subscriber.next(bookings);
      }, (error) => {
        subscriber.error(error);
      });
      return () => unsubscribe();
    });
  }

  // Fetch a list of ALL bookings (admin-only)
  selectAllBookings(): Observable<AppBooking[]> {
    return new Observable<AppBooking[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const path = 'bookings';
      const q = query(collection(this.db, path));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const bookings: AppBooking[] = [];
        snapshot.forEach((doc) => {
          bookings.push(doc.data() as AppBooking);
        });
        subscriber.next(bookings);
      }, (error) => {
        subscriber.error(error);
      });
      return () => unsubscribe();
    });
  }

  selectRuntimeErrors(): Observable<AppRuntimeError[]> {
    return new Observable<AppRuntimeError[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }

      const path = 'RuntimeError';
      const q = query(collection(this.db, path), orderBy('createdAt', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const runtimeErrors: AppRuntimeError[] = [];
        snapshot.forEach((doc) => {
          runtimeErrors.push(doc.data() as AppRuntimeError);
        });
        subscriber.next(runtimeErrors);
      }, (error) => {
        subscriber.error(error);
      });

      return () => unsubscribe();
    });
  }
}
