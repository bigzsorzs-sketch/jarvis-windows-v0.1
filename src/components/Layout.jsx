import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, BarChart2, ClipboardList, Settings, MoreHorizontal, X } from 'lucide-react';
import LocationSensor from './jarvis/LocationSensor';
import LanguagePicker from './chat/LanguagePicker';
import GlobalVoiceControl from './voice/GlobalVoiceControl';
import { AnimatePresence, motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import MobileHeader from './MobileHeader';
import { recordTabPath, getLastTabPath, resetTabPath } from '@/lib/tabHistory';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    recordTabPath(location.pathname);
  }, [location.pathname]);

  const mainNav = [
    { path: '/', label: t('home'), icon: Home },
    { path: '/chat', label: t('assistant'), icon: MessageCircle },
    { path: '/eszkozok', label: t('tools'), icon: ClipboardList },
  ];
  const moreNav = [
    { path: '/muszerfal', label: t('dashboard'), icon: BarChart2 },
    { path: '/beallitasok', label: t('settings'), icon: Settings },
  ];

  // Determine which main tab is "active" (including nested paths)
  const activeTab = (() => {
    const p = location.pathname;
    if (p === '/') return '/';
    if (p === '/chat') return '/chat';
    if (p.startsWith('/beallitasok')) return '/beallitasok';
    if (p.startsWith('/eszkozok') || p.startsWith('/tools/') || [
      '/muszerfal','/contacts','/reminders','/smarthome','/routines',
      '/legal','/automotive','/retail','/gmail',
      '/locations','/habits','/obd2','/fuel-tracker','/jelentesek','/memoria',
      '/holding','/privacy-terms','/release-checklist','/live-assistant','/voice-help','/ai-feedback-admin',
    ].includes(p)) return '/eszkozok';
    return p;
  })();

  const isMoreActive = moreNav.some(n => n.path === location.pathname);

  const goTo = (tabRoot) => {
    if (activeTab === tabRoot) {
      // Tapping the already-active tab resets it to root (Android back-stack convention)
      resetTabPath(tabRoot);
      navigate(tabRoot);
    } else {
      navigate(getLastTabPath(tabRoot));
    }
    setShowMore(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background md:max-w-md mx-auto relative overflow-hidden border-x border-border/40 shadow-2xl shadow-black/20">
      <MobileHeader />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <LocationSensor />
      <GlobalVoiceControl />

      {/* More menu overlay */}
      <AnimatePresence>
        {showMore && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-16 right-2 bg-card border border-border rounded-2xl p-2 z-50 shadow-xl min-w-[140px]"
          >
            {moreNav.map(({ path, label, icon: Icon }) => (
              <button
                key={path}
                onClick={() => goTo(path)}
                aria-label={label}
                aria-current={location.pathname === path ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm transition-all ${
                  location.pathname === path ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-secondary'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <div className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px]">
              <LanguagePicker />
              <span className="text-xs font-medium text-muted-foreground">{t('language')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="flex items-center justify-around bg-card border-t border-border px-2 pt-2 shrink-0 z-40" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
        {mainNav.map(({ path, label, icon: Icon }) => {
          const active = activeTab === path;
          return (
            <button
              key={path}
              onClick={() => { setShowMore(false); goTo(path); }}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-1 min-w-[44px] min-h-[44px] rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-primary ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon size={22} className={active ? 'text-primary' : ''} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
        {/* More button */}
        <button
          onClick={() => setShowMore(v => !v)}
          aria-label={t('more')}
          aria-expanded={showMore}
          className={`flex flex-col items-center justify-center gap-1 px-3 py-1 min-w-[44px] min-h-[44px] rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-primary ${
            isMoreActive || showMore ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {showMore ? <X size={22} /> : <MoreHorizontal size={22} />}
          <span className="text-[10px] font-medium">{t('more')}</span>
        </button>
      </nav>
    </div>
  );
}