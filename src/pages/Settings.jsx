import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jarvis } from '@/api/jarvisClient';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Lock, Download, RotateCcw, RefreshCw, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import PersonalitySelector from '@/components/settings/PersonalitySelector';
import AgeGroupSelector from '@/components/settings/AgeGroupSelector';
import FocusModeSelector from '@/components/settings/FocusModeSelector';
import SettingsToggle from '@/components/settings/SettingsToggle';
import InterestsInput from '@/components/settings/InterestsInput';

const defaultSettings = {
  ai_name: 'Alexa',
  personality: 'kedves',
  age_group: 'felnott',
  interests: [],
  focus_mode: 'altalanos',
  self_correction: false,
  learning_memory: true,
  supervised_updates: true,
  web_search: true,
  stock_analysis: true,
  auto_market: true,
};

export default function Settings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(defaultSettings);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: settingsList } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const user = await jarvis.auth.me();
      return user?.email ? jarvis.entities.UserSettings.filter({ created_by: user.email }) : [];
    },
    initialData: [],
  });

  useEffect(() => {
    if (settingsList.length > 0 && !hasLoaded) {
      setSettings({ ...defaultSettings, ...settingsList[0] });
      setHasLoaded(true);
    }
  }, [settingsList, hasLoaded]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settingsList.length > 0) {
        return jarvis.entities.UserSettings.update(settingsList[0].id, data);
      } else {
        const user = await jarvis.auth.me();
        return jarvis.entities.UserSettings.create({ ...data, created_by: user.email });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-settings'] }),
  });

  const updateField = (field, value) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    saveMutation.mutate(updated);
  };

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Beállítások</h1>
      </div>

      <div className="space-y-4">
        {/* Személyre szabás */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-card border-border p-5 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Személyre szabás</h2>

            <div>
              <Label className="text-xs text-muted-foreground">AI neve</Label>
              <Input
                value={settings.ai_name}
                onChange={(e) => updateField('ai_name', e.target.value)}
                className="bg-secondary border-border rounded-xl text-sm mt-1"
              />
            </div>

            <PersonalitySelector value={settings.personality} onChange={(v) => updateField('personality', v)} />
            <AgeGroupSelector value={settings.age_group} onChange={(v) => updateField('age_group', v)} />
            <InterestsInput interests={settings.interests || []} onChange={(v) => updateField('interests', v)} />
            <FocusModeSelector value={settings.focus_mode} onChange={(v) => updateField('focus_mode', v)} />
          </Card>
        </motion.div>

        {/* Toggles */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-card border-border px-5 py-2 divide-y divide-border">
            <SettingsToggle label="Önjavítás" checked={settings.self_correction} onChange={(v) => updateField('self_correction', v)} />
            <SettingsToggle label="Tanuló memória" checked={settings.learning_memory} onChange={(v) => updateField('learning_memory', v)} />
            <SettingsToggle label="Felügyelt frissítések" checked={settings.supervised_updates} onChange={(v) => updateField('supervised_updates', v)} />
            <SettingsToggle label="Webes keresés" checked={settings.web_search} onChange={(v) => updateField('web_search', v)} />
            <SettingsToggle label="Tőzsdei elemzés" checked={settings.stock_analysis} onChange={(v) => updateField('stock_analysis', v)} />
            <SettingsToggle label="Autópiac" checked={settings.auto_market} onChange={(v) => updateField('auto_market', v)} />
          </Card>
        </motion.div>

        {/* Biztonság */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Biztonság</h2>
            </div>
            <p className="text-xs text-muted-foreground">Adataid biztonságosan tárolódnak a felhőben.</p>
          </Card>
        </motion.div>

        {/* Action buttons */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-2">
          <Card className="bg-card border-border p-4 flex items-center gap-3 cursor-pointer hover:bg-secondary/50 transition-colors">
            <Download className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-foreground flex-1">Beszélgetés exportálása</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Card>
          <Card className="bg-card border-border p-4 flex items-center gap-3 cursor-pointer hover:bg-secondary/50 transition-colors">
            <RotateCcw className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-foreground flex-1">Setup újraindítása</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Card>
          <Card className="bg-card border-border p-4 flex items-center gap-3 cursor-pointer hover:bg-secondary/50 transition-colors">
            <RefreshCw className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-foreground flex-1">Viselkedés frissítések</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Card>
        </motion.div>
      </div>
    </div>
  );
}