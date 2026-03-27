import { useAuth } from '../contexts/AuthContext';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export default function Auth() {
  const { user, login, logout } = useAuth();

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserIcon size={16} />
          <span>{user.displayName}</span>
        </div>
        <button
          onClick={logout}
          className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </div>
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
        className="flex items-center gap-2 px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-2xl text-sm font-bold hover:bg-zinc-200 transition-all"
      >
        <span>Sign Up</span>
      </button>
    </div>
  );
}
