import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import ErrorBoundary from './components/ErrorBoundary';
import { LangProvider } from '@/lib/i18n';
import { AnimatePresence, motion } from 'framer-motion';
import { applyThemeMode, getThemeMode, subscribeTheme } from '@/lib/themeManager';
import PushNotificationManager from './components/jarvis/PushNotificationManager';
import NativeDialogBridge from './components/common/NativeDialogBridge';
import Layout from './components/Layout';
import Chat from './pages/Chat';
const LiveAssistant = lazy(() => import('./pages/LiveAssistant'));
const Muszerfal = lazy(() => import('./pages/Muszerfal'));
const Memoria = lazy(() => import('./pages/Memoria'));
const Eszkozok = lazy(() => import('./pages/Eszkozok'));
const Beallitasok = lazy(() => import('./pages/Beallitasok'));
const FinanceTool = lazy(() => import('./pages/tools/FinanceTool'));
const InvoiceTool = lazy(() => import('./pages/tools/InvoiceTool'));
const CalendarTool = lazy(() => import('./pages/tools/CalendarTool'));
const TranslateTool = lazy(() => import('./pages/tools/TranslateTool'));
const QuickActions = lazy(() => import('./pages/tools/QuickActions'));
const ImageEditor = lazy(() => import('./pages/tools/ImageEditor'));
const Jelentesek = lazy(() => import('./pages/Jelentesek'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Reminders = lazy(() => import('./pages/Reminders'));
const SmartHome = lazy(() => import('./pages/SmartHome'));
const Routines = lazy(() => import('./pages/Routines'));
const Holding = lazy(() => import('./pages/Holding'));
const Legal = lazy(() => import('./pages/Legal'));
const PrivacyTerms = lazy(() => import('./pages/PrivacyTerms'));
const ReleaseChecklist = lazy(() => import('./pages/ReleaseChecklist'));
const AutomotiveDiagnostics = lazy(() => import('./pages/AutomotiveDiagnostics'));
const Retail = lazy(() => import('./pages/Retail'));
const GmailManager = lazy(() => import('./pages/GmailManager'));
const LocationsPage = lazy(() => import('./pages/LocationsPage'));
const HabitsPage = lazy(() => import('./pages/HabitsPage'));
const OBD2Scanner = lazy(() => import('./pages/OBD2Scanner'));
const FuelTracker = lazy(() => import('./pages/FuelTracker'));
const VoiceCommandHelp = lazy(() => import('./pages/VoiceCommandHelp'));
const AiFeedbackAdmin = lazy(() => import('./pages/AiFeedbackAdmin'));
const SystemCenter = lazy(() => import('./pages/SystemCenter'));


const PageLoader = () => (
  <div className="flex h-full items-center justify-center bg-background">
    <div className="w-7 h-7 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
);

function AuthFailureScreen({ error, onRetry }) {
  const type = error?.type || 'local_profile_error';
  const title = type === 'network_error'
    ? 'Kapcsolati hiba'
    : type === 'auth_required'
      ? 'Hozzáférés szükséges'
      : 'Jarvis profilhiba';
  const description = type === 'network_error'
    ? 'Jarvis nem tudta ellenőrizni a helyi profilt a kapcsolat miatt.'
    : type === 'auth_required'
      ? 'A hozzáférés ellenőrzése nem sikerült. Próbáld újra.'
      : 'Jarvis nem tudta biztonságosan betölteni a helyi tulajdonosi profilt. A belső felületet nem indítom el félállapotban.';

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="text-xs font-bold tracking-[0.22em] text-primary/70">JARVIS</div>
        <h1 className="mt-2 text-xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        {error?.message && (
          <div className="mt-4 rounded-xl border border-border bg-background/70 p-3 font-mono text-xs text-muted-foreground break-words">
            {String(error.message).slice(0, 500)}
          </div>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Újrapróbálom
        </button>
      </div>
    </div>
  );
}

const AuthenticatedApp = () => {
  const {
    isLoadingAuth, isLoadingPublicSettings, authError,
    isAuthenticated, authChecked, checkAppState
  } = useAuth();
  const location = useLocation();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    return <AuthFailureScreen error={authError} onRetry={checkAppState} />;
  }

  if (authChecked && !isAuthenticated) {
    return (
      <AuthFailureScreen
        error={{ type:'local_profile_error', message:'LOCAL_OWNER_PROFILE_MISSING' }}
        onRetry={checkAppState}
      />
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeInOut' }}
      style={{ position: 'relative', width: '100%', minHeight: '100%' }}
    >
    <Suspense fallback={<PageLoader />}>
      <Routes location={location}>
        <Route element={<Layout />}>
          <Route path="/" element={<Chat />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/muszerfal" element={<Muszerfal />} />
          <Route path="/memoria" element={<Memoria />} />
          <Route path="/eszkozok" element={<Eszkozok />} />
          <Route path="/beallitasok" element={<Beallitasok />} />
          <Route path="/tools/finance" element={<FinanceTool />} />
          <Route path="/tools/invoices" element={<InvoiceTool />} />
          <Route path="/tools/calendar" element={<CalendarTool />} />
          <Route path="/tools/translate" element={<TranslateTool />} />
          <Route path="/tools/quick" element={<QuickActions />} />
          <Route path="/tools/image-editor" element={<ImageEditor />} />

          <Route path="/jelentesek" element={<Jelentesek />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/smarthome" element={<SmartHome />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/holding" element={<Holding />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/privacy-terms" element={<PrivacyTerms />} />
          <Route path="/release-checklist" element={<ReleaseChecklist />} />
          <Route path="/automotive" element={<AutomotiveDiagnostics />} />
          <Route path="/retail" element={<Retail />} />
          <Route path="/gmail" element={<GmailManager />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/obd2" element={<OBD2Scanner />} />
          <Route path="/fuel-tracker" element={<FuelTracker />} />
          <Route path="/voice-help" element={<VoiceCommandHelp />} />
          <Route path="/ai-feedback-admin" element={<AiFeedbackAdmin />} />
          <Route path="/system-center" element={<SystemCenter />} />
          <Route path="/live-assistant" element={<LiveAssistant />} />

        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
    </motion.div>
    </AnimatePresence>
  );
};

// Apply persisted light/dark/system theme before rendering.
applyThemeMode(getThemeMode());

function ThemeRuntime() {
  useEffect(() => {
    applyThemeMode(getThemeMode());
    return subscribeTheme(() => {});
  }, []);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeRuntime />
      <LangProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <PushNotificationManager />
              <NativeDialogBridge />
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </LangProvider>
    </ErrorBoundary>
  )
}

export default App