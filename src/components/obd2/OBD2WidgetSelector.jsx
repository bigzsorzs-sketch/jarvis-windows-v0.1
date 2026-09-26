import { useState } from 'react';
import { OBD2_METRICS, saveDashboardConfig } from '@/lib/obd2Metrics';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OBD2WidgetSelector({ selectedMetrics, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(selectedMetrics));

  const toggleMetric = (id) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const handleSave = () => {
    const metricArray = Array.from(selected);
    saveDashboardConfig(metricArray);
    onSave(metricArray);
  };

  const selectAll = () => {
    setSelected(new Set(OBD2_METRICS.map((m) => m.id)));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex items-end"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25 }}
          className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">OBD2 Műszerek</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Válaszd ki, mely adatokat szeretnéd megjeleníteni az instrumentumtáblán.
          </p>

          {/* Quick actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={selectAll}
              className="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              Összes
            </button>
            <button
              onClick={clearAll}
              className="flex-1 py-2 rounded-lg bg-secondary text-muted-foreground text-xs font-medium border border-border hover:bg-muted transition-colors"
            >
              Nincs
            </button>
          </div>

          {/* Metrics list */}
          <div className="space-y-2 mb-4">
            {OBD2_METRICS.map((metric) => {
              const isSelected = selected.has(metric.id);
              return (
                <motion.button
                  key={metric.id}
                  onClick={() => toggleMetric(metric.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-secondary border-border hover:border-primary/20'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircle2 size={20} className="text-primary shrink-0" />
                  ) : (
                    <Circle size={20} className="text-muted-foreground shrink-0" />
                  )}

                  <div className="flex-1 text-left">
                    <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                      {metric.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {metric.unit} • {metric.min}-{metric.max}
                    </p>
                  </div>

                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: metric.color }}
                  />
                </motion.button>
              );
            })}
          </div>

          {/* Save button */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-semibold text-sm transition-colors hover:bg-muted"
            >
              Mégse
            </button>
            <button
              onClick={handleSave}
              disabled={selected.size === 0}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 transition-all hover:bg-primary/90"
            >
              Mentés ({selected.size})
            </button>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-3">
            💡 Válassz legalább 1 műszert!
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}