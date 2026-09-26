import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, MessageSquare, Headphones, Volume2, VolumeX } from 'lucide-react';
import LanguagePicker from '@/components/chat/LanguagePicker';
import { requestMicrophonePermission } from '@/lib/microphonePermission';
import { showAppDialogMessage } from '@/lib/appDialog';

const ChatHeader = memo(function ChatHeader({ aiName, onNewChat, onExport, onFeedback, handsFree, onToggleHandsFree, autoSpeakReplies, onToggleAutoSpeak, speechStats, isOnline, degradedMode, t }) {
  const navigate = useNavigate();

  const openHandsFree = async () => {
    if (!handsFree) {
      const permission = await requestMicrophonePermission();
      if (!permission.ok) {
        showAppDialogMessage(permission.message);
        return;
      }
      onToggleHandsFree?.();
    }
    navigate('/live-assistant');
  };

  return (
    <div className="flex flex-col border-b border-border bg-card shrink-0">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onNewChat}
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
          title={t('new_chat')}
        >
          <Plus size={16} className="text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${handsFree ? 'bg-green-400' : 'bg-primary'}`} />
          <h1 className="text-base font-semibold text-foreground">
            {aiName || 'AI'}
          </h1>
          {handsFree && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">Hands-Free</span>}
          <LanguagePicker />
        </div>
      <div className="flex items-center gap-2">
        <button
          onClick={openHandsFree}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${handsFree ? 'bg-green-500 text-white' : 'bg-secondary hover:bg-muted'}`}
          title={handsFree ? 'Hands-Free kikapcsolása' : 'Hands-Free mód'}
        >
          <Headphones size={16} className={handsFree ? 'text-white' : 'text-muted-foreground'} />
        </button>
        <button
          onClick={onToggleAutoSpeak}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${autoSpeakReplies ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-muted'}`}
          title={autoSpeakReplies ? 'Hangválasz kikapcsolása' : 'Hangválasz bekapcsolása'}
        >
          {autoSpeakReplies ? <Volume2 size={16} className="text-primary-foreground" /> : <VolumeX size={16} className="text-muted-foreground" />}
        </button>
        <button onClick={onExport} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted" title={t('export_chat')}>
          <Download size={16} className="text-muted-foreground" />
        </button>
        <button onClick={onFeedback} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted" title={t('send')}>
          <MessageSquare size={16} className="text-muted-foreground" />
        </button>
      </div>
      </div>
      {/* Offline / Degraded banner */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-1 bg-red-500/15 border-t border-red-500/20 text-[10px] text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
          {t('offline_msg')}
        </div>
      )}
      {isOnline && degradedMode && (
        <div className="flex items-center gap-2 px-4 py-1 bg-yellow-500/10 border-t border-yellow-500/20 text-[10px] text-yellow-400">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
          Degradált mód — lassú kapcsolat érzékelve
        </div>
      )}
      {/* Telemetry bar — only visible in hands-free mode */}
      {handsFree && speechStats && (
        <div className="flex items-center gap-3 px-4 py-1 bg-green-500/5 border-t border-green-500/10 text-[10px] text-muted-foreground overflow-x-auto">
          <span>🔄 Restarts: <span className="text-green-400 font-mono">{speechStats.restartCount}</span></span>
          <span>🐕 Watchdog: <span className="text-yellow-400 font-mono">{speechStats.watchdogFires}</span></span>
          <span>📋 Queue: <span className="text-blue-400 font-mono">{speechStats.queueOverflows} OVF</span></span>
          <span>🔧 Heals: <span className="text-orange-400 font-mono">{speechStats.selfHealEvents}</span></span>
          <span>📡 Net: <span className={speechStats.lastNetworkEvent === 'offline' ? 'text-red-400 font-mono' : 'text-green-400 font-mono'}>{speechStats.networkChanges}</span></span>
          <span>⚡ Latency: <span className="text-primary font-mono">{speechStats.avgLatencyMs}ms</span></span>
          <span>⏱ Uptime: <span className="text-foreground font-mono">{Math.round(speechStats.uptimeMs / 60000)}m</span></span>
        </div>
      )}
    </div>
  );
});

export default ChatHeader;