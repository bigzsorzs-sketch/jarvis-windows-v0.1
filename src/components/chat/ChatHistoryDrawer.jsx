import { History, MessageSquarePlus, Trash2, X } from 'lucide-react';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('hu-HU', {
    month:'short',
    day:'numeric',
    hour:'2-digit',
    minute:'2-digit',
  });
}

export default function ChatHistoryDrawer({
  open,
  conversations = [],
  activeConversationId = null,
  onClose,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm" onMouseDown={onClose}>
      <aside
        className="absolute left-0 top-0 h-full w-[340px] max-w-[88vw] border-r border-border bg-background shadow-2xl flex flex-col"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Beszélgetési előzmények"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <History size={18} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Előzmények</h2>
              <p className="text-[11px] text-muted-foreground">Korábbi Jarvis beszélgetések</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-secondary grid place-items-center" aria-label="Bezárás">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 border-b border-border">
          <button
            onClick={onNewChat}
            className="w-full rounded-xl bg-primary text-primary-foreground px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <MessageSquarePlus size={16} />
            Új beszélgetés
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Még nincs mentett beszélgetés.
            </div>
          ) : conversations.map((conversation) => {
            const active = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                className={`group flex items-center gap-2 rounded-xl border px-2 py-2 transition ${active ? 'border-primary/45 bg-primary/10' : 'border-transparent hover:border-border hover:bg-secondary/60'}`}
              >
                <button
                  onClick={() => onOpenConversation?.(conversation)}
                  className="min-w-0 flex-1 text-left px-1"
                >
                  <div className="truncate text-sm font-medium text-foreground">
                    {conversation.title || 'Beszélgetés'}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatDate(conversation.updated_date || conversation.created_date)}
                  </div>
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteConversation?.(conversation.id);
                  }}
                  className="w-8 h-8 rounded-lg grid place-items-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  aria-label="Beszélgetés törlése"
                  title="Törlés"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
