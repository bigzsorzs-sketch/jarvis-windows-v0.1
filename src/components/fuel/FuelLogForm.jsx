import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { localDateKey } from '@/lib/localDate';
import { useLang } from '@/lib/i18n';
import { validateFuelLog } from '@/lib/fuelLogValidation';

export default function FuelLogForm({ vehicles, onSubmit, saving }) {
  const { t } = useLang();
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [form, setForm] = useState({
    vehicle_id: vehicles?.[0]?.id || '',
    date: localDateKey(),
    liters: '',
    total_cost: '',
    distance_km: '',
    odometer: '',
    fuel_type: 'benzin',
    station: '',
    notes: '',
  });

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current || saving) return;
    submitting.current = true;
    setSubmitError('');
    try {
      await onSubmit(validateFuelLog(form));
      setForm((prev) => ({ ...prev, liters:'', total_cost:'', distance_km:'', odometer:'', station:'', notes:'' }));
    } catch (error) {
      setSubmitError(error?.message?.startsWith('INVALID_FUEL_') ? 'fuel_invalid_input' : 'fuel_save_error');
    } finally { submitting.current = false; }
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t('fuel_new_log')}</h2>
        <p className="text-xs text-muted-foreground">{t('fuel_form_hint')}</p>
      </div>

      {vehicles.length > 0 && (
        <select value={form.vehicle_id} onChange={(e) => update('vehicle_id', e.target.value)} className="input-field">
          <option value="">{t('fuel_without_vehicle')}</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} ({vehicle.year})</option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input className="input-field" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />
        <select className="input-field" value={form.fuel_type} onChange={(e) => update('fuel_type', e.target.value)}>
          <option value="benzin">{t('fuel_petrol')}</option>
          <option value="dizel">{t('fuel_diesel')}</option>
          <option value="hibrid">{t('fuel_hybrid')}</option>
          <option value="egyeb">{t('fuel_other')}</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input className="input-field" type="number" step="0.01" min="0.01" placeholder={t('fuel_liters')} value={form.liters} onChange={(e) => update('liters', e.target.value)} required />
        <input className="input-field" type="number" step="0.01" min="0" placeholder={t('fuel_cost')} value={form.total_cost} onChange={(e) => update('total_cost', e.target.value)} required />
        <input className="input-field" type="number" step="0.1" min="1" placeholder={t('fuel_distance')} value={form.distance_km} onChange={(e) => update('distance_km', e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input className="input-field" type="number" step="1" min="0" placeholder={t('fuel_odometer')} value={form.odometer} onChange={(e) => update('odometer', e.target.value)} />
        <input className="input-field" placeholder={t('fuel_station')} value={form.station} onChange={(e) => update('station', e.target.value)} />
      </div>

      {submitError && <p role="alert" className="text-xs text-red-400">{t(submitError)}</p>}
      <button disabled={saving} className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        <Plus size={16} /> {saving ? t('saving') : t('fuel_save')}
      </button>
    </form>
  );
}
