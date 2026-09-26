import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

export default function InterestsInput({ interests, onChange }) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      const newInterest = inputValue.trim().replace(/,$/, '');
      if (newInterest && !interests.includes(newInterest)) {
        onChange([...interests, newInterest]);
      }
      setInputValue('');
    }
  };

  const removeInterest = (interest) => {
    onChange(interests.filter(i => i !== interest));
  };

  return (
    <div>
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">Érdeklődési körök</p>
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Pl: technológia, tőzsde, sport..."
        className="bg-secondary border-border rounded-xl text-sm mb-3"
      />
      <div className="flex gap-2 flex-wrap">
        {interests.map(interest => (
          <Badge
            key={interest}
            variant="outline"
            className="bg-primary/10 text-primary border-primary/30 px-3 py-1 text-xs cursor-pointer hover:bg-primary/20"
            onClick={() => removeInterest(interest)}
          >
            {interest}
            <X className="w-3 h-3 ml-1.5" />
          </Badge>
        ))}
      </div>
    </div>
  );
}