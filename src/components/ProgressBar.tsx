/**
 * QUANTIZE.IT - Progress Bar Component
 * 
 * Shows quantization progress with percentage and message.
 * Supports cancellation.
 */

import { X } from 'lucide-react';

interface ProgressBarProps {
  progress: number; // 0-100
  message: string;
  onCancel?: () => void;
  isVisible: boolean;
}

export function ProgressBar({ progress, message, onCancel, isVisible }: ProgressBarProps) {
  if (!isVisible) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-300">{message}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-cyan-400">{Math.round(progress)}%</span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
