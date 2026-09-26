import { motion } from 'framer-motion';
import { Mic, Phone, Navigation, CheckCircle2, Bell, StickyNote, DollarSign, Droplets, UtensilsCrossed, UserPlus, Sparkles, Volume2 } from 'lucide-react';
import { useVoiceRuntime } from '@/hooks/useVoiceRuntime';
import { useState } from 'react';

const supportedActions = [
  {
    title: 'Call a contact',
    icon: Phone,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    examples: ['Hívd fel anyát', 'Tárcsázd Pétert', 'Call John'],
    description: 'Starts a phone call when the contact or phone number is recognized.'
  },
  {
    title: 'Start navigation',
    icon: Navigation,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    examples: ['Navigálj haza', 'Indulok Péterhez', 'Take me to work'],
    description: 'Opens navigation or starts a trip flow to a saved contact or destination.'
  },
  {
    title: 'Finish trip',
    icon: CheckCircle2,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    examples: ['Út vége', 'Finish trip'],
    description: 'Closes the active trip and saves the summary.'
  },
  {
    title: 'Create reminder',
    icon: Bell,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    examples: ['Emlékeztess holnap orvosra', 'Remind me to call Anna'],
    description: 'Creates a reminder from natural speech.'
  },
  {
    title: 'Create task',
    icon: CheckCircle2,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    examples: ['Írd fel hogy befizessem a számlát', 'Add a task to buy milk'],
    description: 'Adds a new to-do item.'
  },
  {
    title: 'Save note',
    icon: StickyNote,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    examples: ['Jegyezd meg hogy…', 'Create a note about the meeting'],
    description: 'Saves a short note quickly by voice.'
  },
  {
    title: 'Log finance',
    icon: DollarSign,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    examples: ['Fizettem 5000 forint benzint', 'Add 20 pounds expense for parking'],
    description: 'Logs income or expense entries.'
  },
  {
    title: 'Log blood sugar',
    icon: Droplets,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    examples: ['Vércukor 6.2 reggel', 'Blood sugar 5.8 before dinner'],
    description: 'Records a blood sugar reading with time of day.'
  },
  {
    title: 'Log meal',
    icon: UtensilsCrossed,
    color: 'text-lime-400',
    bg: 'bg-lime-500/10',
    examples: ['Ebéd csirke rizzsel 650 kalória', 'Breakfast oats 320 calories'],
    description: 'Adds a meal entry with optional calories.'
  },
  {
    title: 'Add contact',
    icon: UserPlus,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    examples: ['Add contact John 06301234567', 'Új kapcsolat Anna 06201234567'],
    description: 'Creates a contact with a name and optional phone number.'
  },
  {
    title: 'Open pages',
    icon: Sparkles,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    examples: ['Open finance', 'Ouvrez le calendrier', 'Öffne die Einstellungen'],
    description: 'Navigates directly to supported pages by voice.'
  }
];

const quickSteps = [
  'Tap the floating microphone button.',
  'Say one short command clearly.',
  'Wait for the assistant to confirm or ask for approval.',
  'Approve the action if needed.',
  'Repeat with your next command.'
];

export default function VoiceCommandHelp() {
  const voice = useVoiceRuntime();
  const [demoText, setDemoText] = useState('Hívd fel anyát');

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-24 space-y-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${voice.state.isListening ? 'bg-red-500/20' : 'bg-primary/20'}`}>
              <Mic className={voice.state.isListening ? 'text-red-400' : 'text-primary'} size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Voice Command Help</h1>
              <p className="text-sm text-muted-foreground">Learn what the assistant understands and how to speak to it.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-secondary border border-border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Status</p>
              <p className="text-sm font-semibold text-foreground">{voice.state.isListening ? 'Listening now' : 'Ready for voice commands'}</p>
            </div>
            <div className="rounded-2xl bg-secondary border border-border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Tip</p>
              <p className="text-sm text-foreground">Use short, direct phrases for the fastest results.</p>
            </div>
          </div>
        </motion.div>

        <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <h2 className="text-lg font-bold text-foreground">Quick start</h2>
          <div className="space-y-3">
            {quickSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {index + 1}
                </div>
                <p className="text-sm text-foreground pt-1">{step}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-secondary border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-primary" />
              <p className="text-sm font-semibold text-foreground">Try a sample phrase</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Hívd fel anyát', 'Navigálj haza', 'Vércukor 6.2 reggel', 'Open finance'].map((sample) => (
                <button
                  key={sample}
                  onClick={() => setDemoText(sample)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${demoText === sample ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border'}`}
                >
                  {sample}
                </button>
              ))}
            </div>
            <div className="rounded-xl bg-background border border-border px-4 py-3 text-sm text-foreground">
              {demoText}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">Supported voice actions</h2>
          <div className="space-y-3">
            {supportedActions.map((action) => {
              const Icon = action.icon;
              return (
                <motion.div
                  key={action.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl p-4"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${action.bg}`}>
                      <Icon size={18} className={action.color} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">{action.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {action.examples.map((example) => (
                      <span key={example} className="px-3 py-1.5 rounded-full bg-secondary text-xs text-foreground border border-border">
                        {example}
                      </span>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}