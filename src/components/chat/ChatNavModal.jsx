import { memo } from 'react';
import { Navigation, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatNavModal = memo(function ChatNavModal({ show, onClose, navQuery, setNavQuery, onNavigate, t }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
            className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-foreground">🗺️ {t('navigation')}</h2>
              <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
            </div>
            <input
              className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-border text-foreground mb-4"
              placeholder={t('navigate_where')}
              value={navQuery}
              onChange={e => setNavQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onNavigate()}
              autoFocus
            />
            <button onClick={onNavigate} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500 text-white font-semibold">
              <Navigation size={16} /> {t('navigate_maps')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default ChatNavModal;