export default function NotificationsCard({ notifStatus, onRequest, lang, t }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔔</span>
        <h2 className="text-sm font-semibold text-foreground">{t('notifications')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{lang === 'hu' ? 'Gyógyszer emlékeztetők és teendő értesítések fogadása.' : lang === 'es' ? 'Recibe recordatorios de medicamentos y tareas.' : lang === 'de' ? 'Medikamenten- und Aufgabenerinnerungen erhalten.' : lang === 'fr' ? 'Recevez des rappels de médicaments et de tâches.' : 'Receive medication and task reminders.'}</p>
      {notifStatus === 'granted' && <Status className="bg-green-500/10 border-green-500/30 text-green-400">✅ {lang === 'hu' ? 'Értesítések engedélyezve' : 'Notifications enabled'}</Status>}
      {notifStatus === 'denied' && <Status className="bg-secondary border-border text-muted-foreground">🚫 {lang === 'hu' ? 'Értesítések letiltva a böngészőben. Engedélyezd a böngésző beállításaiban.' : 'Blocked in browser settings. Enable it from browser settings.'}</Status>}
      {notifStatus === 'unsupported' && <Status className="bg-yellow-500/10 border-yellow-500/30 text-yellow-400">⚠️ {lang === 'hu' ? 'Böngésző nem támogatja az értesítéseket.' : 'Browser does not support notifications.'}</Status>}
      {notifStatus === 'default' && <button onClick={onRequest} className="w-full py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-medium">{t('enable_notifications')}</button>}
    </div>
  );
}

function Status({ className, children }) {
  return <div className={`w-full py-2.5 rounded-xl border text-sm font-medium text-center ${className}`}>{children}</div>;
}