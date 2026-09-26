import React from 'react';
import { AlertTriangle, RotateCcw, WifiOff } from 'lucide-react';
import { logger } from '@/lib/logger';

/**
 * Reusable ErrorBoundary.
 * Props:
 *   fallback  — optional custom fallback JSX (receives error, reset)
 *   compact   — smaller inline variant for section-level use
 *   onError   — optional callback(error, info)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('ErrorBoundary', 'React render error', {
      message: error?.message,
      componentStack: errorInfo?.componentStack,
    });

    const message = String(error?.message || '');
    const isChunkLoadError = message.includes('Failed to fetch dynamically imported module') || message.includes('Importing a module script failed');
    if (isChunkLoadError && sessionStorage.getItem('chunk_reload_attempted') !== 'true') {
      sessionStorage.setItem('chunk_reload_attempted', 'true');
      window.location.reload();
      return;
    }

    this.props.onError?.(error, errorInfo);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    if (this.props.compact) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400 flex-1">Valami nem sikerült. Próbáld újra.</p>
          <button onClick={this.reset} className="text-xs text-primary underline shrink-0">Újra</button>
        </div>
      );
    }

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    return (
      <div className="h-full flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${offline ? 'bg-yellow-500/20' : 'bg-red-500/20'}`}>
            {offline ? <WifiOff size={28} className="text-yellow-400" /> : <AlertTriangle size={28} className="text-red-400" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{offline ? 'Nincs internetkapcsolat. Próbáld újra.' : 'Valami hiba történt'}</h2>
            {!offline && <p className="text-sm text-muted-foreground mt-1">Kérlek próbáld meg újra.</p>}
          </div>
          <button
            onClick={this.reset}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 mx-auto"
          >
            <RotateCcw size={14} /> Újrapróbálás
          </button>
        </div>
      </div>
    );
  }
}