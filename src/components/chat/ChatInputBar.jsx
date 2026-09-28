import { memo } from 'react';
import { Send, Mic, MicOff, Loader2 } from 'lucide-react';
import MultiMediaUpload from '@/components/common/MultiMediaUpload';

const ChatInputBar = memo(function ChatInputBar({
  input, setInput, onSend, onToggleVoice, onNavClick,
  isListening, loading, attachedFiles, setAttachedFiles,
  onMediaError, inputRef, handsFree, voicePhase = 'idle', t,
}) {
  const charCount = input.length;
  const isNearLimit = charCount > 1800;
  const safeValue = input.slice(0, 2000);
  const micActive = isListening || voicePhase === 'listening';
  const voiceBusy = micActive || voicePhase === 'processing' || voicePhase === 'speaking' || voicePhase === 'tts_pending';
  const voiceStatus = voicePhase === 'speaking' || voicePhase === 'tts_pending'
    ? 'Beszélek...'
    : voicePhase === 'processing'
      ? 'Feldolgozom...'
      : micActive
        ? 'Hallgatok...'
        : handsFree
          ? 'Folyamatos hang mód aktív'
          : '';

  return (
    <div className="px-4 pb-3 shrink-0 space-y-1">
      {isNearLimit && (
        <p className="text-xs text-right pr-1 text-destructive">{charCount}/2000</p>
      )}
      <div className={`flex flex-col bg-card rounded-2xl border transition-colors ${handsFree ? 'border-green-500/40' : 'border-border'}`}>
        {voiceStatus && (
          <div className="px-3 pt-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              {(voicePhase === 'processing' || voicePhase === 'speaking' || voicePhase === 'tts_pending') && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {voiceStatus}
            </div>
          </div>
        )}
        {attachedFiles.length > 0 && (
          <div className="px-3 pt-2">
            <MultiMediaUpload
              files={attachedFiles}
              onChange={setAttachedFiles}
              onError={onMediaError}
            />
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <MultiMediaUpload
            files={attachedFiles}
            onChange={setAttachedFiles}
            onError={onMediaError}
            buttonOnly
          />
          <input
            ref={inputRef}
            aria-label={handsFree ? t('listening') : t('type_or_say')}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={handsFree ? t('listening') : t('type_or_say')}
            value={safeValue}
            onChange={e => setInput(e.target.value.slice(0, 2000))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            maxLength={2000}
          />

          <button
            onClick={onToggleVoice}
            aria-label={micActive ? t('cancel') : t('listening')}
            disabled={(voicePhase === 'processing' || voicePhase === 'speaking' || voicePhase === 'tts_pending') && !handsFree}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
              micActive ? 'bg-green-500' : 'bg-secondary hover:bg-muted'
            }`}
          >
            {micActive ? <MicOff size={14} className="text-white" /> : <Mic size={14} className="text-muted-foreground" />}
          </button>

          <button
            onClick={onSend}
            aria-label={t('send')}
            disabled={(!input.trim() && attachedFiles.length === 0) || loading}
            className="shrink-0 w-11 h-11 rounded-full bg-primary flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            {loading ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-primary-foreground" />}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChatInputBar;