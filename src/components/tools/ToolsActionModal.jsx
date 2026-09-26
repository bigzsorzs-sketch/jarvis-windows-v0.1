import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function ToolsActionModal({ show, title, onClose, children }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }} className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}