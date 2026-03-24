import React, { useState } from 'react';
import { LogIn, X, ShieldCheck } from 'lucide-react';
import { auth, db } from '../firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      // 1. Check if it's the super admin or a staff member
      let authenticatedUser = null;
      
      if (username === 'admin' && password === 'rivas2026') {
        authenticatedUser = { email: 'admin@rivas.com', role: 'admin', name: 'Super Admin' };
      } else {
        // Check staff collection
        const staffRef = collection(db, 'staff');
        const q = query(staffRef, where('email', '==', username), where('password', '==', password));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const staffData = querySnapshot.docs[0].data();
          authenticatedUser = { email: staffData.email, role: staffData.role, name: staffData.name };
        }
      }

      if (authenticatedUser) {
        console.log("Attempting anonymous login for admin...");
        const userCredential = await signInAnonymously(auth);
        const user = userCredential.user;
        
        // Set admin role in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: authenticatedUser.email,
          displayName: authenticatedUser.name,
          role: authenticatedUser.role,
          tenantId: 'rivas',
          addresses: []
        }, { merge: true });

        onLogin(true);
        navigate('/admin');
      } else {
        setError('Invalid username or password. Please check your credentials.');
      }
    } catch (err) {
      console.error("Authentication failed:", err);
      setError(`Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl relative">
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="text-primary" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">Admin Access</h2>
          <p className="text-zinc-500">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="Enter username"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all"
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
