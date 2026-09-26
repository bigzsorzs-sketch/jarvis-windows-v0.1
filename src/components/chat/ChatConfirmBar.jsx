import { memo } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatConfirmBar = memo(function ChatConfirmBar({ pendingConfirm, onConfirm, onCancel, t }) {
  return (
    <AnimatePresence>
      {pendingConfirm && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="mx-4 mb-2 bg-card border border-primary/40 rounded-2xl p-4"
        >
          <p className="text-xs text-primary font-semibold mb-2">{t('confirm_needed')}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {pendingConfirm.actions.map(a => a.tool).join(', ')} – {t('confirm_question')}
          </p>
          <div className="flex gap-2">
            <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              {t('yes_execute')}
            </button>
            <button onClick={onCancel} className="w-10 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center">
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default ChatConfirmBar;