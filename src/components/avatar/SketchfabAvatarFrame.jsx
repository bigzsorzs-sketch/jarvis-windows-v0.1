const KNOWN_SKETCHFAB_MODELS = {
  'https://skfb.ly/oKCn6': '0fba0ca632b8499f9ce07c8776282a39',
  'skfb.ly/oKCn6': '0fba0ca632b8499f9ce07c8776282a39',
};

function getSketchfabModelId(url = '') {
  const cleanUrl = String(url || '').trim();
  if (KNOWN_SKETCHFAB_MODELS[cleanUrl]) return KNOWN_SKETCHFAB_MODELS[cleanUrl];
  const modelMatch = cleanUrl.match(/models\/([a-f0-9]{32})\/embed/i);
  if (modelMatch?.[1]) return modelMatch[1];
  const slugMatch = cleanUrl.match(/-([a-f0-9]{32})(?:$|[/?#])/i);
  return slugMatch?.[1] || '';
}

export function isSketchfabAvatarUrl(url = '') {
  return /sketchfab\.com|skfb\.ly/i.test(String(url || ''));
}

export default function SketchfabAvatarFrame({ url, title = '3D avatar' }) {
  const modelId = getSketchfabModelId(url);
  const embedUrl = modelId
    ? `https://sketchfab.com/models/${modelId}/embed?autostart=1&ui_infos=0&ui_controls=0&ui_stop=0&ui_watermark=0&ui_hint=0&transparent=1`
    : String(url || '');

  return (
    <iframe
      title={title}
      src={embedUrl}
      className="h-full w-full border-0"
      allow="autoplay; fullscreen; xr-spatial-tracking"
      allowFullScreen
    />
  );
}