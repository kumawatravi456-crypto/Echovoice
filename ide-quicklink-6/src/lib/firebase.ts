import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  getDocFromServer,
  type Timestamp,
} from 'firebase/firestore';
import rawConfig from '../../firebase-applet-config.json';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt?: Timestamp | string | null;
  lastLoginAt?: Timestamp | string | null;
}

// Fallback to environment variables if provided
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || rawConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || rawConfig.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || rawConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || rawConfig.authDomain,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || rawConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawConfig.messagingSenderId,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Request basic profile and email
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

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
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Sync user profile to Cloud Firestore (users/{uid})
 * Preserves the original `createdAt` on repeat logins.
 */
export async function syncUserProfile(user: User, customDisplayName?: string): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const path = `users/${user.uid}`;
  const resolvedDisplayName = customDisplayName || user.displayName || user.email?.split('@')[0] || 'Echo User';

  try {
    let existingData: Record<string, unknown> | null = null;
    try {
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        existingData = docSnap.data();
      }
    } catch {
      // First time reading may be empty or denied if doc does not exist
      existingData = null;
    }

    if (existingData && existingData.createdAt) {
      // User exists: update lastLoginAt and latest profile details while strictly preserving createdAt
      await setDoc(
        userRef,
        {
          uid: user.uid,
          displayName: resolvedDisplayName,
          email: user.email || '',
          photoURL: user.photoURL || null,
          createdAt: existingData.createdAt,
          lastLoginAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      // First-time user creation: set createdAt and lastLoginAt
      await setDoc(userRef, {
        uid: user.uid,
        displayName: resolvedDisplayName,
        email: user.email || '',
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    }

    return {
      uid: user.uid,
      displayName: resolvedDisplayName,
      email: user.email,
      photoURL: user.photoURL,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Sign in using Firebase Google popup provider
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Sign in using Gmail/Email and Password
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Create new account using Gmail/Email, Password, and Full Name
 */
export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    try {
      await updateProfile(result.user, { displayName });
    } catch (e) {
      console.warn('Could not update Firebase user displayName:', e);
    }
  }
  await syncUserProfile(result.user, displayName);
  return result.user;
}

/**
 * Sign out of Firebase Auth
 */
export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Validate connection to Firestore on initial boot
 */
export async function testConnection(): Promise<void> {
  try {
    if (auth.currentUser) {
      await getDocFromServer(doc(db, 'users', auth.currentUser.uid));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Please check network/config.');
    }
  }
}

export { onAuthStateChanged };
