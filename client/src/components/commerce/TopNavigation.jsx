import { Heart, ShoppingBag, LogOut } from 'lucide-react';

const items = [['discover', 'Discover'], ['results', 'Results'], ['tryon', 'Try-on'], ['checkout', 'Checkout']];

function getDisplayName(user) {
  if (!user) return 'Guest';
  return user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Signed in';
}

function getInitial(user) {
  const source = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'A';
  return source.trim().charAt(0).toUpperCase();
}

export default function TopNavigation({ mode, onMode, enabled, user, onLogout }) {
  const name = getDisplayName(user);
  const email = user?.email || '';
  const initial = getInitial(user);

  return (
    <header className="h-16 border-b border-border flex items-center px-4 md:px-6 bg-card">
      <button onClick={() => onMode('discover')} className="flex items-center gap-2 font-semibold text-sm tracking-tight" type="button">
        <span className="w-5 h-5 rounded-full bg-primary grid place-items-center"><span className="w-1.5 h-1.5 rounded-full bg-white" /></span>
        OpenCommerceLens
      </button>
      <nav className="hidden md:flex mx-auto h-full">
        {items.map(([id, label]) => (
          <button
            key={id}
            disabled={id !== 'discover' && !enabled}
            onClick={() => onMode(id)}
            className={`px-6 text-sm border-b-2 transition ${mode === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'} disabled:opacity-30`}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <button className="hidden sm:flex gap-2" type="button"><Heart size={16} />Saved</button>
        <button className="hidden sm:flex gap-2" type="button"><ShoppingBag size={16} />Orders</button>
        <div className="hidden md:flex items-center gap-3 rounded-full border border-border bg-background/70 px-3 py-1.5">
          <div className="text-right leading-tight">
            <div className="text-xs font-medium text-foreground">{name}</div>
            {email && <div className="text-[11px] text-muted-foreground">{email}</div>}
          </div>
          <span className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs font-medium">{initial}</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="hidden md:flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          <LogOut size={14} />
          Sign out
        </button>
        <span className="md:hidden w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs font-medium">{initial}</span>
      </div>
    </header>
  );
}
