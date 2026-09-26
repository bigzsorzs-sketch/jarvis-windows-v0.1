import { useMemo } from 'react';
import { AlertTriangle, Gauge, Thermometer, Wind } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDtcGroups(codes = []) {
  const labels = {
    P: 'Motor / hajtás',
    C: 'Futómű',
    B: 'Karosszéria',
    U: 'Kommunikáció',
    other: 'Egyéb',
  };

  const counts = codes.reduce((acc, code) => {
    const key = String(code || '').charAt(0).toUpperCase();
    const group = labels[key] ? key : 'other';
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([key, count]) => ({ name: labels[key], count }));
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '12px',
  color: 'hsl(var(--foreground))',
  fontSize: 12,
};

export default function OBD2VisualDataPanel({ readings = {}, history = [], dtcCodes = [] }) {
  const chartData = useMemo(() => history.slice(-24).map((point, index) => ({
    label: point.time || `${index + 1}`,
    rpm: toNumber(point.rpm),
    temperature: toNumber(point.temperature),
    maf: toNumber(point.maf),
    speed: toNumber(point.speed),
  })), [history]);

  const dtcData = useMemo(() => getDtcGroups(dtcCodes), [dtcCodes]);
  const hasData = chartData.length > 1;

  const rpm = readings.ENGINE_RPM?.value;
  const temperature = readings.COOLANT_TEMP?.value;
  const maf = readings.MAF_AIR_FLOW?.value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Grafikus motoradatok</h3>
          <p className="text-xs text-muted-foreground">Egyszerű trendek és hibakód áttekintés</p>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
          {chartData.length} mérés
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3">
          <Gauge size={15} className="text-yellow-400 mb-2" />
          <p className="text-[11px] text-muted-foreground">RPM</p>
          <p className="text-lg font-bold text-foreground">{rpm ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <Thermometer size={15} className="text-red-400 mb-2" />
          <p className="text-[11px] text-muted-foreground">Hőm.</p>
          <p className="text-lg font-bold text-foreground">{temperature ?? '—'}°C</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <Wind size={15} className="text-blue-400 mb-2" />
          <p className="text-[11px] text-muted-foreground">MAF</p>
          <p className="text-lg font-bold text-foreground">{maf ?? '—'}</p>
        </div>
      </div>

      {hasData ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">RPM és motorhőmérséklet trend</p>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={chartData} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="rpmFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#facc15" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={38} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="rpm" name="RPM" stroke="#facc15" fill="url(#rpmFill)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="temperature" name="°C" stroke="#ef4444" fill="url(#tempFill)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center text-xs text-muted-foreground">
          Még nincs elég mérés a diagramhoz. Várj néhány frissítést.
        </div>
      )}

      {dtcCodes.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-3 flex items-center gap-2 text-red-400">
            <AlertTriangle size={16} />
            <p className="text-sm font-semibold">Hibakód megoszlás</p>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={dtcData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Darab" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}