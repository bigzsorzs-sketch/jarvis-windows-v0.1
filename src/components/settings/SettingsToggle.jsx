import React from 'react';
import { Switch } from '@/components/ui/switch';

export default function SettingsToggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}