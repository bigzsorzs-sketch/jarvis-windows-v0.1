import { ShieldCheck, Store, WifiOff, DatabaseBackup } from 'lucide-react';
import ReleaseChecklistSection from '@/components/stability/ReleaseChecklistSection';
import { hasEncryptedLocalBackup } from '@/lib/encryptedLocalBackup';

const CHECKLIST_SECTIONS = [
  {
    title: 'Adatbiztonság és Store megfelelés',
    items: [
      { title: 'Adatvédelmi oldal elérhető', description: 'Az app tartalmazza az adatkezelési és felhasználási feltételek oldalt.', status: 'ready' },
      { title: 'Jelszavas hordozható mentés', description: 'A System Center AES-256-GCM + PBKDF2 alapú .jarvisbackup mentést és visszaállítást biztosít.', status: 'ready' },
      { title: 'Jogosultságok magyarázata', description: 'Mikrofon, hely, értesítés és járműdiagnosztika esetén legyen egyértelmű felhasználói magyarázat.', status: 'review' },
    ],
  },
  {
    title: 'Stabilitási tesztek',
    items: [
      { title: 'Fő oldalak átnézése', description: 'Főoldal, Chat, Eszközök, Beállítások, Autódiagnosztika, OBD2 és Live Assistant kézi végigtesztelése.', status: 'manual' },
      { title: 'Offline és lassú hálózat teszt', description: 'Ellenőrizd, hogy az app érthető üzeneteket ad, ha nincs internet vagy lassú a kapcsolat.', status: 'manual' },
      { title: 'Hang és mikrofon teszt', description: 'Mikrofon engedélyezve, tiltva és újrapróbálás esetén is stabilan kell működnie.', status: 'manual' },
      { title: 'OBD2 hibakezelés', description: 'Natív USB/COM, Bluetooth Classic, BLE és Wi-Fi transport build-verifikálva; fizikai adapteres smoke test szükséges.', status: 'review' },
    ],
  },
  {
    title: 'Publikálás előtti ellenőrzés',
    items: [
      { title: 'Data Safety válaszok egyezése', description: 'A Store-ban megadott adatgyűjtési válaszok egyezzenek az app valós működésével.', status: 'review' },
      { title: 'Teszt adatbázis tisztasága', description: 'Publikálás előtt ne maradjon félkész tesztadat vagy hibás mintaadat.', status: 'manual' },
      { title: 'Visszaállítási próba', description: 'Ellenőrizd, hogy adatvesztés vagy törlés után az app kezelhető állapotban marad.', status: 'manual' },
    ],
  },
];

export default function ReleaseChecklist() {
  const hasDiagnosticBackup = hasEncryptedLocalBackup('diagnostic-history');
  const hasMemoryBackup = hasEncryptedLocalBackup('memory-notes');

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6 space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_45%)]" />
          <div className="relative flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <ShieldCheck size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Release checklist</p>
              <h1 className="text-xl font-bold text-foreground mt-1">Stabilitás és Store felkészítés</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Egy gyors, publikálás előtti ellenőrző lista az app stabilitásához, adatbiztonságához és Data Safety megfeleléséhez.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card border border-border p-3 text-center">
            <Store size={17} className="mx-auto text-primary mb-1" />
            <p className="text-[10px] text-muted-foreground">Store</p>
            <p className="text-xs font-semibold text-foreground">Checklist</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-3 text-center">
            <DatabaseBackup size={17} className="mx-auto text-green-400 mb-1" />
            <p className="text-[10px] text-muted-foreground">Backup</p>
            <p className="text-xs font-semibold text-foreground">{hasDiagnosticBackup || hasMemoryBackup ? 'Aktív' : 'Kész'}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-3 text-center">
            <WifiOff size={17} className="mx-auto text-blue-400 mb-1" />
            <p className="text-[10px] text-muted-foreground">Offline</p>
            <p className="text-xs font-semibold text-foreground">Teszteld</p>
          </div>
        </div>

        {CHECKLIST_SECTIONS.map((section) => (
          <ReleaseChecklistSection key={section.title} {...section} />
        ))}
      </div>
    </div>
  );
}