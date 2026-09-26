import { useState, useEffect, memo } from 'react';
import { Brain } from 'lucide-react';

const ChatTypingIndicator = memo(function ChatTypingIndicator({ step }) {
  const steps = ['Gondolkodom...', 'Adatokat olvasok...', 'Végrehajtom...'];
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStepIdx(i => (i + 1) % steps.length), 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0">
        <Brain size={14} className="text-primary" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
        <span className="text-xs text-muted-foreground ml-1">{step || steps[stepIdx]}</span>
      </div>
    </div>
  );
});

export default ChatTypingIndicator;