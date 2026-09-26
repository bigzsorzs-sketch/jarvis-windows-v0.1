import { ShieldCheck } from 'lucide-react';

export default function EncryptedLocalBackupNotice({ label = 'Titkosított lokális mentés aktív' }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-3">
      <ShieldCheck size={16} className="text-green-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-green-300">{label}</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
          Az érzékenyebb adatok helyi biztonsági másolata AES-GCM titkosítással kerül az eszköz tárhelyére.
        </p>
      </div>
    </div>
  );
}