import { Loader2, Sparkles } from 'lucide-react';
import GoogleIcon from '@/components/GoogleIcon';

export default function GoogleAuthGate({ open, loading, error, onContinue }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-background shadow-2xl">
        <div className="px-6 pt-6 pb-5 bg-gradient-to-br from-primary/15 via-background to-background">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-violet">
            <Sparkles size={22} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use Google to keep your shopping conversations and product sessions tied to your account.
          </p>
        </div>

        <div className="px-6 pb-6">
          {error?.message && (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message}
            </div>
          )}

          <button
            type="button"
            onClick={onContinue}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-full bg-foreground px-5 py-3.5 text-sm font-medium text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
            Continue with Google
          </button>

          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
            Only Google sign-in is enabled. No password fields, no extra forms.
          </p>
        </div>
      </div>
    </div>
  );
}
