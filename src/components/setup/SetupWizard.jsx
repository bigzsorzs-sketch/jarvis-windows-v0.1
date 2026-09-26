/**
 * SetupWizard — 3-lépéses role-based onboarding
 * 1. Mire szeretnéd használni? (role)
 * 2. Integrációk (opcionális)
 * 3. Try it now – 3 javasolt voice prompt
 */
import { useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Check, Sparkles, Mic } from 'lucide-react';
import { useLang } from '@/lib/i18n';

const ROLE_IDS = ['cleaner', 'driver', 'business', 'personal'];
const ROLE_EMOJIS = { cleaner: '🧹', driver: '🚗', business: '💼', personal: '🙋' };
const INTEGRATION_IDS = [
  { id: 'smarthome', emoji: '🏠', key: 'onb_smart_home' },
  { id: 'car', emoji: '🚗', key: 'onb_car' },
  { id: 'glucose', emoji: '🩸', key: 'onb_glucose' },
  { id: 'email', emoji: '📧', key: 'onb_email' },
];
// Demo prompts are now taken from i18n keys per role
const DEMO_PROMPT_KEYS = {
  cleaner: ['demo_cleaner_prompt', 'demo_step1_cleaner_1', 'demo_step1_cleaner_2'],
  driver: ['demo_driver_prompt', 'demo_step1_driver_1', 'demo_step1_driver_2'],
  business: ['demo_cleaner_prompt', 'demo_step1_cleaner_1', 'demo_step1_cleaner_2'],
  personal: ['demo_life_prompt', 'demo_step1_life_1', 'demo_step1_life_2'],
};

export default function SetupWizard({ onComplete }) {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [userName, setUserName] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleIntegration = (id) => {
    setIntegrations(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const finish = async () => {
    if (!userName.trim()) return;
    setSaving(true);
    const created = await jarvis.entities.UserSettings.create({
      user_name: userName.trim(),
      preferred_languages: ['en'],
      ai_name: 'Jarvis',
      personality: 'profi',
      age_group: 'felnott',
      focus_mode: role === 'business' ? 'munka' : 'altalanos',
      learning_memory: true,
      web_search: true,
    });
    setSaving(false);
    onComplete({ ...created, role, integrations });
  };

  const promptKeys = DEMO_PROMPT_KEYS[role] || DEMO_PROMPT_KEYS.personal;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center p-6 overflow-y-auto">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-secondary">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait">

        {/* ── STEP 0: Role ── */}
        {step === 0 && (
          <motion.div key="role" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-3xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={28} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">{t('onb_welcome')}</h1>
              <p className="text-sm text-muted-foreground mt-2">{t('onb_sub')}</p>
            </div>

            <div className="space-y-3 mb-8">
              {ROLE_IDS.map(rid => (
                <button
                  key={rid}
                  onClick={() => setRole(rid)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                    role === rid
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-card border-border text-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="text-2xl">{ROLE_EMOJIS[rid]}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{t(`role_${rid}`)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t(`role_${rid}_sub`)}</p>
                  </div>
                  {role === rid && <Check size={16} className="text-primary shrink-0" />}
                </button>
              ))}
            </div>

            <button
              disabled={!role}
              onClick={() => setStep(1)}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {t('onb_continue')} <ChevronRight size={16} />
            </button>
          </motion.div>
        )}

        {/* ── STEP 1: Name + Integrations ── */}
        {step === 1 && (
          <motion.div key="integrations" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-foreground">{t('onb_name_title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('onb_name_sub')}</p>
            </div>

            <input
              autoFocus
              className="w-full bg-secondary rounded-2xl px-5 py-4 text-lg text-foreground outline-none border border-border focus:border-primary mb-6 text-center"
              placeholder={t('onb_name_placeholder')}
              value={userName}
              onChange={e => setUserName(e.target.value)}
            />

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('onb_connect_title')}</p>
            <div className="grid grid-cols-2 gap-2 mb-8">
              {INTEGRATION_IDS.map(int => (
                <button
                  key={int.id}
                  onClick={() => toggleIntegration(int.id)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-2xl border text-sm font-medium transition-all ${
                    integrations.includes(int.id)
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-card border-border text-muted-foreground'
                  }`}
                >
                  <span>{int.emoji}</span> {t(int.key)}
                  {integrations.includes(int.id) && <Check size={12} className="ml-auto text-primary" />}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 py-3.5 rounded-2xl bg-secondary text-foreground font-semibold">{t('onb_back')}</button>
              <button
                onClick={() => setStep(2)}
                disabled={!userName.trim()}
                className="flex-1 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {t('onb_continue')} <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: Try it now ── */}
        {step === 2 && (
          <motion.div key="try" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-3xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <Mic size={28} className="text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">{t('onb_try_title')} {userName}! 🎉</h1>
              <p className="text-sm text-muted-foreground mt-2">{t('onb_try_sub')}</p>
            </div>

            <div className="space-y-3 mb-8">
              {promptKeys.map((pk, i) => (
                <div key={i} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-start gap-3">
                  <Mic size={14} className="text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground italic">{t(pk)}</p>
                </div>
              ))}
            </div>

            <button
              onClick={finish}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2"
            >
              {saving ? t('onb_setting_up') : <><Sparkles size={18} /> {t('onb_finish')}</>}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step dots */}
      <div className="absolute bottom-8 flex gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1.5 rounded-full transition-all ${step === i ? 'bg-primary w-6' : 'bg-secondary border border-border w-1.5'}`} />
        ))}
      </div>
    </div>
  );
}