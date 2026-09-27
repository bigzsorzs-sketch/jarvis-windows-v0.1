import { useState, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { useLang } from '@/lib/i18n';
import PersonalServicesCard from '@/components/settings/PersonalServicesCard';
import InviteUserCard from '@/components/settings/InviteUserCard';
import { SecurityCard, CloudSyncCard } from '@/components/settings/SecurityCloudCards';
import SettingsMenuItems from '@/components/settings/SettingsMenuItems';
import DeleteAccountCard from '@/components/settings/DeleteAccountCard';
import BehaviorProfileSection from '@/components/settings/BehaviorProfileSection';
import SettingsPageHeader from '@/components/settings/SettingsPageHeader';
import ThemeToggleCard from '@/components/settings/ThemeToggleCard';
import PersonalizationCard from '@/components/settings/PersonalizationCard';
import FocusModeCard from '@/components/settings/FocusModeCard';
import AiBehaviorCard from '@/components/settings/AiBehaviorCard';
import NotificationsCard from '@/components/settings/NotificationsCard';
import UpdateCard from '@/components/settings/UpdateCard';
import { updateOwnedEntity } from '@/lib/ownedEntityHelpers';
import { applyThemeMode, getThemeMode, subscribeTheme } from '@/lib/themeManager';
import { getVoicePreferences, saveVoicePreferences } from '@/lib/speechPresentation';

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-12 h-6 rounded-full transition-all ${checked ? 'bg-primary' : 'bg-secondary border border-border'}`}
  >
    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-0.5'}`} />
  </button>
);
const defaultInterests = ['technológia', 'napi segítség', 'tőzsde'];

