import { lazy, Suspense } from 'react';
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
import PushNotificationManager from './components/jarvis/PushNotificationManager';
import NativeDialogBridge from './components/common/NativeDialogBridge';
import Layout from './components/Layout';
import Chat from './pages/Chat';
import Home from './pages/Home';
import LiveAssistant from './pages/LiveAssistant';
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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
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
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
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
          <Route path="/" element={<Home />} />
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

// Apply dark class based on localStorage or system preference
function applyDarkMode(dark) {
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1a2030' : '#ffffff');
}

const safeStorage = {
  getItem(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    try { window.localStorage.setItem(key, value); } catch {}
  },
};

const prefersDarkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
const savedTheme = safeStorage.getItem('theme');
const initialDark = savedTheme !== null
  ? savedTheme === 'dark'
  : Boolean(prefersDarkQuery?.matches);

if (savedTheme === null) safeStorage.setItem('theme', initialDark ? 'dark' : 'light');
applyDarkMode(initialDark);

prefersDarkQuery?.addEventListener?.('change', e => {
  if (safeStorage.getItem('theme') === null) applyDarkMode(e.matches);
});

function App() {
  return (
    <ErrorBoundary>
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