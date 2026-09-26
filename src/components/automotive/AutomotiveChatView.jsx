import { memo, useState } from 'react';
import { Send, Mic, MicOff, Loader2, Wrench, Copy, Check, FileDown, Paperclip, Image, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

const MessageBubble = memo(function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const content = String(msg.content || '');
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center mr-2 mt-1 shrink-0">
          <Wrench size={14} className="text-yellow-400" />
        </div>
      )}
      <div className="max-w-[82%] space-y-1">
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed relative ${
          isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border border-border text-foreground rounded-tl-sm'
        }`}>
          {isUser ? content : (
            <ReactMarkdown className="prose prose-sm max-w-none [&>p]:text-foreground [&>p]:my-1 [&>ul]:text-foreground [&>li]:text-foreground [&>strong]:font-semibold">
              {content}
            </ReactMarkdown>
          )}
          {!isUser && content.length > 10 && (
            <button onClick={copyText} className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 bg-secondary border border-border rounded-full flex items-center justify-center">
              {copied ? <Check size={10} className="text-primary" /> : <Copy size={10} className="text-muted-foreground" />}
            </button>
          )}
        </div>
        {msg.imageUrl && <img src={msg.imageUrl} alt="diagnosztika" className="rounded-2xl max-w-full border border-border" />}
      </div>
    </motion.div>
  );
});

const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center mr-2 shrink-0">
        <Wrench size={14} className="text-yellow-400" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
        <span className="text-xs text-muted-foreground ml-1">Diagnosztizálom...</span>
      </div>
    </div>
  );
});

export default memo(function AutomotiveChatView({
  messages, loading, bottomRef, lastDiagnosis, pdfLoading, generatePDF,
  attachedImage, setAttachedImage, uploadingImage, input, setInput,
  isListening, toggleVoice, sendMessage, handleImageAttach, fileInputRef,
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && <TypingIndicator key="typing" />}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      <AnimatePresence>
        {lastDiagnosis && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="px-4 pb-2 shrink-0">
            <button onClick={generatePDF} disabled={pdfLoading}
              className="w-full py-2.5 rounded-xl bg-green-500 text-white font-medium text-sm flex items-center justify-center gap-2 hover:bg-green-600 disabled:opacity-60 transition-all">
              {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              PDF Letöltése Szervízhez
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachedImage && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-4 pb-1 shrink-0">
            <div className="bg-secondary rounded-xl px-3 py-2 flex items-center gap-2">
              <Image size={14} className="text-primary shrink-0" />
              <span className="text-xs text-foreground flex-1 truncate">{attachedImage.name}</span>
              <button onClick={() => setAttachedImage(null)} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-3 shrink-0">
        <div className={`flex items-center gap-2 bg-card rounded-2xl px-3 py-2.5 border transition-colors ${isListening ? 'border-yellow-500/60' : 'border-border'}`}>
          <button onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors" title="Kép csatolása">
            {uploadingImage ? <Loader2 size={14} className="text-primary animate-spin" /> : <Paperclip size={14} />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={isListening ? '🎙️ Figyelek...' : 'Írj vagy töltsd fel a képet...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          />
          <button onClick={toggleVoice}
            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-yellow-500 animate-pulse' : 'bg-secondary hover:bg-muted'}`}>
            {isListening ? <MicOff size={14} className="text-white" /> : <Mic size={14} className="text-muted-foreground" />}
          </button>
          <button onClick={() => sendMessage()} disabled={(!input.trim() && !attachedImage) || loading}
            className="shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center disabled:opacity-40 transition-opacity">
            {loading ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-white" />}
          </button>
        </div>
      </div>
    </>
  );
});