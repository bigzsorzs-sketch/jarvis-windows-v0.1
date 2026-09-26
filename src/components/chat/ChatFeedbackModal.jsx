import { memo } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatFeedbackModal = memo(function ChatFeedbackModal({ show, onClose, feedbackText, setFeedbackText, onSend }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
            className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-foreground">💬 Feedback</h2>
              <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
            </div>
            <textarea
              className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-border text-foreground mb-4 resize-none h-24"
              placeholder="Mi van az appban, ami nem működik vagy fejlesztésre szorul?"
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
            />
            <button onClick={onSend} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
              Küldés
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default ChatFeedbackModal;