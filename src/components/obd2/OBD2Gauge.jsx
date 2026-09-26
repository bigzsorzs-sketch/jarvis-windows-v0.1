import { useEffect, useState } from 'react';

export default function OBD2Gauge({ metric, value, min = 0, max = 100, unit = '', color = '#28a745' }) {
  const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1) * 100;

  // Color based on value ranges
  let gaugeColor = color;
  if (percentage > 85) gaugeColor = '#dc3545'; // Red for danger
  else if (percentage > 70) gaugeColor = '#ffc107'; // Yellow for warning
  else gaugeColor = color;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative w-32 h-32 mb-2">
        {/* Outer circle */}
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 45}`}
            opacity="0.2"
          />
          {/* Progress arc */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={gaugeColor}
            strokeWidth="8"
            strokeDasharray={`${(percentage / 100) * 2 * Math.PI * 45} ${2 * Math.PI * 45}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
        </svg>
        {/* Value display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground">{Number(value || 0).toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">{unit}</div>
          </div>
        </div>
      </div>

      {/* Metric label */}
      <p className="text-sm font-semibold text-foreground text-center max-w-24">{metric}</p>

      {/* Range indicator */}
      <div className="w-full mt-2 text-xs text-muted-foreground flex justify-between px-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}