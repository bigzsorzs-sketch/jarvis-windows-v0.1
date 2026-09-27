import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, MessageCircle, BarChart3, Brain, Wrench, Settings, MoreHorizontal, X,
  Car, Activity, Cpu, Database, CalendarDays, Folder, Grid3X3, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import LocationSensor from './jarvis/LocationSensor';
import LanguagePicker from './chat/LanguagePicker';
import GlobalVoiceControl from './voice/GlobalVoiceControl';
import { AnimatePresence, motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import MobileHeader from './MobileHeader';
import { recordTabPath, getLastTabPath, resetTabPath } from '@/lib/tabHistory';

const toolPaths = new Set([
  '/contacts','/reminders','/smarthome','/routines','/legal','/retail','/gmail',
  '/locations','/habits','/fuel-tracker','/jelentesek','/holding','/privacy-terms',
  '/release-checklist','/voice-help','/ai-feedback-admin','/system-center'
]);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const [clock, setClock] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t, lang } = useLang();

  useEffect(() => {
    recordTabPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const updateClock = () => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    updateClock();
    const timer = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const mobileMainNav = [
    { path: '/', label: t('home'), icon: Home },
    { path: '/chat', label: t('assistant'), icon: MessageCircle },
    { path: '/eszkozok', label: t('tools'), icon: Wrench },
  ];

  const mobileMoreNav = [
    { path: '/muszerfal', label: t('dashboard'), icon: BarChart3 },
    { path: '/beallitasok', label: t('settings'), icon: Settings },
  ];

  const desktopNav = [
    { path: '/', label: t('home'), icon: Home },
    { path: '/chat', label: t('chat'), icon: MessageCircle },
    { path: '/reminders', label: t('tasks'), icon: Activity },
    { path: '/memoria', label: t('memories'), icon: Brain },
    { path: '/eszkozok', label: t('tools'), icon: Folder },
    { path: '/tools/calendar', label: t('page_calendar'), icon: CalendarDays },
    { path: '/muszerfal', label: t('dashboard'), icon: Grid3X3 },
  ];

  const systemNav = [
    { path: '/automotive', label: t('page_automotive'), icon: Car },
    { path: '/obd2', label: 'OBD-II', icon: Activity },
    { path: '/tools/finance', label: t('finance'), icon: BarChart3 },
    { path: '/system-center', label: lang === 'hu' ? 'Rendszerközpont' : 'System Center', icon: Database },
  ];

  const activeMobileTab = (() => {
    const p = location.pathname;
    if (p === '/') return '/';
    if (p === '/chat') return '/chat';
    if (p.startsWith('/beallitasok')) return '/beallitasok';
    if (
      p.startsWith('/eszkozok') ||
      p.startsWith('/tools/') ||
      toolPaths.has(p) ||
      ['/muszerfal','/memoria','/automotive','/obd2'].includes(p)
    ) return '/eszkozok';
    return p;
  })();

  const isDesktopActive = (path) => {
    const p = location.pathname;
    if (path === '/') return p === '/';
    if (path === '/eszkozok') return p === '/eszkozok' || p.startsWith('/tools/') || toolPaths.has(p);
    return p === path || p.startsWith(path + '/');
  };

  const goTo = (tabRoot) => {
    if (activeMobileTab === tabRoot) {
      resetTabPath(tabRoot);
      navigate(tabRoot);
    } else {
      navigate(getLastTabPath(tabRoot));
    }
    setShowMore(false);
  };

  const currentItem = [...desktopNav, ...systemNav].find(item => isDesktopActive(item.path));
  const pageTitle = currentItem?.label || 'Jarvis';
  const pageEyebrow = 'JARVIS';
  const isMoreActive = mobileMoreNav.some(n => n.path === location.pathname);

  return (
    <div className="jarvis-shell flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <aside className={`jarvis-reference-sidebar hidden md:flex shrink-0 flex-col ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="jarvis-reference-brand">
          <button onClick={() => navigate('/')} className="jarvis-reference-logo" aria-label="Jarvis home">
            <span className="jarvis-reference-logo-orb" />
            {!sidebarCollapsed && <strong>Jarvis</strong>}
          </button>
          <button className={location.pathname === '/' ? 'jarvis-sidebar-collapse reference-home-hidden' : 'jarvis-sidebar-collapse'} onClick={() => setSidebarCollapsed(v => !v)} aria-label="Oldalsáv összecsukása">
            {sidebarCollapsed ? <PanelLeftOpen size={15}/> : <PanelLeftClose size={15}/>}
          </button>
        </div>
        <nav className="jarvis-reference-nav">
          {desktopNav.map(({ path, label, icon: Icon }) => {
            const active = isDesktopActive(path);
            return <button key={path} onClick={() => navigate(path)} className={active ? 'active' : ''} title={label}>
              <Icon size={15}/>{!sidebarCollapsed && <span>{label}</span>}
            </button>;
          })}
        </nav>
        <div className="jarvis-reference-spacer" />
        {location.pathname !== '/' && <nav className="jarvis-reference-nav jarvis-reference-system-nav">
          {systemNav.map(({ path, label, icon: Icon }) => <button key={path} onClick={() => navigate(path)} title={label}><Icon size={15}/>{!sidebarCollapsed && <span>{label}</span>}</button>)}
        </nav>}
        <button onClick={() => navigate('/beallitasok')} className="jarvis-reference-settings" title={t('settings')}><Settings size={15}/>{!sidebarCollapsed && <span>{t('settings')}</span>}</button>
      </aside>
      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <MobileHeader />
        </div>

        <header className={`jarvis-topbar jarvis-reference-topbar ${location.pathname === '/' ? 'hidden' : 'hidden md:flex'} h-[42px] shrink-0 items-center justify-between px-5`}>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-primary/70">
              <span>{pageEyebrow}</span>
              <span className="text-border">/</span>
              <span className="truncate text-muted-foreground">{location.pathname === '/' ? 'HOME' : location.pathname.toUpperCase()}</span>
            </div>
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="jarvis-status-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              SECURE
            </div>
            <div className="jarvis-status-chip">
              <Cpu size={13} />
              LOCAL CORE
            </div>
            <div className="ml-2 font-mono text-sm font-semibold text-foreground/80">{clock}</div>
          </div>
        </header>

        <main className="jarvis-content relative min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>

        <AnimatePresence>
          {showMore && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-16 right-2 z-50 min-w-[150px] rounded-2xl border border-border bg-card p-2 shadow-xl md:hidden"
            >
              {mobileMoreNav.map(({ path, label, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => goTo(path)}
                  aria-label={label}
                  aria-current={location.pathname === path ? 'page' : undefined}
                  className={location.pathname === path
                    ? 'flex min-h-[44px] w-full items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-sm text-primary'
                    : 'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-secondary'}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <div className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2.5">
                <LanguagePicker />
                <span className="text-xs font-medium text-muted-foreground">{t('language')}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <nav
          className="z-40 flex shrink-0 items-center justify-around border-t border-border bg-card px-2 pt-2 md:hidden"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          {mobileMainNav.map(({ path, label, icon: Icon }) => {
            const active = activeMobileTab === path;
            return (
              <button
                key={path}
                onClick={() => { setShowMore(false); goTo(path); }}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={active
                  ? 'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-1 text-primary'
                  : 'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-1 text-muted-foreground'}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setShowMore(v => !v)}
            aria-label={t('more')}
            aria-expanded={showMore}
            className={isMoreActive || showMore
              ? 'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-1 text-primary'
              : 'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-1 text-muted-foreground'}
          >
            {showMore ? <X size={22} /> : <MoreHorizontal size={22} />}
            <span className="text-[10px] font-medium">{t('more')}</span>
          </button>
        </nav>
      </section>

      <LocationSensor />
      {location.pathname !== '/' && <GlobalVoiceControl />}
    </div>
  );
}
