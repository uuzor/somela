import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import OpenCommerceLens from '@/pages/OpenCommerceLens';
import GoogleAuthGate from '@/components/commerce/GoogleAuthGate';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, authError, signInWithGoogle, isSessionSyncing } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<OpenCommerceLens />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>

      <GoogleAuthGate
        open={!isAuthenticated}
        loading={isSessionSyncing}
        error={authError}
        onContinue={signInWithGoogle}
      />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
