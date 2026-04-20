import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, LogOut, User as UserIcon, Settings } from 'lucide-react';
import ProfileModal from './ProfileModal';
import { AnimatePresence } from 'motion/react';

export default function Auth() {
  const { user, profile, login, logout } = useAuth() as any;
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  if (user && !user.isAnonymous) {
    return (
      <>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-2 px-4 py-2 hover:bg-muted rounded-2xl transition-all group"
          >
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <UserIcon size={16} />
            </div>
            <div className="text-left hidden sm:flex flex-col justify-center">
              <p className="text-[11px] font-black text-foreground leading-tight">{profile?.displayName || user.displayName || profile?.email || user.email || 'Account'}</p>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] mt-0.5">
                {(profile?.role || (user.isAnonymous ? 'guest' : 'user'))} • Profile Settings
              </p>
            </div>
          </button>
          <div className="h-4 w-px bg-border mx-1" />
          <button
            onClick={logout}
            className="p-2 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all text-muted-foreground"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>

        <AnimatePresence>
          {isProfileOpen && (
            <ProfileModal onClose={() => setIsProfileOpen(false)} />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={login}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
      >
        <LogIn size={18} />
        <span>Sign In</span>
      </button>
      <button
        onClick={login}
        className="flex items-center gap-2 px-6 py-2.5 bg-muted text-foreground rounded-2xl text-sm font-bold hover:bg-accent transition-all"
      >
        <span>Sign Up</span>
      </button>
    </div>
  );
}
