import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, MessageCircle, BarChart3, Brain, Wrench, Settings, MoreHorizontal, X,
  Car, Activity, ShieldCheck, Wifi, Radio, Cpu, ChevronRight, Database
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
  const { t } = useLang();

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
    { path: '/', label: t('home'), eyebrow: 'CORE', icon: Home },
    { path: '/chat', label: t('assistant'), eyebrow: 'AI', icon: MessageCircle },
    { path: '/muszerfal', label: t('dashboard'), eyebrow: 'DATA', icon: BarChart3 },
    { path: '/memoria', label: t('page_memory') || 'Memória', eyebrow: 'MEMORY', icon: Brain },
    { path: '/eszkozok', label: t('tools'), eyebrow: 'TOOLS', icon: Wrench },
    { path: '/beallitasok', label: t('settings'), eyebrow: 'SYSTEM', icon: Settings },
  ];

  const systemNav = [
    { path: '/automotive', label: 'Automotive', icon: Car },
    { path: '/obd2', label: 'OBD-II', icon: Activity },
    { path: '/tools/finance', label: 'Finance', icon: BarChart3 },
    { path: '/system-center', label: 'System Center', icon: Database },
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
  const pageEyebrow = currentItem?.eyebrow || 'MODULE';
  const isMoreActive = mobileMoreNav.some(n => n.path === location.pathname);

  return (
    <div className="jarvis-shell flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <aside className="jarvis-sidebar hidden md:flex w-[268px] xl:w-[292px] shrink-0 flex-col">
        <div className="px-5 pt-6 pb-5">
          <button
            onClick={() => navigate('/')}
            className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left"
          >
            <div className="jarvis-core-orb relative flex h-12 w-12 items-center justify-center rounded-2xl">
              <Cpu size={22} className="relative z-10 text-primary" />
              <span className="absolute inset-0 rounded-2xl border border-primary/30 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-[0.22em] text-foreground">JARVIS</span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
              </div>
              <p className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">DESKTOP INTELLIGENCE</p>
            </div>
          </button>
        </div>

        <div className="px-4">
          <div className="mb-2 px-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/70">PRIMARY SYSTEMS</div>
          <nav className="space-y-1.5">
            {desktopNav.map(({ path, label, eyebrow, icon: Icon }) => {
              const active = isDesktopActive(path);
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  aria-current={active ? 'page' : undefined}
                  className={active
                    ? 'jarvis-nav-item jarvis-nav-item-active w-full'
                    : 'jarvis-nav-item w-full text-muted-foreground hover:text-foreground'}
                >
                  <div className={active ? 'jarvis-nav-icon bg-primary/15 text-primary' : 'jarvis-nav-icon bg-secondary/70 text-muted-foreground'}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold">{label}</div>
                    <div className="text-[9px] font-bold tracking-[0.18em] opacity-45">{eyebrow}</div>
                  </div>
                  {active && <ChevronRight size={14} className="text-primary" />}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mx-5 my-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 jarvis-scroll">
          <div className="mb-2 px-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/70">QUICK MODULES</div>
          <nav className="space-y-1">
            {systemNav.map(({ path, label, icon: Icon }) => {
              const active = isDesktopActive(path);
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={active
                    ? 'flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary'
                    : 'flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-secondary/50 hover:text-foreground'}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="m-4 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] font-bold tracking-[0.16em] text-primary">SYSTEM ONLINE</span>
            </div>
            <ShieldCheck size={15} className="text-primary/70" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5"><Wifi size={12} /> NETWORK</div>
            <div className="flex items-center gap-1.5"><Radio size={12} /> LOCAL CORE</div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
            <LanguagePicker />
            <span className="font-mono text-xs text-muted-foreground">{clock}</span>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <MobileHeader />
        </div>

        <header className="jarvis-topbar hidden h-[72px] shrink-0 items-center justify-between px-7 md:flex xl:px-9">
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
      <GlobalVoiceControl />
    </div>
  );
}
