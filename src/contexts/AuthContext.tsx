import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInAnonymously,
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
  updateDoc,
  limit
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  addresses: Address[];
  role?: 'admin' | 'client' | 'manager' | 'waiter' | 'chef' | 'driver';
  tenantId?: string;
  terminalId?: string | null;
  storeId?: string | null;
  permissions?: Record<string, boolean>;
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

const fallbackAuthContext: AuthContextType = {
  user: null,
  profile: null,
  loading: false,
  login: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
};

const AuthContext = createContext<AuthContextType>(fallbackAuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let attemptedAnonymousBootstrap = false;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const wantsAdminSession = sessionStorage.getItem('adminAuthenticated') === 'true';
      const isAdminLookupInProgress = sessionStorage.getItem('adminAuthLookup') === 'true';

      setUser(currentUser);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (currentUser) {
        if (wantsAdminSession) {
          const safeEmail = currentUser.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentUser.email)
            ? currentUser.email
            : `${currentUser.uid}@local.invalid`;

          // Ensure an admin session always has a base users profile without clobbering
          // staff-assigned role/permissions/store/terminal fields.
          try {
            await setDoc(doc(db, 'users', currentUser.uid), {
              uid: currentUser.uid,
              email: safeEmail,
              addresses: [],
              tenantId: 'rivas',
            }, { merge: true });
          } catch (adminProfileErr) {
            console.error('Admin profile bootstrap failed:', adminProfileErr);
          }
        }

        // Sync profile from Firestore (using getDoc instead of onSnapshot to avoid watch-stream crash)
        const profileRef = doc(db, 'users', currentUser.uid);
        
        (async () => {
          try {
            const docSnap = await getDoc(profileRef);
            if (docSnap.exists()) {
              const existingProfile = docSnap.data() as UserProfile;
              setProfile(existingProfile);

              // Backfill profile from staff directory when key routing fields are missing.
              try {
                let staffDoc: any = null;
                const sessionStaffDocId = sessionStorage.getItem('activeStaffDocId') || '';
                const sessionStaffEmail = sessionStorage.getItem('activeStaffEmail') || '';

                if (sessionStaffDocId) {
                  const byDocId = await getDoc(doc(db, 'staff', sessionStaffDocId));
                  if (byDocId.exists()) {
                    staffDoc = byDocId;
                  }
                }

                if (!staffDoc) {
                  const byUid = await getDocs(query(collection(db, 'staff'), where('uid', '==', currentUser.uid), limit(1)));
                  if (!byUid.empty) {
                    staffDoc = byUid.docs[0];
                  }
                }

                if (!staffDoc) {
                  const emailCandidate = sessionStaffEmail || currentUser.email || '';
                  if (emailCandidate) {
                    const byEmail = await getDocs(query(collection(db, 'staff'), where('email', '==', emailCandidate), limit(1)));
                    if (!byEmail.empty) {
                      staffDoc = byEmail.docs[0];
                    }
                  }
                }

                if (staffDoc) {
                  const staffData = staffDoc.data() as any;
                  const patch: Partial<UserProfile> = {};

                  if (staffData.permissions && typeof staffData.permissions === 'object' && !Array.isArray(staffData.permissions)) {
                    const existingPermissions = existingProfile.permissions || {};
                    const samePermissions = JSON.stringify(existingPermissions) === JSON.stringify(staffData.permissions);
                    if (!samePermissions) {
                      patch.permissions = staffData.permissions;
                    }
                  }

                  if ((existingProfile.terminalId || null) !== (staffData.terminalId || null)) {
                    patch.terminalId = staffData.terminalId || null;
                  }

                  if ((existingProfile.storeId || null) !== (staffData.storeId || null)) {
                    patch.storeId = staffData.storeId || null;
                  }

                  const staffRole = String(staffData.role || 'client').toLowerCase();
                  const existingRole = String(existingProfile.role || 'client').toLowerCase();
                  if (existingRole !== staffRole) {
                    patch.role = staffRole as UserProfile['role'];
                  }

                  if ((existingProfile.displayName || '') !== String(staffData.name || existingProfile.displayName || '')) {
                    patch.displayName = staffData.name || existingProfile.displayName || null;
                  }

                  if (Object.keys(patch).length > 0) {
                    await setDoc(profileRef, patch, { merge: true });
                    setProfile({ ...existingProfile, ...patch });
                  }

                  if (!staffData.uid) {
                    await updateDoc(doc(db, 'staff', staffDoc.id), { uid: currentUser.uid });
                  }
                }
              } catch (syncErr) {
                console.error('Staff profile sync failed:', syncErr);
              }
            } else {
              // Create initial profile if it doesn't exist
              let role: any = 'client';
              let permissions = {};
              let terminalId: string | null = null;
              let storeId: string | null = null;
              let staffDisplayName: string | null = null;
              const sessionStaffDocId = sessionStorage.getItem('activeStaffDocId') || '';
              const sessionStaffEmail = sessionStorage.getItem('activeStaffEmail') || '';
              let staffData: any = null;
              
              try {
                if (sessionStaffDocId) {
                  const byDocId = await getDoc(doc(db, 'staff', sessionStaffDocId));
                  if (byDocId.exists()) {
                    staffData = byDocId.data();
                    await updateDoc(doc(db, 'staff', byDocId.id), { uid: currentUser.uid });
                  }
                }

                if (!staffData) {
                  const emailCandidate = sessionStaffEmail || currentUser.email || '';
                  if (emailCandidate) {
                    const staffQ = query(collection(db, 'staff'), where('email', '==', emailCandidate), limit(1));
                    const staffSnap = await getDocs(staffQ);
                    if (!staffSnap.empty) {
                      staffData = staffSnap.docs[0].data();
                      await updateDoc(doc(db, 'staff', staffSnap.docs[0].id), { uid: currentUser.uid });
                    }
                  }
                }
              } catch (err) {
                console.error("Error checking staff collection:", err);
              }

              if (staffData) {
                role = String(staffData.role || 'client').toLowerCase();
                permissions = staffData.permissions || {};
                terminalId = staffData.terminalId || null;
                storeId = staffData.storeId || null;
                staffDisplayName = staffData.name || null;
              }

              const newProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: staffDisplayName || currentUser.displayName,
                addresses: [],
                role: role,
                tenantId: 'rivas',
                terminalId,
                storeId,
                ...(Object.keys(permissions).length > 0 ? { permissions } : {})
              };
              setDoc(profileRef, newProfile).catch(err => 
                handleFirestoreError(err, OperationType.CREATE, `users/${currentUser.uid}`)
              );
              setProfile(newProfile);
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
          }
        })();
      } else {
        setProfile(null);

        // Keep protected Firestore reads operational even before explicit login.
        // UI components already treat anonymous users as signed-out.
        if (!attemptedAnonymousBootstrap && !isAdminLookupInProgress) {
          attemptedAnonymousBootstrap = true;
          signInAnonymously(auth).catch((err) => {
            console.error('Anonymous auth bootstrap failed:', err);
          });
        }
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
  return useContext(AuthContext);
}
