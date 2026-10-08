import React, { useState } from 'react';
import { invokeWithRetry } from '@/lib/llmGateway';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, ArrowLeftRight, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const languages = [
  { value: 'hu', label: 'Magyar' },
  { value: 'en', label: 'Angol' },
  { value: 'de', label: 'Német' },
  { value: 'fr', label: 'Francia' },
  { value: 'es', label: 'Spanyol' },
  { value: 'it', label: 'Olasz' },
  { value: 'ro', label: 'Román' },
  { value: 'sk', label: 'Szlovák' },
];

export default function TranslateTool() {
  const [sourceLang, setSourceLang] = useState('hu');
  const [targetLang, setTargetLang] = useState('en');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const translate = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    const sourceLabel = languages.find(l => l.value === sourceLang)?.label;
    const targetLabel = languages.find(l => l.value === targetLang)?.label;
    try {
      const result = await invokeWithRetry({
        prompt: `Fordítsd le a következő szöveget ${sourceLabel} nyelvről ${targetLabel} nyelvre. Csak a fordítást add vissza, semmi mást:\n\n${input}`,
      });
      setOutput(normalizeAssistantReply(result));
    } catch {
      setOutput('A fordítás most nem sikerült. Próbáld újra.');
    } finally {
      setIsLoading(false);
    }
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInput(output);
    setOutput(input);
  };

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/eszkozok" className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <Globe className="w-5 h-5 text-cyan-400" />
        <h1 className="text-xl font-bold text-foreground">Fordító</h1>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Select value={sourceLang} onValueChange={setSourceLang}>
          <SelectTrigger className="bg-secondary border-border rounded-xl flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={swapLanguages} className="rounded-full">
          <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Select value={targetLang} onValueChange={setTargetLang}>
          <SelectTrigger className="bg-secondary border-border rounded-xl flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border p-4 mb-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Írd be a szöveget..."
          className="bg-transparent border-none resize-none text-sm min-h-[100px] p-0 focus-visible:ring-0"
        />
      </Card>

      <Button onClick={translate} disabled={isLoading || !input.trim()} className="w-full bg-primary hover:bg-primary/90 rounded-xl mb-3">
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Fordítás
      </Button>

      {output && (
        <Card className="bg-secondary/50 border-border p-4">
          <p className="text-sm text-foreground leading-relaxed">{output}</p>
        </Card>
      )}
    </div>
  );
}
