import { useState, memo } from 'react';
import { Brain, Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import ActionResultCard from '@/components/assistant/ActionResultCard';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';

const ChatMessageBubble = memo(function ChatMessageBubble({ msg, previousUserMessage = '', onRateMessage }) {
  const isUser = msg.role === 'user';
  const rawContent = isUser ? String(msg.content ?? '') : normalizeAssistantReply(msg.content);
  const cleanContent = isUser ? rawContent : rawContent.replace(/\[ACTION:[^\]]+\]/g, '').trim();
  const [copied, setCopied] = useState(false);
  const [rated, setRated] = useState(false);

  const copyText = () => {
    if (!cleanContent) return;
    navigator.clipboard.writeText(cleanContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const rateMessage = (rating) => {
    if (rated) return;
    setRated(true);
    onRateMessage?.({ rating, assistantReply: cleanContent, userMessage: previousUserMessage });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mr-2 mt-1 shrink-0">
          <Brain size={14} className="text-primary" />
        </div>
      )}
      <div className="max-w-[82%] space-y-1">
        {cleanContent && (
          <div className="relative">
            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'bg-card border border-border text-foreground rounded-tl-sm'
            }`}>
              {isUser ? cleanContent : (
                <ReactMarkdown className="prose prose-sm max-w-none [&>p]:text-foreground [&>p]:my-1 [&>ul]:text-foreground [&>ul]:my-1 [&>li]:text-foreground [&>strong]:text-foreground [&>h3]:text-foreground [&>h3]:font-semibold [&>code]:bg-secondary [&>code]:px-1 [&>code]:rounded">
                  {cleanContent}
                </ReactMarkdown>
              )}
            </div>
            {!isUser && cleanContent.length > 10 && (
              <div className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={() => rateMessage(5)}
                  disabled={rated}
                  className="w-6 h-6 bg-secondary border border-border rounded-full flex items-center justify-center disabled:opacity-50"
                  title="Hasznos válasz"
                >
                  <ThumbsUp size={10} className="text-primary" />
                </button>
                <button
                  onClick={() => rateMessage(1)}
                  disabled={rated}
                  className="w-6 h-6 bg-secondary border border-border rounded-full flex items-center justify-center disabled:opacity-50"
                  title="Gyenge válasz"
                >
                  <ThumbsDown size={10} className="text-red-400" />
                </button>
                <button
                  onClick={copyText}
                  className="w-6 h-6 bg-secondary border border-border rounded-full flex items-center justify-center"
                  title="Másolás"
                >
                  {copied ? <Check size={10} className="text-primary" /> : <Copy size={10} className="text-muted-foreground" />}
                </button>
              </div>
            )}
          </div>
        )}
        {msg.actionResults?.length > 0 && (
          <ActionResultCard results={msg.actionResults} />
        )}
        {msg.attachedFiles?.length > 0 && (
          <div className="flex flex-col gap-2">
            {msg.attachedFiles.map((f, i) => {
              if (!f?.url || f.metadataOnly) {
                return (
                  <div key={i} className="rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                    📎 {f?.name || 'Csatolmány'} — a fájl tartalma nem része a mentett előzményeknek.
                  </div>
                );
              }
              if (f.kind === 'image') return <img key={i} src={f.url} alt={f.name} className="rounded-xl max-w-full border border-border" />;
              if (f.kind === 'video') return <video key={i} src={f.url} controls className="rounded-xl max-w-full border border-border" />;
              if (f.kind === 'audio') return <audio key={i} src={f.url} controls className="w-full rounded-xl" />;
              return <div key={i} className="rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">📎 {f.name}</div>;
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default ChatMessageBubble;