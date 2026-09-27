import { useEffect, useState } from 'react';
import { Lock, Cloud, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';

export function SecurityCard({ t }) {
  const [pinStatus, setPinStatus] = useState({ configured:false });
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.jarvisDesktop?.getOwnerPinStatus?.().then(setPinStatus).catch(() => {});
  }, []);

  const savePin = async () => {
    setMessage('');
    try {
      const next = await window.jarvisDesktop?.setOwnerPin?.({ currentPin, newPin });
      setPinStatus(next || { configured:true });
      setCurrentPin('');
      setNewPin('');
      setMessage('✓ Owner PIN biztonságosan beállítva.');
    } catch (error) {
      setMessage('Hiba: ' + (error?.message || error));
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={16} className="text-yellow-500" />
        <h2 className="text-sm font-semibold text-foreground">{t('security_title')}</h2>
      </div>

      <div className="flex items-start gap-3 mb-4">
        <CheckCircle2 size={18} className="text-green-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-foreground">{t('security_enc')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Windows alatt az API-kulcsok Electron safeStorage/DPAPI védelemmel vannak tárolva. Ez a védelem nem kapcsolható ki.
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={15} className="text-primary" />
          <p className="text-sm font-medium text-foreground">Owner override PIN</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          A PIN verifikátora helyben, véletlen sóval és scrypt hash-sel készül; nincs PIN vagy statikus PIN-hash a forráskódban.
        </p>
        {pinStatus.configured && (
          <input
            type="password"
            inputMode="numeric"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="Jelenlegi PIN"
            className="w-full mb-2 px-3 py-2 rounded-xl bg-background border border-border text-sm"
          />
        )}
        <input
          type="password"
          inputMode="numeric"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
          placeholder={pinStatus.configured ? 'Új PIN (4–12 számjegy)' : 'PIN beállítása (4–12 számjegy)'}
          className="w-full mb-2 px-3 py-2 rounded-xl bg-background border border-border text-sm"
        />
        <button
          type="button"
          onClick={savePin}
          disabled={newPin.length < 4 || (pinStatus.configured && currentPin.length < 4)}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
        >
          {pinStatus.configured ? 'PIN cseréje' : 'PIN beállítása'}
        </button>
        {message && <p className="text-xs text-muted-foreground mt-2 break-words">{message}</p>}
      </div>
    </div>
  );
}

export function CloudSyncCard({ t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Cloud size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-foreground">{t('cloud_sync_title')}</h2>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
        <p>A felhőszinkron nincs engedélyezve ebben a local-first Windows buildben. A funkció addig nem jelenik meg aktívként, amíg nincs valódi backend és hitelesítés.</p>
      </div>
    </div>
  );
}
