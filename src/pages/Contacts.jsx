import { useState, useEffect, useRef } from 'react';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import { jarvis } from '@/api/jarvisClient';
import { getVoiceRuntime } from '@/lib/voiceRuntime';
import { UserPlus, Phone, Mail, Search, Trash2, X, Plus, ArrowLeft, Contact, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { deleteOwnedEntity } from '@/lib/ownedEntityHelpers';
import PullToRefresh from '@/components/common/PullToRefresh';

const ConfirmDialog = ({ title, message, onConfirm, onCancel, isOpen }) => {
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card rounded-2xl p-6 max-w-xs mx-auto border border-border">
        <h2 className="text-sm font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-xs text-muted-foreground mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-secondary text-xs font-medium text-foreground">Mégse</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30">Törlés</button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const TX = {
  title:        { hu:'Kapcsolatok', en:'Contacts', de:'Kontakte', fr:'Contacts', es:'Contactos' },
  search:       { hu:'Keresés...', en:'Search...', de:'Suchen...', fr:'Rechercher...', es:'Buscar...' },
  new:          { hu:'Új kapcsolat', en:'New contact', de:'Neuer Kontakt', fr:'Nouveau contact', es:'Nuevo contacto' },
  empty:        { hu:'Nincsenek kapcsolatok', en:'No contacts', de:'Keine Kontakte', fr:'Aucun contact', es:'Sin contactos' },
  name:         { hu:'Név *', en:'Name *', de:'Name *', fr:'Nom *', es:'Nombre *' },
  phone:        { hu:'Telefonszám', en:'Phone number', de:'Telefonnummer', fr:'Téléphone', es:'Teléfono' },
  email:        { hu:'Email', en:'Email', de:'E-Mail', fr:'Email', es:'Email' },
  relation:     { hu:'Kapcsolat típusa (pl. barát)', en:'Relationship (e.g. friend)', de:'Beziehung (z.B. Freund)', fr:'Relation (ex. ami)', es:'Relación (ej. amigo)' },
  address:      { hu:'Cím / címke', en:'Address / location', de:'Adresse / Ort', fr:'Adresse / lieu', es:'Dirección / lugar' },
  notes:        { hu:'Megjegyzés', en:'Notes', de:'Notizen', fr:'Notes', es:'Notas' },
  save:         { hu:'Mentés', en:'Save', de:'Speichern', fr:'Enregistrer', es:'Guardar' },
};
const tx = (lang, key) => TX[key]?.[lang] || TX[key]?.en || key;

export default function Contacts() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const T = (k) => tx(lang, k);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', relationship: '', address: '', notes: '' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [showPhoneOptions, setShowPhoneOptions] = useState(false);
  const [accessingPhone, setAccessingPhone] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [listeningForAccept, setListeningForAccept] = useState(false);
  const [speakerphoneEnabled, setSpeakerphoneEnabled] = useState(false);
  const callRecognitionRef = useRef(null);

  useEffect(() => {
    jarvis.auth.me()
      .then((currentUser) => {
        if (!currentUser?.email) throw new Error('auth_required');
        return jarvis.entities.Contact.filter({ created_by: currentUser.email }, '-created_date');
      })
      .then(setContacts)
      .catch(() => setContacts([]));
  }, []);

  const addContact = async () => {
    if (!form.name.trim()) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) return;
    const created = await jarvis.entities.Contact.create({ ...form, created_by: currentUser.email, last_contacted: new Date().toISOString().split('T')[0] });
    setContacts(prev => [created, ...prev]);
    setForm({ name: '', phone: '', email: '', relationship: '', address: '', notes: '' });
    setShowAdd(false);
  };

  const deleteContact = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const contact = contacts.find((item) => item.id === id);
    if (!currentUser?.email || contact?.created_by !== currentUser.email) return;
    await deleteOwnedEntity(jarvis.entities.Contact, id);
    setContacts(prev => prev.filter(c => c.id !== id));
    setConfirmDelete({ isOpen: false, id: null });
  };

  const handleDeleteClick = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const filtered = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const accessDeviceContacts = async () => {
    setAccessingPhone(true);
    try {
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const deviceContacts = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
        if (deviceContacts && deviceContacts.length > 0) {
          for (const dc of deviceContacts) {
            const name = dc.name?.[0] || 'Ismeretlen';
            const phone = dc.tel?.[0]?.replaceAll(' ', '') || '';
            const email = dc.email?.[0] || '';
            const existing = contacts.some(c => c.phone === phone || (email && c.email === email));
            if (!existing && name) {
              const currentUser = await jarvis.auth.me().catch(() => null);
              if (!currentUser?.email) continue;
              const created = await jarvis.entities.Contact.create({
                name,
                phone,
                email,
                relationship: '',
                notes: '',
                created_by: currentUser.email,
                last_contacted: new Date().toISOString().split('T')[0]
              });
              setContacts(prev => [created, ...prev]);
            }
          }
          setShowPhoneOptions(false);
        }
      }
    } catch (err) {
      console.warn('Telefonkönyv hozzáférés megtagadva vagy nem támogatott:', err);
    }
    setAccessingPhone(false);
  };

  const initiateCall = () => {
    setShowPhoneOptions(false);
  };

  const receiveCall = () => {
    const randomContact = contacts[Math.floor(Math.random() * contacts.length)];
    if (randomContact) {
      const callData = {
        name: randomContact.name,
        phone: randomContact.phone,
        avatar: randomContact.name?.[0]?.toUpperCase()
      };
      setIncomingCall(callData);
      setListeningForAccept(true);
      
      // TTS bejelentés
      const utterance = new SpeechSynthesisUtterance(lang === 'hu' ? `${callData.name} hívja fel. Mondj igent ha fel szeretnéd venni a hívást.` : `${callData.name} is calling. Say yes if you want to answer.`);
      utterance.lang = lang === 'hu' ? 'hu-HU' : 'en-GB';
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
      
      // [DEPRECATED] Voice recognition — keep for now, will migrate to useVoiceRuntime
       setTimeout(() => initCallRecognition(), 1500);
    }
    setShowPhoneOptions(false);
  };

  const initCallRecognition = () => {
    // Use central voice runtime for one-shot transcript capture
    const runtime = getVoiceRuntime();
    const unsubTranscript = runtime.subscribe('transcript', (transcript) => {
      const t = transcript.toLowerCase().trim();
      unsubTranscript(); // one-shot: unsubscribe after first result
      runtime.setHandsFree(false);
      setListeningForAccept(false);
      if (t.includes('igen') || t.includes('felvesze') || t.includes('felveszem')) {
        acceptCall();
      } else {
        declineCall();
      }
    });
    callRecognitionRef.current = { abort: () => { unsubTranscript(); runtime.setHandsFree(false); } };
    runtime.setHandsFree(true);
  };

  const acceptCall = () => {
    callRecognitionRef.current?.abort();
    setListeningForAccept(false);
    setCallActive(true);
    setSpeakerphoneEnabled(true);
    
    // Audio routing - speakerphone mode
    if (navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const audioOutput = devices.find(d => d.kind === 'audiooutput');
        if (audioOutput) {
          console.log('🔊 Speakerphone aktiválva:', audioOutput.label);
        }
      });
    }
    
    // Hangosítás bekapcsolása (full volume + speakerphone)
    const utterance = new SpeechSynthesisUtterance(lang === 'hu' ? `Hívás folyamatban ${incomingCall.name} tel. Hangszóró aktív.` : `Call active with ${incomingCall.name}. Speakerphone on.`);
    utterance.lang = lang === 'hu' ? 'hu-HU' : 'en-GB';
    utterance.volume = 1;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const declineCall = () => {
    callRecognitionRef.current?.abort();
    setListeningForAccept(false);
    setIncomingCall(null);
  };

  const endCall = () => {
    callRecognitionRef.current?.abort();
    setCallActive(false);
    setListeningForAccept(false);
    setSpeakerphoneEnabled(false);
    setIncomingCall(null);
    
    // Hangosítás kikapcsolása
    const utterance = new SpeechSynthesisUtterance(lang === 'hu' ? 'Hívás befejeződött.' : 'Call ended.');
    utterance.lang = lang === 'hu' ? 'hu-HU' : 'en-GB';
    window.speechSynthesis.speak(utterance);
  };

  const contactsTutorial = [
    {
      icon: '👥',
      title: 'Kapcsolatok kezelése',
      description: 'Tárold el fontos emberek elérhetőségeit és jegyzeteit egy helyen.',
      hint: 'Kereshetsz név vagy email alapján',
    },
    {
      icon: '📞',
      title: 'Gyors kapcsolatfelvétel',
      description: 'Egyetlen kattintással hívsz vagy küldhetsz e-mailt.',
      hint: 'A telefonszám vagy email gombra kattintva azonnal felhívhatod',
    },
    {
      icon: '✨',
      title: 'Kezdj el!',
      description: 'Add hozzá az első kontaktot az "Új kapcsolat" gombbal.',
      hint: 'Szervezz emlékeztetőket is a kapcsolatod előzményeiről',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <TutorialOverlay tutorialId="contacts-intro" steps={contactsTutorial} />
      <PullToRefresh onRefresh={async () => {
        const currentUser = await jarvis.auth.me().catch(() => null);
        if (!currentUser?.email) return;
        const refreshed = await jarvis.entities.Contact.filter({ created_by: currentUser.email }, '-created_date');
        setContacts(refreshed);
      }}>
      <div className="px-4 pt-5 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <UserPlus size={18} className="text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{T('title')}</h1>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card rounded-2xl px-4 py-2.5 border border-border mb-4">
          <Search size={15} className="text-muted-foreground" />
          <input className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={T('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setShowAdd(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
            <Plus size={15} /> {T('new')}
          </button>
          <button onClick={() => setShowPhoneOptions(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary text-foreground font-semibold text-sm border border-border hover:bg-muted transition-all">
            <Contact size={15} /> {lang === 'hu' ? 'Telefonkönyv' : 'Phone'}
          </button>
        </div>

        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold text-sm">{c.name?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                {c.relationship && <p className="text-xs text-muted-foreground">{c.relationship}</p>}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-primary mt-1">
                    <Phone size={11} /> {c.phone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Mail size={11} /> {c.email}
                  </a>
                )}
                {c.address && <p className="text-xs text-blue-400 mt-1">📍 {c.address}</p>}
                {c.notes && <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>}
              </div>
              <button onClick={() => handleDeleteClick(c.id)} className="text-muted-foreground/40 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <UserPlus size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{T('empty')}</p>
            </div>
          )}
        </div>
      </div>
      </PullToRefresh>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">{T('new')}</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                {[
                  ['name', T('name')],
                  ['phone', T('phone')],
                  ['email', T('email')],
                  ['relationship', T('relation')],
                  ['address', T('address')],
                  ['notes', T('notes')],
                ].map(([key, placeholder]) => (
                  <input key={key} className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                ))}
                <button onClick={addContact} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">{T('save')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title={lang === 'hu' ? 'Kontakt törlése' : 'Delete contact'}
        message={lang === 'hu' ? 'Biztosan törölni szeretnéd ezt a kontaktot?' : 'Are you sure you want to delete this contact?'}
        onConfirm={() => deleteContact(confirmDelete.id)}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null })}
      />

      <AnimatePresence>
        {showPhoneOptions && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">{lang === 'hu' ? 'Telefonkezelés' : 'Phone options'}</h2>
                <button onClick={() => setShowPhoneOptions(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <button 
                  onClick={accessDeviceContacts}
                  disabled={accessingPhone}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/10 border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  <Contact size={16} /> {accessingPhone ? (lang === 'hu' ? 'Betöltés...' : 'Loading...') : (lang === 'hu' ? 'Telefonkönyv importálása' : 'Import Phone Contacts')}
                </button>
                <button 
                  onClick={initiateCall}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400 font-semibold text-sm hover:bg-green-500/20 transition-all"
                >
                  <PhoneOutgoing size={16} /> {lang === 'hu' ? 'Hívás indítása' : 'Make Call'}
                </button>
                <button 
                  onClick={receiveCall}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 font-semibold text-sm hover:bg-blue-500/20 transition-all"
                >
                  <PhoneIncoming size={16} /> {lang === 'hu' ? 'Hívás fogadása' : 'Receive Call'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {incomingCall && !callActive && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
            <motion.div className="text-center space-y-6 px-6">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse">
                <span className="text-4xl font-bold text-primary">{incomingCall.avatar}</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{incomingCall.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{incomingCall.phone}</p>
                <p className={`text-xs mt-3 font-semibold ${listeningForAccept ? 'text-green-400 animate-pulse' : 'text-muted-foreground'}`}>
                  {listeningForAccept ? '🎤 Hallgatok...' : (lang === 'hu' ? 'Hívás érkezik...' : 'Incoming call...')}
                </p>
              </div>
              <div className="flex gap-4 justify-center pt-4">
                <button 
                  onClick={declineCall}
                  disabled={listeningForAccept}
                  className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                >
                  <Phone size={24} className="rotate-180" />
                </button>
                <button 
                  onClick={acceptCall}
                  disabled={listeningForAccept}
                  className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400 hover:bg-green-500/30 transition-all disabled:opacity-50"
                >
                  <Phone size={24} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {callActive && incomingCall && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
            <motion.div className="text-center space-y-6 px-6">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <span className="text-4xl font-bold text-green-400">{incomingCall.avatar}</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{incomingCall.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{incomingCall.phone}</p>
                <p className="text-lg text-green-400 font-semibold mt-4">{lang === 'hu' ? 'Hívás folyamatban...' : 'Call active...'}</p>
                {speakerphoneEnabled && (
                  <p className="text-sm text-yellow-400 mt-2 flex items-center justify-center gap-1">
                    🔊 {lang === 'hu' ? 'Hangszóró aktív' : 'Speakerphone ON'}
                  </p>
                )}
              </div>
              <button 
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-all mx-auto"
              >
                <Phone size={24} className="rotate-180" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}