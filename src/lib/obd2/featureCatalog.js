/**
 * Product-ready OBD capability catalogue.
 * No capability is paywalled yet; suggestedTier is metadata for the future
 * subscription split so transport/protocol code does not need to be forked.
 */
export const OBD_CAPABILITIES = Object.freeze([
  { id: 'connect.auto', suggestedTier: 'core' },
  { id: 'connect.usb', suggestedTier: 'core' },
  { id: 'connect.bluetooth-classic', suggestedTier: 'core' },
  { id: 'connect.bluetooth-le', suggestedTier: 'core' },
  { id: 'connect.wifi', suggestedTier: 'pro' },
  { id: 'diagnostics.dtc-read', suggestedTier: 'core' },
  { id: 'diagnostics.dtc-clear', suggestedTier: 'core' },
  { id: 'diagnostics.vin', suggestedTier: 'core' },
  { id: 'live.basic', suggestedTier: 'core' },
  { id: 'live.extended', suggestedTier: 'pro' },
  { id: 'logging.trip', suggestedTier: 'pro' },
  { id: 'reports.ai-diagnosis', suggestedTier: 'pro' },
  { id: 'fleet.history', suggestedTier: 'business' },
]);

export function getObdCapability(id) {
  return OBD_CAPABILITIES.find((capability) => capability.id === id) || null;
}
