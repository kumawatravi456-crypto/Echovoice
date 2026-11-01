import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { type User } from 'firebase/auth';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle as firebaseGoogleSignIn,
  signInWithEmail as firebaseEmailSignIn,
  signUpWithEmail as firebaseEmailSignUp,
  signOutUser as firebaseSignOut,
  syncUserProfile,
  testConnection,
  type UserProfile,
} from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const synced = await syncUserProfile(currentUser);
          setProfile(synced);
        } catch (err) {
          console.warn('Could not sync user profile to Firestore:', err);
          setProfile({
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
          });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearError = () => setError(null);

  const formatAuthError = (err: unknown): string => {
    const authErr = err as { code?: string; message?: string };
    switch (authErr?.code) {
      case 'auth/popup-closed-by-user':
        return 'Sign-in cancelled. The Google sign-in window was closed.';
      case 'auth/cancelled-popup-request':
        return 'Sign-in cancelled. Another request was already initiated.';
      case 'auth/popup-blocked':
        return 'Popup was blocked by your browser. Please allow popups for this site.';
      case 'auth/unauthorized-domain':
        return 'This domain is not yet authorized in Firebase Console > Authentication > Settings > Authorized Domains.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is currently disabled in your Firebase project. To enable it, visit Firebase Console > Authentication > Sign-in method, click "Email/Password", toggle "Enable", and click Save.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email address. Please log in instead.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'The password is too weak. Please choose a password with at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please verify your credentials or create an account.';
      case 'auth/too-many-requests':
        return 'Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.';
      default:
        return authErr?.message || 'Authentication failed. Please verify your details and try again.';
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      const signedInUser = await firebaseGoogleSignIn();
      setUser(signedInUser);
      const synced = await syncUserProfile(signedInUser);
      setProfile(synced);
    } catch (err: unknown) {
      console.error('Google Sign-In Error:', err);
      const message = formatAuthError(err);
      setError(message);
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setError(null);
    setIsSigningIn(true);
    try {
      const signedInUser = await firebaseEmailSignIn(email, pass);
      setUser(signedInUser);
      const synced = await syncUserProfile(signedInUser);
      setProfile(synced);
    } catch (err: unknown) {
      console.error('Email Sign-In Error:', err);
      const message = formatAuthError(err);
      setError(message);
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    setError(null);
    setIsSigningIn(true);
    try {
      const signedInUser = await firebaseEmailSignUp(email, pass, name);
      setUser(signedInUser);
      const synced = await syncUserProfile(signedInUser, name);
      setProfile(synced);
    } catch (err: unknown) {
      console.error('Email Sign-Up Error:', err);
      const message = formatAuthError(err);
      setError(message);
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      await firebaseSignOut();
      setUser(null);
      setProfile(null);
    } catch (err: unknown) {
      const authErr = err as { message?: string };
      setError(authErr?.message || 'Failed to sign out.');
      throw err;
    }
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isSigningIn,
      error,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      clearError,
    }),
    [user, profile, loading, isSigningIn, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
