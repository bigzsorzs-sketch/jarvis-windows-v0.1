export function showAppDialogMessage(message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app-native-dialog', {
    detail: { type: 'message', message: String(message || '') },
  }));
}

export function requestAppDialogApproval(message, options = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const handleResult = (event) => {
      if (event.detail?.id !== id) return;
      window.removeEventListener('app-native-dialog-result', handleResult);
      resolve(Boolean(event.detail?.approved));
    };

    window.addEventListener('app-native-dialog-result', handleResult);
    window.dispatchEvent(new CustomEvent('app-native-dialog', {
      detail: {
        id,
        type: 'approval',
        message: String(message || ''),
        approveLabel: options.approveLabel || 'Törlés',
        cancelLabel: options.cancelLabel || 'Mégse',
      },
    }));
  });
}