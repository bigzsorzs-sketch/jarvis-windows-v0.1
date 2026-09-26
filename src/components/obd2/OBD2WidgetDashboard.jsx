import { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { getMetricsByIds, loadDashboardConfig, saveDashboardConfig } from '@/lib/obd2Metrics';
import OBD2WidgetSelector from './OBD2WidgetSelector';
import OBD2PidWidgetCard from './OBD2PidWidgetCard';
import { Settings, Grid2x2 } from 'lucide-react';

function normalizeConfig(config) {
  if (Array.isArray(config)) {
    return { selectedMetrics: config, cardSizes: {} };
  }
  return {
    selectedMetrics: Array.isArray(config?.selectedMetrics) ? config.selectedMetrics : ['rpm', 'coolant_temp', 'speed'],
    cardSizes: config?.cardSizes || {},
  };
}

function reorder(list, startIndex, endIndex) {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

export default function OBD2WidgetDashboard({ obd2Manager, isConnected }) {
  const initialConfig = useMemo(() => normalizeConfig(loadDashboardConfig()), []);
  const [selectedMetrics, setSelectedMetrics] = useState(initialConfig.selectedMetrics);
  const [cardSizes, setCardSizes] = useState(initialConfig.cardSizes);
  const [values, setValues] = useState({});
  const [showSelector, setShowSelector] = useState(false);
  const [loading, setLoading] = useState(false);

  const metrics = useMemo(() => getMetricsByIds(selectedMetrics), [selectedMetrics]);

  const persistConfig = (nextMetrics, nextSizes = cardSizes) => {
    saveDashboardConfig({ selectedMetrics: nextMetrics, cardSizes: nextSizes });
  };

  useEffect(() => {
    if (!obd2Manager || !isConnected || metrics.length === 0) return;

    let mounted = true;
    const pollValues = async () => {
      setLoading(true);
      const readMetric = async (metric) => {
        const data = await obd2Manager.readPID(metric.pidHex);
        if (!data?.success) return values[metric.id] ?? 0;
        return Number(metric.parse(data.data)) || 0;
      };

      const entries = await Promise.all(metrics.map(async (metric) => {
        if (metric.parseDerived && metric.dependencies?.length) {
          const dependencyValues = Object.fromEntries(await Promise.all(
            getMetricsByIds(metric.dependencies).map(async (dependency) => [dependency.id, await readMetric(dependency)])
          ));
          return [metric.id, metric.parseDerived(dependencyValues)];
        }
        return [metric.id, await readMetric(metric)];
      }));
      if (mounted) {
        setValues(Object.fromEntries(entries));
        setLoading(false);
      }
    };

    pollValues();
    const interval = setInterval(pollValues, 1500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [obd2Manager, isConnected, metrics]);

  const handleMetricsSave = (newMetrics) => {
    setSelectedMetrics(newMetrics);
    persistConfig(newMetrics);
    setShowSelector(false);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const ordered = reorder(selectedMetrics, result.source.index, result.destination.index);
    setSelectedMetrics(ordered);
    persistConfig(ordered);
  };

  const toggleCardSize = (id) => {
    const nextSizes = { ...cardSizes, [id]: cardSizes[id] === 'wide' ? 'normal' : 'wide' };
    setCardSizes(nextSizes);
    persistConfig(selectedMetrics, nextSizes);
  };

  const removeMetric = (id) => {
    const nextMetrics = selectedMetrics.filter((metricId) => metricId !== id);
    setSelectedMetrics(nextMetrics);
    persistConfig(nextMetrics);
  };

  if (!isConnected || metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 bg-card border border-border rounded-2xl">
        <Grid2x2 size={40} className="text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground mb-4 text-center">
          {!isConnected ? 'Csatlakozz OBD2-höz az adatok megtekintéséhez' : 'Válassz ki legalább egy PID kártyát'}
        </p>
        <button onClick={() => setShowSelector(true)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
          <Settings size={14} /> PID-ek kiválasztása
        </button>
        {showSelector && <OBD2WidgetSelector selectedMetrics={selectedMetrics} onSave={handleMetricsSave} onClose={() => setShowSelector(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Grid2x2 size={16} /> Testreszabható OBD2 Dashboard</h3>
          <p className="text-xs text-muted-foreground">Húzd át a kártyákat a sorrendhez, vagy állítsd a méretüket.</p>
        </div>
        <button onClick={() => setShowSelector(true)} className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors" title="PID-ek kiválasztása">
          <Settings size={16} className="text-muted-foreground" />
        </button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="obd2-pid-dashboard" direction="horizontal">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metrics.map((metric, index) => (
                <Draggable key={metric.id} draggableId={metric.id} index={index}>
                  {(dragProvided) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      <OBD2PidWidgetCard
                        metric={metric}
                        value={values[metric.id]}
                        size={cardSizes[metric.id]}
                        onToggleSize={toggleCardSize}
                        onRemove={removeMetric}
                        dragHandleProps={dragProvided.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {loading && <p className="text-xs text-muted-foreground text-center">Adatok frissítése...</p>}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-400">
        A kártyák 1.5 másodpercenként frissülnek, a kiválasztás, sorrend és méret automatikusan mentődik.
      </div>

      {showSelector && <OBD2WidgetSelector selectedMetrics={selectedMetrics} onSave={handleMetricsSave} onClose={() => setShowSelector(false)} />}
    </div>
  );
}