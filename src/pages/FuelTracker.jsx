import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Fuel } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { jarvis } from '@/api/jarvisClient';
import { useLang } from '@/lib/i18n';
import { validateFuelLog } from '@/lib/fuelLogValidation';
import FuelLogForm from '@/components/fuel/FuelLogForm';
import FuelStatsCards from '@/components/fuel/FuelStatsCards';
import FuelCostChart from '@/components/fuel/FuelCostChart';
import FuelLogList from '@/components/fuel/FuelLogList';

export default function FuelTracker() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const vehiclesById = useMemo(() => Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const loadData = async () => {
    setLoadError('');
    try {
    const [fuelLogs, vehicleProfiles] = await Promise.all([
      jarvis.entities.FuelLog.filter({}, '-date', 100),
      jarvis.entities.VehicleProfile.filter({}, '-created_date', 50),
    ]);
    setLogs(fuelLogs);
    setVehicles(vehicleProfiles);
    } catch { setLoadError('generic_load_error'); }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (data) => {
    setSaving(true);
    try {
      const created = await jarvis.entities.FuelLog.create(validateFuelLog(data));
      if (!created?.id) throw new Error('FUEL_SAVE_NOT_CONFIRMED');
      setLogs((prev) => [created, ...prev]);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleteError('');
    try {
      const result = await jarvis.entities.FuelLog.delete(id);
      if (result?.success !== true) throw new Error('FUEL_DELETE_NOT_CONFIRMED');
      setLogs((prev) => prev.filter((log) => log.id !== id));
    } catch { setDeleteError('fuel_delete_error'); }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6 space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
          <div className="w-10 h-10 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Fuel size={20} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('page_fuel_tracker')}</h1>
            <p className="text-xs text-muted-foreground">{t('fuel_subtitle')}</p>
          </div>
        </div>

        {loadError && <div role="alert" className="text-sm text-red-400">{t(loadError)} <button onClick={loadData}>{t('try_again')}</button></div>}
        {deleteError && <p role="alert" className="text-sm text-red-400">{t(deleteError)}</p>}
        <FuelStatsCards logs={logs} />
        <FuelLogForm vehicles={vehicles} onSubmit={handleCreate} saving={saving} />
        <FuelCostChart logs={logs} />
        <FuelLogList logs={logs} vehiclesById={vehiclesById} onDelete={handleDelete} />
      </div>
    </div>
  );
}
