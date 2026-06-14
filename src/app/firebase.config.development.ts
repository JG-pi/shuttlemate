declare const DEV_FIREBASE_API_KEY: string;
declare const DEV_FIREBASE_AUTH_DOMAIN: string;
declare const DEV_FIREBASE_PROJECT_ID: string;
declare const DEV_FIREBASE_STORAGE_BUCKET: string;
declare const DEV_FIREBASE_MESSAGING_SENDER_ID: string;
declare const DEV_FIREBASE_APP_ID: string;
declare const DEV_FIREBASE_MEASUREMENT_ID: string;
declare const DEV_FIREBASE_FIRESTORE_DATABASE_ID: string;

export const firebaseConfig = {
  apiKey: DEV_FIREBASE_API_KEY,
  authDomain: DEV_FIREBASE_AUTH_DOMAIN,
  projectId: DEV_FIREBASE_PROJECT_ID,
  storageBucket: DEV_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: DEV_FIREBASE_MESSAGING_SENDER_ID,
  appId: DEV_FIREBASE_APP_ID,
  measurementId: DEV_FIREBASE_MEASUREMENT_ID,
  firestoreDatabaseId: DEV_FIREBASE_FIRESTORE_DATABASE_ID
};
