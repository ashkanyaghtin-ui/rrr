import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  updateDoc
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  addresses: Address[];
  role?: 'admin' | 'client' | 'manager' | 'waiter' | 'chef' | 'driver';
  tenantId?: string;
}

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  building: string;
  apartment: string;
  phone: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (currentUser) {
        // Sync profile from Firestore
        const profileRef = doc(db, 'users', currentUser.uid);
        
        // Use onSnapshot for real-time profile updates
        unsubProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // Create initial profile if it doesn't exist
            let role: any = 'client';
            let permissions = {};
            
            if (currentUser.email) {
              try {
                const staffQ = query(collection(db, 'staff'), where('email', '==', currentUser.email));
                const staffSnap = await getDocs(staffQ);
                if (!staffSnap.empty) {
                  const staffData = staffSnap.docs[0].data();
                  role = staffData.role || 'client';
                  permissions = staffData.permissions || {};
                  // Update staff record with uid
                  await updateDoc(doc(db, 'staff', staffSnap.docs[0].id), { uid: currentUser.uid });
                }
              } catch (err) {
                console.error("Error checking staff collection:", err);
              }
            }

            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName,
              addresses: [],
              role: role,
              tenantId: 'rivas',
              ...(Object.keys(permissions).length > 0 ? { permissions } : {})
            };
            setDoc(profileRef, newProfile).catch(err => 
              handleFirestoreError(err, OperationType.CREATE, `users/${currentUser.uid}`)
            );
            setProfile(newProfile);
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
        });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'users', user.uid);
      await setDoc(profileRef, data, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
