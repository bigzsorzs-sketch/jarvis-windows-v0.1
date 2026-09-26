import React, { useState } from 'react';
import { invokeWithRetry } from '@/lib/llmGateway';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Zap, FileText, Mail, Lightbulb, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const quickActions = [
  { icon: FileText, label: 'Összefoglalás', prompt: 'Foglald össze röviden a következő szöveget:' },
  { icon: Mail, label: 'Email írás', prompt: 'Írj egy professzionális emailt a következő témában:' },
  { icon: Lightbulb, label: 'Ötletek', prompt: 'Adj 5 kreatív ötletet a következő témában:' },
];

export default function QuickActions() {
  const [selectedAction, setSelectedAction] = useState(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async () => {
    if (!input.trim() || !selectedAction) return;
    setIsLoading(true);
    const response = await invokeWithRetry({
      prompt: `${selectedAction.prompt}\n\n${input}\n\nVálaszolj magyarul.`,
    });
    setResult(response);
    setIsLoading(false);
  };

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/eszkozok" className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <Zap className="w-5 h-5 text-yellow-400" />
        <h1 className="text-xl font-bold text-foreground">Gyors műveletek</h1>
      </div>

      <div className="space-y-2 mb-5">
        {quickActions.map(action => (
          <Card
            key={action.label}
            onClick={() => { setSelectedAction(action); setResult(''); }}
            className={`bg-card border-border p-4 flex items-center gap-3 cursor-pointer transition-colors ${
              selectedAction?.label === action.label ? 'ring-1 ring-primary bg-primary/5' : 'hover:bg-secondary/50'
            }`}
          >
            <action.icon className="w-5 h-5 text-yellow-400" />
            <span className="text-sm font-medium text-foreground">{action.label}</span>
          </Card>
        ))}
      </div>

      {selectedAction && (
        <div className="space-y-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Írd be a szöveget vagy témát..."
            className="bg-secondary border-border rounded-xl"
          />
          <Button onClick={handleAction} disabled={isLoading || !input.trim()} className="w-full bg-primary hover:bg-primary/90 rounded-xl">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Indítás
          </Button>
          {result && (
            <Card className="bg-secondary/50 border-border p-4">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{result}</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}