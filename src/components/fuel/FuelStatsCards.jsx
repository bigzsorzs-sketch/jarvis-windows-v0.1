function format(value, suffix = '') {
  return `${Number(value || 0).toFixed(1)}${suffix}`;
}

export default function FuelStatsCards({ logs }) {
  const totalLiters = logs.reduce((sum, log) => sum + Number(log.liters || 0), 0);
  const totalCost = logs.reduce((sum, log) => sum + Number(log.total_cost || 0), 0);
  const totalDistance = logs.reduce((sum, log) => sum + Number(log.distance_km || 0), 0);
  const avgConsumption = totalDistance > 0 ? (totalLiters / totalDistance) * 100 : 0;
  const avgCostPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;

  const cards = [
    { label: 'Átlagfogyasztás', value: format(avgConsumption, ' L/100km') },
    { label: 'Összes költség', value: `${Math.round(totalCost).toLocaleString('hu-HU')} Ft` },
    { label: 'Költség / km', value: `${format(avgCostPerKm, ' Ft')}` },
    { label: 'Megtett táv', value: `${Math.round(totalDistance).toLocaleString('hu-HU')} km` },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card) => (
        <div key={card.label} className="bg-card border border-border rounded-2xl p-3">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="text-lg font-bold text-foreground mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}