export default function LiveConversationPanel({ messages }) {
  return (
    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto px-1">
      {messages.slice(-20).map((message, index) => (
        <div
          key={`${message.role}-${index}`}
          className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            message.role === 'user'
              ? 'ml-auto rounded-tr-sm bg-primary text-primary-foreground'
              : 'mr-auto rounded-tl-sm bg-secondary border border-border text-foreground'
          }`}
        >
          {message.content}
        </div>
      ))}
    </div>
  );
}