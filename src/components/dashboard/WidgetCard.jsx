import { GripVertical, Eye, EyeOff } from 'lucide-react';

export default function WidgetCard({ children, title, editMode, dragHandleProps }) {
  return (
    <div className={`bg-card rounded-2xl border transition-all ${editMode ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-border'}`}>
      {editMode && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground touch-none">
            <GripVertical size={16} />
          </div>
          <span className="text-xs font-medium text-primary flex-1">{title}</span>
        </div>
      )}
      <div className={editMode ? 'px-4 pb-4 pt-1' : ''}>
        {children}
      </div>
    </div>
  );
}