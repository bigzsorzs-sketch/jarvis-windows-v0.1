import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function ActionResultCard({ results }) {
  if (!results || results.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {results.map((r, i) => (
        <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-xs border ${
          r.result?.success
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {r.result?.success
            ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            : <XCircle size={13} className="shrink-0 mt-0.5" />
          }
          <span>{r.result?.message || r.tool}</span>
        </div>
      ))}
    </motion.div>
  );
}