import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { ref, set, get, onValue } from 'firebase/database';
import { auth, database } from '@/integrations/firebase/config';

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  services: string[];
  createdAt: string;
}

interface FirebaseAuthContextType {
  user: User | null;
  userData: UserData | null;
  isLoading: boolean;
  isAdmin: boolean;
  userServices: string[];
  signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  completeMagicLinkSignIn: () => Promise<{ error?: string }>;
  redeemCode: (code: string) => Promise<{ error?: string; services?: string[] }>;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextType | null>(null);

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userServices, setUserServices] = useState<string[]>([]);

  // Fetch user data from Realtime Database
  const fetchUserData = useCallback(async (uid: string) => {
    try {
      const userRef = ref(database, `users/${uid}`);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val() as UserData;
        setUserData(data);
        setIsAdmin(data.isAdmin || false);
        setUserServices(data.services || []);
      } else {
        setUserData(null);
        setIsAdmin(false);
        setUserServices([]);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }, []);

  // Subscribe to user data changes
  useEffect(() => {
    if (!user) return;

    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as UserData;
        setUserData(data);
        setIsAdmin(data.isAdmin || false);
        setUserServices(data.services || []);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        await fetchUserData(firebaseUser.uid);
      } else {
        setUserData(null);
        setIsAdmin(false);
        setUserServices([]);
      }
      
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserData]);

  // Check for magic link on mount
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const email = window.localStorage.getItem('emailForSignIn');
      if (email) {
        completeMagicLinkSignIn();
      }
    }
  }, []);

  const signUp = async (email: string, password: string, username: string): Promise<{ error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const { user: newUser } = userCredential;
      
      // Update display name
      await updateProfile(newUser, { displayName: username });
      
      // Create user record in Realtime Database
      const userRef = ref(database, `users/${newUser.uid}`);
      await set(userRef, {
        uid: newUser.uid,
        email: email,
        displayName: username,
        isAdmin: false,
        services: [],
        createdAt: new Date().toISOString()
      });
      
      return {};
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { error: error.message || 'Failed to create account' };
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return {};
    } catch (error: any) {
      console.error('Sign in error:', error);
      
      // Friendly error messages
      if (error.code === 'auth/invalid-credential') {
        return { error: 'Invalid email or password' };
      }
      if (error.code === 'auth/user-not-found') {
        return { error: 'No account found with this email' };
      }
      if (error.code === 'auth/wrong-password') {
        return { error: 'Incorrect password' };
      }
      
      return { error: error.message || 'Failed to sign in' };
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserData(null);
      setIsAdmin(false);
      setUserServices([]);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const sendMagicLink = async (email: string): Promise<{ error?: string }> => {
    try {
      const actionCodeSettings = {
        url: window.location.origin + '/auth',
        handleCodeInApp: true,
      };
      
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      
      return {};
    } catch (error: any) {
      console.error('Magic link error:', error);
      return { error: error.message || 'Failed to send magic link' };
    }
  };

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    try {
      await sendPasswordResetEmail(auth, email);
      return {};
    } catch (error: any) {
      console.error('Reset password error:', error);
      
      if (error.code === 'auth/user-not-found') {
        return { error: 'No account found with this email' };
      }
      
      return { error: error.message || 'Failed to send reset email' };
    }
  };

  const completeMagicLinkSignIn = async (): Promise<{ error?: string }> => {
    try {
      const email = window.localStorage.getItem('emailForSignIn');
      
      if (!email) {
        return { error: 'Please enter your email to complete sign-in' };
      }
      
      if (isSignInWithEmailLink(auth, window.location.href)) {
        await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        
        // Check if user exists in database, if not create
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userRef = ref(database, `users/${currentUser.uid}`);
          const snapshot = await get(userRef);
          
          if (!snapshot.exists()) {
            await set(userRef, {
              uid: currentUser.uid,
              email: email,
              displayName: email.split('@')[0],
              isAdmin: false,
              services: [],
              createdAt: new Date().toISOString()
            });
          }
        }
        
        return {};
      }
      
      return { error: 'Invalid sign-in link' };
    } catch (error: any) {
      console.error('Magic link sign-in error:', error);
      return { error: error.message || 'Failed to complete sign-in' };
    }
  };

  const redeemCode = async (code: string): Promise<{ error?: string; services?: string[] }> => {
    if (!user) {
      return { error: 'Please sign in first' };
    }
    
    try {
      // Check code in database
      const codeRef = ref(database, `redeemCodes/${code.toUpperCase()}`);
      const snapshot = await get(codeRef);
      
      if (!snapshot.exists()) {
        return { error: 'Invalid code' };
      }
      
      const codeData = snapshot.val();
      
      if (!codeData.isActive) {
        return { error: 'This code is no longer active' };
      }
      
      if (codeData.currentUses >= codeData.maxUses) {
        return { error: 'This code has reached its usage limit' };
      }
      
      if (codeData.expiresAt && new Date(codeData.expiresAt) < new Date()) {
        return { error: 'This code has expired' };
      }
      
      // Check if already redeemed by this user
      const redemptionRef = ref(database, `redemptions/${user.uid}/${code.toUpperCase()}`);
      const redemptionSnapshot = await get(redemptionRef);
      
      if (redemptionSnapshot.exists()) {
        return { error: 'You have already redeemed this code' };
      }
      
      // Apply services to user
      const userRef = ref(database, `users/${user.uid}`);
      const userSnapshot = await get(userRef);
      const currentServices = userSnapshot.exists() ? (userSnapshot.val().services || []) : [];
      const newServices = [...new Set([...currentServices, ...codeData.services])];
      
      await set(ref(database, `users/${user.uid}/services`), newServices);
      
      // Record redemption
      await set(redemptionRef, {
        redeemedAt: new Date().toISOString(),
        services: codeData.services
      });
      
      // Increment usage count
      await set(ref(database, `redeemCodes/${code.toUpperCase()}/currentUses`), codeData.currentUses + 1);
      
      setUserServices(newServices);
      
      return { services: codeData.services };
    } catch (error: any) {
      console.error('Redeem code error:', error);
      return { error: error.message || 'Failed to redeem code' };
    }
  };

  return (
    <FirebaseAuthContext.Provider value={{
      user,
      userData,
      isLoading,
      isAdmin,
      userServices,
      signUp,
      signIn,
      signOut,
      sendMagicLink,
      resetPassword,
      completeMagicLinkSignIn,
      redeemCode,
    }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  }
  return context;
}
