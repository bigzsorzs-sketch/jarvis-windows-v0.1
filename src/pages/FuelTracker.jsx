import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Fuel } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { jarvis } from '@/api/jarvisClient';
import FuelLogForm from '@/components/fuel/FuelLogForm';
import FuelStatsCards from '@/components/fuel/FuelStatsCards';
import FuelCostChart from '@/components/fuel/FuelCostChart';
import FuelLogList from '@/components/fuel/FuelLogList';

export default function FuelTracker() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [saving, setSaving] = useState(false);

  const vehiclesById = useMemo(() => Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const loadData = async () => {
    const [fuelLogs, vehicleProfiles] = await Promise.all([
      jarvis.entities.FuelLog.filter({}, '-date', 100),
      jarvis.entities.VehicleProfile.filter({}, '-created_date', 50),
    ]);
    setLogs(fuelLogs);
    setVehicles(vehicleProfiles);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (data) => {
    setSaving(true);
    const created = await jarvis.entities.FuelLog.create(data);
    setLogs((prev) => [created, ...prev]);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await jarvis.entities.FuelLog.delete(id);
    setLogs((prev) => prev.filter((log) => log.id !== id));
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
            <h1 className="text-xl font-bold text-foreground">Üzemanyag-követés</h1>
            <p className="text-xs text-muted-foreground">Valós fogyasztás és tankolási költségek</p>
          </div>
        </div>

        <FuelStatsCards logs={logs} />
        <FuelLogForm vehicles={vehicles} onSubmit={handleCreate} saving={saving} />
        <FuelCostChart logs={logs} />
        <FuelLogList logs={logs} vehiclesById={vehiclesById} onDelete={handleDelete} />
      </div>
    </div>
  );
}