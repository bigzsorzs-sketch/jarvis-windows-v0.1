import React from 'react';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/card';

const toolNames = {
  '/tools/finance': 'Pénzügy',
  '/tools/invoices': 'Számlák',
  '/tools/scan': 'Szkennelés',
  '/tools/templates': 'Sablonok',
  '/tools/health': 'Egészség trendek',
};

export default function GenericTool() {
  const location = useLocation();
  const toolName = toolNames[location.pathname] || 'Eszköz';

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/tools" className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <Wrench className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">{toolName}</h1>
      </div>

      <Card className="bg-card border-border p-8 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Wrench className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground text-sm text-center">
          Ez a funkció hamarosan elérhető lesz.
        </p>
        <p className="text-muted-foreground/60 text-xs text-center mt-1">
          Kérj AI segítséget a Chat oldalon!
        </p>
      </Card>
    </div>
  );
}