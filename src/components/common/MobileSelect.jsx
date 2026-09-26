import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

/**
 * MobileSelect — drop-in replacement for <select> using a bottom-sheet Drawer.
 *
 * Props:
 *  value       – current value
 *  onChange    – (value) => void
 *  options     – [{ value, label }]
 *  placeholder – string shown when no value selected
 *  className   – extra classes for the trigger button
 */
export default function MobileSelect({ value, onChange, options = [], placeholder = 'Válassz...', className = '', disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const titleId = `mobile-select-${String(placeholder).toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={selected ? `${placeholder}: ${selected.label}` : placeholder}
        className={`flex items-center justify-between gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none w-full min-h-[44px] focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${className}`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="text-muted-foreground shrink-0" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle id={titleId}>{placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-1.5 max-h-[60vh] overflow-y-auto">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                aria-pressed={value === opt.value}
                className={`w-full flex items-center justify-between px-4 py-3 min-h-[44px] rounded-2xl text-sm font-medium transition-all ${
                  value === opt.value
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-secondary text-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
                {value === opt.value && <Check size={15} className="text-primary" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}