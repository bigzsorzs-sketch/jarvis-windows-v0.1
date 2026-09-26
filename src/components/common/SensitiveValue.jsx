import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function SensitiveValue({ children, maskedValue, className = '', buttonLabel = 'Megtekintés' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2 justify-end">
      <span className={className}>{visible ? children : maskedValue}</span>
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff size={12} /> : <Eye size={12} />}
        {visible ? 'Elrejtés' : buttonLabel}
      </button>
    </div>
  );
}