export default function Beallitasok() {
  const { t, lang } = useLang();

  const personalities = [
    { key: 'kedves', label: lang === 'hu' ? 'Kedves' : lang === 'de' ? 'Freundlich' : lang === 'fr' ? 'Aimable' : lang === 'es' ? 'Amable' : 'Friendly' },
    { key: 'profi', label: lang === 'hu' ? 'Profi' : lang === 'de' ? 'Professionell' : lang === 'fr' ? 'Professionnel' : lang === 'es' ? 'Profesional' : 'Professional' },
    { key: 'lenduletes', label: lang === 'hu' ? 'Lendületes' : lang === 'de' ? 'Energetisch' : lang === 'fr' ? 'Dynamique' : lang === 'es' ? 'Dinámico' : 'Energetic' },
    { key: 'jatekos', label: lang === 'hu' ? 'Játékos' : lang === 'de' ? 'Verspielt' : lang === 'fr' ? 'Ludique' : lang === 'es' ? 'Juguetón' : 'Playful' },
  ];
  const ageGroups = [
    { key: 'gyerek', label: lang === 'hu' ? 'Gyerek' : lang === 'de' ? 'Kind' : lang === 'fr' ? 'Enfant' : lang === 'es' ? 'Niño' : 'Child' },
    { key: 'tini', label: lang === 'hu' ? 'Tini' : lang === 'de' ? 'Teenager' : lang === 'fr' ? 'Adolescent' : lang === 'es' ? 'Adolescente' : 'Teen' },
    { key: 'felnott', label: lang === 'hu' ? 'Felnőtt' : lang === 'de' ? 'Erwachsener' : lang === 'fr' ? 'Adulte' : lang === 'es' ? 'Adulto' : 'Adult' },
    { key: 'idosebb', label: lang === 'hu' ? 'Idősebb' : lang === 'de' ? 'Senior' : lang === 'fr' ? 'Senior' : lang === 'es' ? 'Mayor' : 'Senior' },
  ];
  const focusModes = [
    { key: 'altalanos', label: lang === 'hu' ? 'Általános' : lang === 'de' ? 'Allgemein' : lang === 'fr' ? 'Général' : lang === 'es' ? 'General' : 'General' },
    { key: 'munka', label: lang === 'hu' ? 'Munka' : lang === 'de' ? 'Arbeit' : lang === 'fr' ? 'Travail' : lang === 'es' ? 'Trabajo' : 'Work' },
    { key: 'tanulas', label: lang === 'hu' ? 'Tanulás' : lang === 'de' ? 'Lernen' : lang === 'fr' ? 'Apprentissage' : lang === 'es' ? 'Aprendizaje' : 'Learning' },
    { key: 'relax', label: 'Relax' },
  ];

  const [settings, setSettings] = useState({
    ai_name: 'Alexa',
    personality: 'kedves',
    age_group: 'felnott',
    interests: defaultInterests,
    focus_mode: 'altalanos',
    learning_memory: true,
    web_search: true,
    stock_analysis: true,
    auto_market: true,
    preferred_languages: ['hu', 'en'],
    formal_tone: false,
  });
  const [settingsId, setSettingsId] = useState(null);
  const [interestInput, setInterestInput] = useState('');
  const [themeMode, setThemeMode] = useState(() => getThemeMode());
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsPrefs, setTtsPrefs] = useState(() => getVoicePreferences());
  const [saved, setSaved] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [desktopAi, setDesktopAi] = useState({ aiProvider: 'openrouter', aiModel: 'openrouter/auto', hasOpenRouterKey: false });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [aiModels, setAiModels] = useState([]);
  const [aiStatus, setAiStatus] = useState('');

  const [deleting, setDeleting] = useState(false);
  const [userChannelPrefs, setUserChannelPrefs] = useState([]);
  const [behaviorProfile, setBehaviorProfile] = useState({
    directness: 'balanced',
    vocabulary: 'natural',
    casual_mode: false,
    allow_swearing: false,
    command_languages: ['hu', 'en']
  });

  const deleteAccount = async () => {
    setDeleting(true);
    await jarvis.functions.invoke('deleteAccount', { mode: 'execute', confirm: true });
    await jarvis.auth.logout();
  };

  const [notifStatus, setNotifStatus] = useState(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  });

  useEffect(() => {
    jarvis.auth.me().then((currentUser) => {
      if (!currentUser?.email) return [];
      return jarvis.entities.UserSettings.filter({ created_by: currentUser.email });
    }).then(list => {
      if (list?.length > 0) {
        setSettings(list[0]);
        setSettingsId(list[0].id);
      }
    });
    jarvis.auth.me().then((me) => {
      setUserChannelPrefs(me?.enabled_channels || []);
      setBehaviorProfile({
        directness: me?.assistant_directness || 'balanced',
        vocabulary: me?.assistant_vocabulary || 'natural',
        casual_mode: !!me?.assistant_casual_mode,
        allow_swearing: !!me?.assistant_allow_swearing,
        command_languages: me?.command_languages || ['hu', 'en']
      });
    });
    setThemeMode(getThemeMode());
    const unsubTheme = subscribeTheme(({ mode }) => setThemeMode(mode));
    const loadVoices = () => setTtsVoices((window.speechSynthesis?.getVoices?.() || []).filter(v => /^hu[-_]/i.test(v.lang || '')));
    loadVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
    // Cleanup is handled by the component-level effect return below.
    window.jarvisDesktop?.getSettings?.().then((desktop) => {
      if (desktop) setDesktopAi(desktop);
      if (desktop?.hasOpenRouterKey) {
        window.jarvisDesktop?.listModels?.().then(setAiModels).catch(() => {});
      }
    }).catch(() => {});
    return () => {
      unsubTheme?.();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, []);

  const saveDesktopAi = async () => {
    if (!window.jarvisDesktop?.saveSettings) { setAiStatus('Desktop API unavailable'); return; }
    setAiStatus(lang === 'hu' ? 'Mentés...' : 'Saving...');
    try {
      const next = await window.jarvisDesktop.saveSettings({
        aiProvider: 'openrouter',
        aiModel: desktopAi.aiModel || 'openrouter/auto',
        ...(apiKeyInput.trim() ? { openRouterApiKey: apiKeyInput.trim() } : {})
      });
      setDesktopAi(next);
      setApiKeyInput('');
      const list = await window.jarvisDesktop.listModels().catch(() => []);
      setAiModels(list);
      setAiStatus(lang === 'hu' ? '✓ AI beállítások mentve' : '✓ AI settings saved');
    } catch (e) { setAiStatus(`Error: ${e?.message || e}`); }
  };

  const changeTheme = (mode) => {
    applyThemeMode(mode);
    setThemeMode(mode);
  };

  const changeTts = (updates) => {
    const next = { ...ttsPrefs, ...updates };
    setTtsPrefs(next);
    saveVoicePreferences(next);
  };

  // Csak helyi state frissítés – mentés csak a gombbal
  const update = (updates) => {
    setSettings(s => ({ ...s, ...updates }));
    setSaved(false);
  };

  const saveAll = async () => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) return;
    if (settingsId) {
      await updateOwnedEntity(jarvis.entities.UserSettings, settingsId, settings);
    } else {
      const created = await jarvis.entities.UserSettings.create({ ...settings, created_by: currentUser.email });
      setSettingsId(created.id);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Régi save alias – azonnali mentés nélkül, csak state update
  const save = (updates) => update(updates);

  const addInterest = (e) => {
    if (e.key === 'Enter' && interestInput.trim()) {
      const updated = [...(settings.interests || []), interestInput.trim()];
      save({ interests: updated });
      setInterestInput('');
    }
  };

  const removeInterest = (interest) => {
    const updated = (settings.interests || []).filter(i => i !== interest);
    save({ interests: updated });
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteStatus(null);
    await jarvis.users.inviteUser(inviteEmail.trim(), 'user');
    setInviteStatus('sent');
    setInviteEmail('');
    setInviting(false);
    setTimeout(() => setInviteStatus(null), 3000);
  };

  const toggleChannelPreference = async (channel) => {
    const next = userChannelPrefs.includes(channel)
      ? userChannelPrefs.filter((item) => item !== channel)
      : [...userChannelPrefs, channel];

    setUserChannelPrefs(next);
    await jarvis.auth.updateMe({ enabled_channels: next });
  };

  const saveBehaviorProfile = async (updates) => {
    const next = { ...behaviorProfile, ...updates };
    setBehaviorProfile(next);
    await jarvis.auth.updateMe({
      assistant_directness: next.directness,
      assistant_vocabulary: next.vocabulary,
      assistant_casual_mode: next.casual_mode,
      assistant_allow_swearing: next.allow_swearing,
      command_languages: next.command_languages,
    });
  };

  const toggleCommandLanguage = async (code) => {
    const nextLanguages = behaviorProfile.command_languages.includes(code)
      ? behaviorProfile.command_languages.filter((item) => item !== code)
      : [...behaviorProfile.command_languages, code];
    await saveBehaviorProfile({ command_languages: nextLanguages.length ? nextLanguages : ['hu'] });
  };

  // Request notification permission
  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      setNotifStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setNotifStatus('denied');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);
    if (permission === 'granted') {
      new Notification(t('notif_enabled'), {
        body: t('notif_desc'),
        icon: '/favicon.ico'
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto jarvis-scroll">
      <div className="px-4 md:px-8 lg:px-10 pt-5 md:pt-8 pb-10 max-w-[1500px] mx-auto">
        <SettingsPageHeader title={t('settings')} saved={saved} onSave={saveAll} t={t} />

        <div className="settings-desktop-grid">
        <div className="bg-card border border-primary/15 rounded-2xl p-4 md:p-5 mb-4 app-surface">
          <h3 className="font-semibold text-foreground mb-1">{lang === 'hu' ? 'AI agy / modellek' : 'AI brain / models'}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {lang === 'hu' ? 'OpenRouteren keresztül a Jarvis az aktuálisan elérhető modelleket tölti be. A kulcs Windows titkosított tárhelyen marad.' : 'Jarvis loads currently available models through OpenRouter. The key stays in Windows encrypted storage.'}
          </p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={desktopAi.hasOpenRouterKey ? '•••••••• (key saved)' : 'OpenRouter API key'}
            className="w-full mb-3 px-3 py-2 rounded-xl bg-background border border-border text-sm"
          />
          <select
            value={desktopAi.aiModel || 'openrouter/auto'}
            onChange={(e) => setDesktopAi(d => ({ ...d, aiModel:e.target.value }))}
            className="w-full mb-3 px-3 py-2 rounded-xl bg-background border border-border text-sm"
          >
            <option value="openrouter/auto">AUTO – Jarvis / OpenRouter</option>
            {aiModels.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
          <div className="flex items-center gap-3">
            <button onClick={saveDesktopAi} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              {lang === 'hu' ? 'AI beállítások mentése' : 'Save AI settings'}
            </button>
            {aiStatus && <span className="text-xs text-muted-foreground">{aiStatus}</span>}
          </div>
        </div>

        <ThemeToggleCard themeMode={themeMode} onChange={changeTheme} t={t} />

        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <h3 className="font-semibold text-foreground mb-1">Beszédhang</h3>
          <p className="text-xs text-muted-foreground mb-3">Ez külön beállítás az AI-modelltől. A Jarvis a Windows által elérhető magyar hangokat használja.</p>
          <select value={ttsPrefs.name} onChange={(e)=>changeTts({name:e.target.value})} className="w-full mb-3 px-3 py-2 rounded-xl bg-background border border-border text-sm">
            <option value="">Automatikus – legjobb elérhető magyar hang</option>
            {ttsVoices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Sebesség
              <input type="range" min="0.8" max="1.15" step="0.01" value={ttsPrefs.rate} onChange={(e)=>changeTts({rate:Number(e.target.value)})} className="w-full" />
            </label>
            <label className="text-xs text-muted-foreground">Hangmagasság
              <input type="range" min="0.85" max="1.2" step="0.01" value={ttsPrefs.pitch} onChange={(e)=>changeTts({pitch:Number(e.target.value)})} className="w-full" />
            </label>
          </div>
        </div>

        <PersonalizationCard
          settings={settings}
          personalities={personalities}
          ageGroups={ageGroups}
          interestInput={interestInput}
          setInterestInput={setInterestInput}
          onUpdate={update}
          onSave={save}
          onAddInterest={addInterest}
          onRemoveInterest={removeInterest}
          t={t}
        />

        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">{t('formal_tone')}</p>
              <p className="text-xs text-muted-foreground">{t('formal_tone_desc')}</p>
            </div>
            <Toggle checked={!!settings.formal_tone} onChange={val => save({ formal_tone: val })} />
          </div>
        </div>

        <FocusModeCard focusModes={focusModes} activeMode={settings.focus_mode} onSelect={save} t={t} />

        <AiBehaviorCard
          settings={settings}
          labels={[
            { key: 'learning_memory', label: lang === 'hu' ? 'Tanuló memória' : lang === 'es' ? 'Memoria de aprendizaje' : lang === 'de' ? 'Lerngedächtnis' : lang === 'fr' ? 'Mémoire d\'apprentissage' : 'Learning memory' },
            { key: 'web_search', label: lang === 'hu' ? 'Webes keresés' : lang === 'es' ? 'Búsqueda web' : lang === 'de' ? 'Websuche' : lang === 'fr' ? 'Recherche web' : 'Web search' },
            { key: 'stock_analysis', label: lang === 'hu' ? 'Tőzsdei elemzés' : lang === 'es' ? 'Análisis bursátil' : lang === 'de' ? 'Börsenanalyse' : lang === 'fr' ? 'Analyse boursière' : 'Stock analysis' },
            { key: 'auto_market', label: lang === 'hu' ? 'Autópiac' : lang === 'es' ? 'Mercado de autos' : lang === 'de' ? 'Automarkt' : lang === 'fr' ? 'Marché auto' : 'Auto market' },
          ]}
          Toggle={Toggle}
          onSave={save}
          t={t}
        />

        <NotificationsCard notifStatus={notifStatus} onRequest={requestNotifications} lang={lang} t={t} />

        <BehaviorProfileSection
          behaviorProfile={behaviorProfile}
          onSaveBehaviorProfile={saveBehaviorProfile}
          onToggleCommandLanguage={toggleCommandLanguage}
        />

        <PersonalServicesCard lang={lang} userChannelPrefs={userChannelPrefs} onToggle={toggleChannelPreference} />

        <InviteUserCard lang={lang} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviting={inviting} inviteStatus={inviteStatus} onInvite={sendInvite} t={t} />

        <SecurityCard Toggle={Toggle} t={t} />

        <UpdateCard />

        <CloudSyncCard t={t} />

        <SettingsMenuItems t={t} />

        <DeleteAccountCard lang={lang} onOpen={() => setShowDeleteConfirm(true)} t={t} />
        </div>
      </div>

      {/* Delete confirmation sheet */}
      <Sheet open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-red-400">{t('delete_confirm_title')}</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {lang === 'hu'
              ? 'Biztosan törölni szeretnéd a fiókodat? Ez a művelet visszafordíthatatlan és minden adatod elvész.'
              : 'Are you sure you want to delete your account? This action cannot be undone and all your data will be lost.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-2xl bg-secondary text-foreground font-semibold text-sm"
            >
              {t('cancel')}
            </button>
            <button
              onClick={deleteAccount}
              disabled={deleting}
              className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {deleting ? t('deleting') : t('confirm_delete_btn')}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}