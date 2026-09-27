import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function FuelCostChart({ logs }) {
  const chartData = [...logs]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((log) => ({
      date: new Date(log.date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }),
      cost: Number(log.total_cost || 0),
      consumption: Number(log.distance_km) > 0 ? Number(((Number(log.liters || 0) / Number(log.distance_km)) * 100).toFixed(1)) : 0,
    }));

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Költségek alakulása</h2>
      {chartData.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Még nincs grafikonhoz elegendő tankolási adat.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
            <Area type="monotone" dataKey="cost" name="Költség" stroke="#10b981" fill="#10b981" fillOpacity={0.18} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}