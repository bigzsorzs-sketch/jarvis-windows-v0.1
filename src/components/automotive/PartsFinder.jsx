import { useState, useEffect } from 'react';
import { memo } from 'react';
import { invokeWithRetry } from '@/lib/llmGateway';
import { Loader2, ExternalLink, ShoppingCart, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PartsFinder = memo(function PartsFinder({ diagnosis, errorCodes, onPartsLoaded }) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!diagnosis || errorCodes.length === 0) {
      setLoading(false);
      setError('Még nincs elég adat az alkatrészjavaslathoz.');
      return;
    }

    fetchParts();
  }, [diagnosis, errorCodes]);

  useEffect(() => {
    if (onPartsLoaded && parts.length > 0) {
      onPartsLoaded(parts);
    }
  }, [parts, onPartsLoaded]);

  const fetchParts = async () => {
    setLoading(true);
    setError(null);

    try {
      const codesText = errorCodes.join(', ');
      const prompt = `Te egy autó-alkatrész szakértő vagy. A következő hibakódokhoz (${codesText}) javasold meg a valószínű hibás alkatrészeket.

JSON formátumban válaszolj exakt így:
{
  "parts": [
    {
      "name": "alkatrész neve",
      "code": "P0XXX hibakód",
      "description": "rövid leírás miért szükséges",
      "type": "típus (motor, elektromosság, szenzor stb.)",
      "sources": [
        {"name": "eBay", "url": "https://ebay.com/search?q=..."},
        {"name": "Amazon", "url": "https://amazon.com/s?k=..."},
        {"name": "AliExpress", "url": "https://aliexpress.com/wholesale?SearchText=..."}
      ],
      "estimated_cost_gbp": "50-150"
    }
  ]
}

Ne adj mást mint JSON-t!`;

      const response = await invokeWithRetry({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            parts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  code: { type: 'string' },
                  description: { type: 'string' },
                  type: { type: 'string' },
                  sources: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        url: { type: 'string' },
                      },
                    },
                  },
                  estimated_cost_gbp: { type: 'string' },
                },
              },
            },
          },
        },
      });

      const rawResult = response?.data?.result ?? response?.data ?? response;
      const parsedResponse = typeof rawResult === 'string'
        ? JSON.parse(rawResult.replace(/```json|```/g, '').trim())
        : rawResult;
      setParts(parsedResponse?.parts || []);
    } catch (err) {
      console.error('Parts lookup error:', err);
      setError('Az alkatrészeket most nem tudtuk betölteni. Próbáld meg újra később.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-400">Hiba</p>
          <p className="text-xs text-red-300 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Nincs javasolt alkatrész ehhez a diagnosztikához.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart size={18} className="text-primary" />
        <h3 className="text-base font-semibold text-foreground">
          Javasolt alkatrészek ({parts.length})
        </h3>
      </div>

      <AnimatePresence>
        {parts.map((part, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-card border border-border rounded-2xl p-4 space-y-3"
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{part.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-mono">
                    {part.code}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-xs">
                    {part.type}
                  </span>
                </div>
              </div>
              <span className="text-sm font-bold text-accent">£{part.estimated_cost_gbp}</span>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {part.description}
            </p>

            {/* Sources */}
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-foreground mb-2">Beszerzési források:</p>
              <div className="flex flex-wrap gap-2">
                {part.sources?.map((source, sidx) => (
                  <a
                    key={sidx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-primary/20 text-xs font-medium text-foreground flex items-center gap-1.5 transition-colors"
                  >
                    {source.name}
                    <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-3 text-xs text-blue-400">
        ℹ️ Az árak és források tájékoztató jellegűek. Az alkatrészek típusazonosságát ellenőrizd az autód dokumentációjában!
      </div>
    </div>
  );
});

export default PartsFinder;