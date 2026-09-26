import { useState } from 'react';
import { Plus } from 'lucide-react';

export default function FuelLogForm({ vehicles, onSubmit, saving }) {
  const [form, setForm] = useState({
    vehicle_id: vehicles?.[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    liters: '',
    total_cost: '',
    distance_km: '',
    odometer: '',
    fuel_type: 'benzin',
    station: '',
    notes: '',
  });

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      liters: Number(form.liters),
      total_cost: Number(form.total_cost),
      distance_km: Number(form.distance_km),
      odometer: form.odometer ? Number(form.odometer) : undefined,
    });
    setForm((prev) => ({ ...prev, liters: '', total_cost: '', distance_km: '', odometer: '', station: '', notes: '' }));
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Új tankolás rögzítése</h2>
        <p className="text-xs text-muted-foreground">Add meg a liter, ár és távolság adatokat a valós fogyasztáshoz.</p>
      </div>

      {vehicles.length > 0 && (
        <select value={form.vehicle_id} onChange={(e) => update('vehicle_id', e.target.value)} className="input-field">
          <option value="">Jármű nélkül</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} ({vehicle.year})</option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input className="input-field" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />
        <select className="input-field" value={form.fuel_type} onChange={(e) => update('fuel_type', e.target.value)}>
          <option value="benzin">Benzin</option>
          <option value="dizel">Dízel</option>
          <option value="hibrid">Hibrid</option>
          <option value="egyeb">Egyéb</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input className="input-field" type="number" step="0.01" min="0" placeholder="Liter" value={form.liters} onChange={(e) => update('liters', e.target.value)} required />
        <input className="input-field" type="number" step="1" min="0" placeholder="Ár" value={form.total_cost} onChange={(e) => update('total_cost', e.target.value)} required />
        <input className="input-field" type="number" step="0.1" min="1" placeholder="Km" value={form.distance_km} onChange={(e) => update('distance_km', e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input className="input-field" type="number" step="1" min="0" placeholder="Kilométeróra" value={form.odometer} onChange={(e) => update('odometer', e.target.value)} />
        <input className="input-field" placeholder="Benzinkút" value={form.station} onChange={(e) => update('station', e.target.value)} />
      </div>

      <button disabled={saving} className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        <Plus size={16} /> {saving ? 'Mentés...' : 'Tankolás mentése'}
      </button>
    </form>
  );
}