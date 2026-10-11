import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import LanguagePicker from '@/components/chat/LanguagePicker';

const ROOT_PATHS = ['/', '/chat', '/muszerfal', '/eszkozok', '/beallitasok'];

// Maps route → translation key
export const PAGE_TITLE_KEYS = {
  '/tools/finance':      'page_finance',
  '/tools/invoices':     'page_invoices',
  '/tools/calendar':     'page_calendar',
  '/tools/translate':    'page_translate',
  '/tools/quick':        'page_quick',
  '/tools/image-editor': 'page_image_editor',
  '/contacts':           'page_contacts',
  '/reminders':          'page_reminders',
  '/smarthome':          'page_smarthome',
  '/routines':           'page_routines',
  '/holding':            'page_holding',
  '/legal':              'page_legal',
  '/privacy-terms':      'page_privacy_terms',
  '/release-checklist':  'page_release_checklist',
  '/automotive':         'page_automotive',
  '/retail':             'page_retail',
  '/diagnostics':        'page_diagnostics',
  '/gmail':              'page_gmail',
  '/locations':          'page_locations',
  '/habits':             'page_habits',
  '/obd2':               'page_obd2',
  '/jelentesek':         'page_reports',
  '/memoria':            'page_memory',
  '/voice-help':         'page_voice_help',
  '/ai-feedback-admin':  'page_ai_feedback_admin',
  '/system-center':      'page_system_center',
  '/fuel-tracker':       'page_fuel_tracker',
  '/live-assistant':     'page_live_assistant',
};

export default function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();
  const isRoot = ROOT_PATHS.includes(location.pathname);

  if (isRoot) {
    return (
      <header dir="ltr" className="relative z-50 flex items-center gap-3 px-4 pt-3 pb-2 shrink-0 bg-background/80 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">J</span>
          </div>
          <span className="font-bold text-base text-foreground tracking-tight">Jarvis</span>
        </div>
        <div className="ml-auto shrink-0" aria-label={t('language')}>
          <LanguagePicker />
        </div>
      </header>
    );
  }

  const titleKey = PAGE_TITLE_KEYS[location.pathname];
  const title = titleKey
    ? (titleKey.startsWith('page_') ? t(titleKey) : titleKey)
    : t('back');

  return (
    <header dir="ltr" className="relative z-50 flex items-center gap-3 px-3 pt-3 pb-2 shrink-0 bg-background/80 backdrop-blur-sm border-b border-border/40">
      <button
        onClick={() => navigate(-1)}
        aria-label={t('back')}
        className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
      >
        <ChevronLeft size={20} className="text-foreground" />
      </button>
      <span dir="auto" className="min-w-0 flex-1 text-base font-semibold text-foreground truncate">{title}</span>
      <div className="shrink-0" aria-label={t('language')}>
        <LanguagePicker />
      </div>
    </header>
  );
}
