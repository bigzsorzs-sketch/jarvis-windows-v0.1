import { Droplet, ShieldAlert, FlaskConical } from 'lucide-react';

export default function GlucoSensorConnector() {
  return (
    <div className="bg-card border border-yellow-500/30 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-yellow-500/15 flex items-center justify-center shrink-0">
          <FlaskConical size={20} className="text-yellow-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">CGM szenzor kapcsolat</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
              EXPERIMENTAL
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A közvetlen Libre / Dexcom / Medtronic BLE olvasás jelenleg nincs hitelesítve valós szenzorral.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-2">
        <ShieldAlert size={16} className="text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-yellow-200/90 leading-relaxed">
          A Jarvis nem mutat kitalált vagy nem validált CGM értéket. A közvetlen szenzorcsatlakozás addig le van tiltva,
          amíg dokumentált vagy hivatalos adatút és fizikai hardverteszt nincs mögötte.
        </p>
      </div>

      <button
        type="button"
        disabled
        className="w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 bg-secondary text-muted-foreground border border-border opacity-60 cursor-not-allowed"
      >
        <Droplet size={14} />
        Közvetlen CGM kapcsolat – fejlesztés alatt
      </button>

      <p className="text-[11px] text-muted-foreground">
        A manuális vércukoradatok, importált adatok és a későbbi hivatalos/Nightscout connectorok ettől függetlenül használhatók lesznek.
      </p>
    </div>
  );
}
