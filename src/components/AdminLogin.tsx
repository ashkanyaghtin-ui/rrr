import React, { useState } from 'react';
import { LogIn, X, ShieldCheck } from 'lucide-react';
import { auth, db } from '../firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, limit, addDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

interface AdminLoginProps {
  onLogin: (success: boolean) => void;
  onClose?: () => void;
}

export default function AdminLogin({ onLogin, onClose }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Firestore rules require auth to read staff records.
      let signedInForLookup = false;
      if (!auth.currentUser) {
        sessionStorage.setItem('adminAuthLookup', 'true');
        await signInAnonymously(auth);
        signedInForLookup = true;
      }

      // Authenticate strictly against the staff directory configured in the Users panel.
      let authenticatedUser: {
        email: string;
        role: string;
        name: string;
        permissions: any;
        terminalId: string | null;
        storeId: string | null;
        staffDocId?: string;
      } | null = null;

      if (!authenticatedUser) {
        const staffRef = collection(db, 'staff');
        const usernameInput = username.trim();
        const normalizedInput = normalize(usernameInput);
        let matchedDoc: any = null;
        let matchedSource: 'staff' | 'users' = 'staff';

        try {
          // Try common identity fields first for fast lookup.
          const [emailSnap, phoneSnap, nameSnap] = await Promise.all([
            getDocs(query(staffRef, where('email', '==', usernameInput), limit(1))).catch(e => {
              console.error('Email query failed:', e);
              return { docs: [] };
            }),
            getDocs(query(staffRef, where('phone', '==', usernameInput), limit(1))).catch(e => {
              console.error('Phone query failed:', e);
              return { docs: [] };
            }),
            getDocs(query(staffRef, where('name', '==', usernameInput), limit(1))).catch(e => {
              console.error('Name query failed:', e);
              return { docs: [] };
            }),
          ]);

          console.log('Query results:', { emailSnap: emailSnap.docs.length, phoneSnap: phoneSnap.docs.length, nameSnap: nameSnap.docs.length });

          const quickDoc = emailSnap.docs[0] || phoneSnap.docs[0] || nameSnap.docs[0];

          matchedDoc = quickDoc;
          if (!matchedDoc) {
            // Fallback for legacy/user-typed usernames not indexed in Firestore.
            console.log('No quick match found, scanning all staff...');
            const scanSnap = await getDocs(query(staffRef, limit(200))).catch(e => {
              console.error('Scan query failed:', e);
              return { docs: [] };
            });
            console.log('Scanned', scanSnap.docs.length, 'staff records');
            matchedDoc = scanSnap.docs.find((d) => {
              const data = d.data() as any;
              return normalize(data.email) === normalizedInput ||
                normalize(data.name) === normalizedInput ||
                normalize(data.phone) === normalizedInput ||
                normalize(data.username) === normalizedInput;
            });
          }

          if (!matchedDoc) {
            // Compatibility fallback: some deployments only have users documents.
            const usersRef = collection(db, 'users');
            const usersSnap = await getDocs(query(usersRef, limit(300))).catch(e => {
              console.error('Users scan query failed:', e);
              return { docs: [] };
            });

            const userDoc = usersSnap.docs.find((d) => {
              const data = d.data() as any;
              return normalize(data.email) === normalizedInput ||
                normalize(data.displayName) === normalizedInput ||
                normalize(data.name) === normalizedInput;
            });

            if (userDoc) {
              matchedDoc = userDoc;
              matchedSource = 'users';
            }
          }
        } catch (err) {
          console.error('Error querying staff collection:', err);
          setError('Database error: Unable to query staff records. Check console.');
          setIsLoading(false);
          return;
        }

        if (!matchedDoc) {
          console.log('No staff record found for:', usernameInput);
          setError('Invalid credentials. Create this user in Users panel and assign role/terminal first.');
          setIsLoading(false);
          return;
        }

        if (matchedDoc) {
          const staffData = matchedDoc.data() as any;
          const storedPassword = String(staffData.password || '');
          const normalizedPermissions = (staffData.permissions && typeof staffData.permissions === 'object' && !Array.isArray(staffData.permissions))
            ? staffData.permissions
            : {};

          if (storedPassword) {
            if (storedPassword !== password) {
              setError('Invalid username or password.');
              setIsLoading(false);
              return;
            }
          } else {
            // One-time migration for old staff records created before password persistence.
            if (matchedSource === 'staff') {
              await updateDoc(doc(db, 'staff', matchedDoc.id), {
                password,
                updatedAt: serverTimestamp(),
              });
            }
          }

          let staffDocId = matchedSource === 'staff' ? matchedDoc.id : '';
          if (matchedSource === 'users') {
            // Rehydrate a missing staff record so admin modules and future logins remain stable.
            const fallbackEmail = String(staffData.email || '').trim();
            const byEmail = fallbackEmail
              ? await getDocs(query(staffRef, where('email', '==', fallbackEmail), limit(1))).catch(() => ({ empty: true, docs: [] as any[] }))
              : ({ empty: true, docs: [] } as any);

            if (!byEmail.empty) {
              staffDocId = byEmail.docs[0].id;
              await setDoc(doc(db, 'staff', staffDocId), {
                name: staffData.displayName || staffData.name || usernameInput,
                email: fallbackEmail,
                role: String(staffData.role || 'waiter').toLowerCase(),
                permissions: normalizedPermissions,
                terminalId: staffData.terminalId || null,
                storeId: staffData.storeId || null,
                uid: staffData.uid || matchedDoc.id,
                active: typeof staffData.active === 'boolean' ? staffData.active : true,
                password: storedPassword || password,
                updatedAt: serverTimestamp(),
              }, { merge: true });
            } else {
              const created = await addDoc(staffRef, {
                name: staffData.displayName || staffData.name || usernameInput,
                email: fallbackEmail || `${normalize(usernameInput)}@local.invalid`,
                role: String(staffData.role || 'waiter').toLowerCase(),
                permissions: normalizedPermissions,
                terminalId: staffData.terminalId || null,
                storeId: staffData.storeId || null,
                uid: staffData.uid || matchedDoc.id,
                active: typeof staffData.active === 'boolean' ? staffData.active : true,
                password: storedPassword || password,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              staffDocId = created.id;
            }
          }

          authenticatedUser = {
            email: staffData.email || usernameInput,
            role: String(staffData.role || 'waiter').toLowerCase(),
            name: staffData.name || staffData.displayName || usernameInput,
            permissions: normalizedPermissions,
            terminalId: staffData.terminalId || null,
            storeId: staffData.storeId || null,
            staffDocId,
          };
        }
      }

      if (authenticatedUser) {
        const user = auth.currentUser;
        if (!user) {
          console.error('Authentication session not available during admin login.');
          setError('Authentication session not available. Please try again.');
          setIsLoading(false);
          return;
        }

        const emailCandidate = String(authenticatedUser.email || '').trim();
        const fallbackEmail = `${String(authenticatedUser.name || 'staff').toLowerCase().replace(/[^a-z0-9]+/g, '.')}@local.invalid`;
        const safeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate) ? emailCandidate : fallbackEmail;

        // Sync to users collection; do not block login if permissions reject this write.
        try {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: safeEmail,
            displayName: authenticatedUser.name,
            role: authenticatedUser.role,
            permissions: authenticatedUser.permissions,
            terminalId: authenticatedUser.terminalId,
            storeId: authenticatedUser.storeId,
            tenantId: 'rivas',
            lastLogin: serverTimestamp()
          }, { merge: true });
        } catch (profileErr) {
          console.warn('Could not write users profile; continuing with session role fallback:', profileErr);
        }

        if (authenticatedUser.staffDocId) {
          try {
            await updateDoc(doc(db, 'staff', authenticatedUser.staffDocId), {
              uid: user.uid,
              lastLogin: serverTimestamp(),
            });
          } catch (staffErr) {
            console.warn('Could not update staff lastLogin; continuing:', staffErr);
          }
        }

        sessionStorage.setItem('activeStaffDocId', authenticatedUser.staffDocId || '');
        sessionStorage.setItem('activeStaffName', authenticatedUser.name || '');
        sessionStorage.setItem('activeStaffEmail', safeEmail || '');
        sessionStorage.removeItem('adminAuthLookup');

        // Preserve the exact backoffice role for module-level permission checks.
        sessionStorage.setItem('adminRole', String(authenticatedUser.role || 'waiter').toLowerCase());
        sessionStorage.setItem('adminAuthenticated', 'true');

        onLogin(true);
        navigate('/admin');
      } else {
        // If we only signed in to validate credentials and validation failed, clean up that temp session.
        if (signedInForLookup && auth.currentUser?.isAnonymous) {
          await auth.signOut();
        }
        sessionStorage.removeItem('adminAuthLookup');
        sessionStorage.removeItem('activeStaffDocId');
        sessionStorage.removeItem('activeStaffName');
        sessionStorage.removeItem('activeStaffEmail');
        setError('Invalid credentials. Create this user in Users panel and assign role/terminal first.');
      }
    } catch (err) {
      sessionStorage.removeItem('adminAuthLookup');
      console.error("Authentication failed:", err);
      setError(`Login failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setIsLoading(false);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl w-full max-w-md p-8 shadow-2xl relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="text-primary" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Admin Access</h2>
          <p className="text-muted-foreground">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="Enter username"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm font-medium text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <LogIn size={20} />
            )}
            {isLoading ? 'Authenticating...' : 'Login to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
