import { AlertTriangle, Brain, Car, CheckCircle2, Database, FileText, Mail, MapPin, ShieldCheck, Smartphone } from 'lucide-react';

const DATA_CATEGORIES = [
  {
    icon: Database,
    title: 'Fiók- és profiladatok',
    text: 'Az app a bejelentkezéshez szükséges alapadatokat, például e-mail címet, nevet és felhasználói beállításokat kezelhet.',
  },
  {
    icon: Brain,
    title: 'AI asszisztens és beszélgetések',
    text: 'A chat, hangutasítások, feltöltött képek/fájlok és AI válaszok az asszisztens működéséhez és előzmények megjelenítéséhez kerülhetnek feldolgozásra.',
  },
  {
    icon: Car,
    title: 'Jármű és OBD2 adatok',
    text: 'VIN, járműprofil, diagnosztikai kódok, szenzorértékek, fogyasztási és szerviz jellegű adatok tárolhatók a járműfunkciókhoz.',
  },
  {
    icon: MapPin,
    title: 'Helyadatok',
    text: 'Helyalapú funkciók esetén az app helyadatokat használhat útvonalakhoz, mentett helyekhez és kontextus alapú emlékeztetőkhöz.',
  },
  {
    icon: Smartphone,
    title: 'Eszköz- és használati adatok',
    text: 'Technikai naplók, hibainformációk és teljesítményadatok kezelhetők a stabilitás, biztonság és hibajavítás érdekében.',
  },
];

const PRIVACY_SECTIONS = [
  {
    title: '1. Adatkezelő és hatály',
    body: 'Ez az oldal tájékoztatja a felhasználókat arról, hogy az alkalmazás milyen adatokat kezel, milyen célból, és milyen jogok illetik meg őket. Az irányelvek az app webes, Android és iOS használatára is vonatkoznak.',
  },
  {
    title: '2. Milyen adatokat kezelünk',
    body: 'Az app csak a működéshez szükséges adatokat kezeli: fiókadatokat, beállításokat, beszélgetési előzményeket, hang- és fájlfeltöltési adatokat, járműdiagnosztikai adatokat, helyadatokat, emlékeztetőket, pénzügyi bejegyzéseket és technikai naplókat.',
  },
  {
    title: '3. Az adatkezelés célja',
    body: 'Az adatokat az app funkcióinak biztosítására, személyre szabott asszisztensi válaszokra, diagnosztikai és emlékeztető funkciókra, biztonságra, hibakeresésre, szinkronizálásra és felhasználói támogatásra használjuk.',
  },
  {
    title: '4. AI és automatizált feldolgozás',
    body: 'Az AI funkciók a felhasználó által megadott szövegeket, fájlokat, képeket vagy hangból készült átiratokat feldolgozhatják válaszok, összefoglalók és javaslatok készítéséhez. Az AI válaszok tájékoztató jellegűek, nem minősülnek szakmai, jogi, orvosi vagy műszaki garanciának.',
  },
  {
    title: '5. Adatmegosztás és szolgáltatók',
    body: 'Az adatok feldolgozásához az app biztonságos felhő-, hitelesítési, fájltárolási, AI-, e-mail- és platformszolgáltatókat használhat. Az adatokat nem értékesítjük harmadik félnek.',
  },
  {
    title: '6. Helyadatok, mikrofon, kamera és fájlok',
    body: 'A helyadatok, mikrofon, kamera, Bluetooth/OBD2 és fájlfeltöltés csak akkor használható, ha a felhasználó engedélyezi. Az engedélyek bármikor visszavonhatók az eszköz beállításaiban.',
  },
  {
    title: '7. Adatmegőrzés és törlés',
    body: 'Az adatokat addig őrizzük meg, amíg az app működéséhez, jogi kötelezettséghez vagy felhasználói előzményekhez szükséges. A felhasználó kérheti adatai exportját vagy törlését, ahol ezt a funkció az app biztosítja.',
  },
  {
    title: '8. Felhasználói jogok',
    body: 'A felhasználó jogosult hozzáférést, helyesbítést, törlést, korlátozást, hordozhatóságot vagy tiltakozást kérni a rá vonatkozó személyes adatokkal kapcsolatban, a vonatkozó adatvédelmi jogszabályok szerint.',
  },
  {
    title: '9. Gyermekek adatvédelme',
    body: 'Az app nem kifejezetten gyermekek számára készült. Kiskorú felhasználó esetén szülői vagy törvényes képviselői felügyelet szükséges.',
  },
  {
    title: '10. Kapcsolat',
    body: 'Adatvédelmi vagy fióktörlési kérdés esetén használd az app hivatalos támogatási vagy kapcsolatfelvételi csatornáját.',
  },
];

