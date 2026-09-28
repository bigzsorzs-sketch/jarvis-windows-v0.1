import { Loader2, Send } from 'lucide-react';

export default function CommandCenterChatPanel({
  messages = [],
  input = '',
  setInput,
  onSend,
  loading = false,
  loadingStep = '',
}) {
  const visibleMessages = messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .slice(-6);

  const submit = (event) => {
    event?.preventDefault?.();
    if (!input.trim() || loading) return;
    onSend?.();
  };

  return (
    <section className="jarvis-command-chat" aria-label="Jarvis integrated conversation">
      <div className="jarvis-command-chat-log" aria-live="polite">
        {visibleMessages.length === 0 ? (
          <div className="jarvis-command-chat-empty">Írj nekem bármit. A válaszom itt jelenik meg.</div>
        ) : (
          visibleMessages.map((message, index) => (
            <div
              key={message.id || message.timestamp || index}
              className={message.role === 'user' ? 'jarvis-command-chat-bubble is-user' : 'jarvis-command-chat-bubble is-assistant'}
            >
              <span>{message.role === 'user' ? 'Te' : 'Jarvis'}</span>
              <p>{String(message.content || '')}</p>
            </div>
          ))
        )}
        {loading && (
          <div className="jarvis-command-chat-bubble is-assistant is-loading">
            <span>Jarvis</span>
            <p><Loader2 size={13} className="animate-spin" /> {loadingStep || 'Gondolkodom…'}</p>
          </div>
        )}
      </div>

      <form className="jarvis-command-chat-input" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(event);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Írj Jarvisnak…"
          aria-label="Üzenet Jarvisnak"
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Küldés">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </form>
    </section>
  );
}
