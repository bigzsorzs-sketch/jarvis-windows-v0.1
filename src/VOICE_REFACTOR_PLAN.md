# Voice Runtime Refaktor — Klíringterv

## Célkitűzés
Centralizálni a szétszórt voice logikát egy singleton `voiceRuntime`-ba, amely eltávolítja az állapot-duplikációt és a bugokat.

## Új Fájlok (Létrehozva)
1. **`lib/voiceRuntime.js`** — Singleton voice orchestrator
   - SpeechRecognition lifecycle management
   - Watchdog, restart, queue coordination
   - State machine (handsFree, isListening, isSpeaking, isOnline, degradedMode)
   - Event system (subscribe/emit)

2. **`hooks/useVoiceRuntime.js`** — React hook az aktuális státushoz
   - State + lastTranscript + lastError
   - toggleHandsFree(), speakText(), clearError()
   - Automatikus unsubscribe cleanup

3. **`lib/voiceCommandExecutor.js`** — Intent parser + executor
   - parseTranscript() → intent
   - execute(intent, callbacks)
   - Decoupled: nincs saját recognition

## Integrációs Lépések (Todo)

### 1. `pages/Chat.jsx` Refactor
**Jelenleg:**  
- 200+ sor speech logika (buildRecognition, watchdog, restart, handlers)
- Saját state refs (recognitionRef, watchdogRef, handsFreeRef, stb.)
- Duplikációs: onresult, onend, onerror kezelés

**Csere:**
```jsx
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';

export default function Chat() {
  const voice = useVoiceRuntime();  // Helyettesíti ~150+ sornyit
  const { lang, t } = useLang();
  const [messages, setMessages] = useState([]);
  // ... többi state
  
  // Transcript kezelés:
  useEffect(() => {
    const unsub = voice.runtime.subscribe('transcript', async (text) => {
      analyzeMoodAsync(text, (mood) => setUserMood(mood));
      await sendMessage(text);
    });
    return unsub;
  }, []);
  
  // Hands-free toggle:
  const handleToggleHandsFree = () => {
    voice.toggleHandsFree();
  };
  
  // TTS:
  const handleSpeakReply = (text) => {
    voice.speakText(text, detectedLang);
  };
  
  // Render: handsFree, isListening stb. mind voice.state-ból
  <ChatHeader handsFree={voice.state.handsFree} onToggleHandsFree={handleToggleHandsFree} />
```

**Törlendő Sorok:** 
- buildRecognition() — 70+ sor
- safeStartRecognition, scheduleRestart — 40+ sor
- watchdog init — 15+ sor
- TTS logic — 20+ sor
- Network monitoring — (marad, de már voiceRuntime kezel)
- Self-healing callback — (marad, de már voiceRuntime kezel)

**Menteni:** 
- sendMessage() — továbbra is Chat-ban marad, csak transzcript-inputtal hívódik
- handleVoiceCall() — Chat-ra specifikus, marad
- confirmAndExecute() — marad

---

### 2. `components/voice/GlobalVoiceButton.jsx` Refactor
**Jelenleg:** Saját SpeechRecognition-t épít

**Csere:**
```jsx
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';

export default function GlobalVoiceButton() {
  const voice = useVoiceRuntime();
  
  return (
    <button 
      onClick={() => voice.toggleHandsFree()}
      className={voice.state.handsFree ? 'active' : ''}
    >
      {voice.state.isListening && <span className="pulse">🎤 Hallgat</span>}
      {voice.state.isSpeaking && <span>🔊 Beszél</span>}
      {!voice.state.handsFree && <span>🎙️</span>}
    </button>
  );
}
```

**Törlendő:** 150+ sor saját speech engine

---

### 3. `components/voice/GlobalVoiceControl.jsx`
**Hasonló:** Szinte teljes újraírás `useVoiceRuntime` hook-kal

---

### 4. `components/voice/VoiceCommandEngine.jsx`
**Jelenleg:** parseCommand() saját, complex logika

**Csere:**
```jsx
import { VoiceCommandExecutor } from '@/lib/voiceCommandExecutor';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';

export function VoiceCommandEngine({ context }) {
  const voice = useVoiceRuntime();
  const executor = new VoiceCommandExecutor(context);
  
  useEffect(() => {
    const unsub = voice.runtime.subscribe('transcript', async (text) => {
      const intent = executor.parseTranscript(text);
      if (intent.requires_confirmation) {
        // Show confirm modal
      } else {
        await executor.execute(intent, {
          onSuccess: (msg) => console.log(msg),
          onError: (err) => console.error(err),
        });
      }
    });
    return unsub;
  }, [voice]);
}
```

---

## Fájlok Törlésre Jelölve
- `lib/voiceCommandParser.js` — nem szükséges, voiceCommandExecutor veszi át
- `components/voice/VoiceCommandEngine.jsx` egyszerűsödik (opcionális: lehet hagyni, csak refaktor)

---

## Előnyök

| Probléma | Megoldás |
|----------|----------|
| Duplikált recognition logic (10+ helyen) | 1 singleton voiceRuntime |
| State drift (isListening, isSpeaking, stb.) | Centralizált VoiceRuntimeState |
| Watchdog/restart/queue chaos | Koordináltan voiceRuntime-ban |
| Memory leak (refs, listeners) | Explicit unsub + singleton cleanup |
| Tesztelhetőség | Mock voiceRuntime könnyű |
| UI Update lag | Event-based, nem polling |

---

## Implementációs Sorrend

1. ✅ Létrehozás: `voiceRuntime.js`, `useVoiceRuntime.js`, `voiceCommandExecutor.js`
2. ⏳ **Chat.jsx refactor** (600 → 300 sor, much cleaner)
3. ⏳ GlobalVoiceButton refactor
4. ⏳ GlobalVoiceControl refactor
5. ⏳ VoiceCommandEngine refactor
6. ⏳ Cleanup: törlendő fájlok eltávolítása

---

## Teszt Checklist
- [ ] Hands-free toggle működik
- [ ] SpeechRecognition elindul/leáll
- [ ] Watchdog restarts automatikusan
- [ ] TTS conflict kezelés (stop recognition during speak)
- [ ] Network offline handling
- [ ] Degraded mode (TTS kikapcs, recognition csak text)
- [ ] Memory cleanup (component unmount)
- [ ] Mood analysis aszinkron (nincs lag)
- [ ] Command parsing + execution flow