const TERMS_SECTIONS = [
  {
    title: '1. Az alkalmazás használata',
    body: 'Az app személyes asszisztensi, produktivitási, járműdiagnosztikai, pénzügyi, emlékeztető és egyéb digitális eszközöket biztosít. A felhasználó felelős azért, hogy az appot jogszerűen és biztonságosan használja.',
  },
  {
    title: '2. Nincs szakmai tanácsadás',
    body: 'Az app által adott jogi, pénzügyi, egészségügyi, autódiagnosztikai vagy egyéb válaszok általános tájékoztatásnak minősülnek. Fontos döntések előtt szakemberrel kell egyeztetni.',
  },
  {
    title: '3. Jármű- és OBD2 funkciók',
    body: 'A diagnosztikai és OBD2 funkciók nem helyettesítik a szakszervizt. Vezetés közben az app használata csak biztonságos és jogszerű módon megengedett.',
  },
  {
    title: '4. Felhasználói tartalom',
    body: 'A felhasználó felelős az általa megadott szövegekért, fájlokért, képekért, járműadatokért és egyéb tartalmakért. Tilos jogsértő, veszélyes vagy mások jogait sértő tartalom feltöltése.',
  },
  {
    title: '5. Szolgáltatás elérhetősége',
    body: 'Az app működése függhet internetkapcsolattól, külső szolgáltatóktól, eszközengedélyektől és platformfunkcióktól. Folyamatos hibamentes működés nem garantálható.',
  },
  {
    title: '6. App Store és Google Play megfelelés',
    body: 'Az app használata során a Google Play, az Apple App Store, valamint az adott eszköz és ország vonatkozó szabályai is érvényesek lehetnek.',
  },
  {
    title: '7. Módosítások',
    body: 'Az adatvédelmi irányelvek és felhasználási feltételek időről időre frissülhetnek. A frissített változat az appon belül kerül közzétételre.',
  },
];

function SectionCard({ title, body }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}

export default function PrivacyTerms() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-8 space-y-5">
        <header className="rounded-3xl border border-primary/30 bg-primary/10 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
              <ShieldCheck className="text-primary" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Adatvédelmi irányelvek és Felhasználási feltételek</h1>
              <p className="text-xs text-muted-foreground mt-1">Google Play és App Store publikálási tájékoztató</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3">
            <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-yellow-200">Ez egy appon belüli tájékoztató sablon. Végleges publikálás előtt érdemes jogi/adatvédelmi szakértővel ellenőriztetni.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3">
          {DATA_CATEGORIES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-4 flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Icon size={18} className="text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <p className="text-xs leading-relaxed text-muted-foreground mt-1">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">Adatvédelmi irányelvek</h2>
          </div>
          {PRIVACY_SECTIONS.map((section) => <SectionCard key={section.title} {...section} />)}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">Felhasználási feltételek</h2>
          </div>
          {TERMS_SECTIONS.map((section) => <SectionCard key={section.title} {...section} />)}
        </div>

        <footer className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 flex gap-3">
          <CheckCircle2 size={18} className="text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-300">Publikálási ellenőrzőpont</p>
            <p className="text-xs leading-relaxed text-muted-foreground mt-1">Az oldal lefedi az adatkezelési tájékoztatót, AI feldolgozást, engedélyeket, adattörlést, felhasználói jogokat és alkalmazáshasználati feltételeket.</p>
          </div>
        </footer>

        <div className="rounded-2xl border border-border bg-card p-4 flex gap-3">
          <Mail size={18} className="text-primary shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">Utolsó frissítés: 2026.04.29. Kapcsolat: az app hivatalos támogatási csatornáján keresztül.</p>
        </div>
      </div>
    </div>
  );
}