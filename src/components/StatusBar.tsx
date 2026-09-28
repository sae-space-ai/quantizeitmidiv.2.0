/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Status bar component.
 */

import { CheckCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

interface StatusBarProps {
  status: string;
  type: 'idle' | 'success' | 'error' | 'info' | 'loading';
}

export function StatusBar({ status, type }: StatusBarProps) {
  const icons = {
    idle: null,
    success: <CheckCircle className="w-4 h-4 text-green-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
    info: <Info className="w-4 h-4 text-blue-400" />,
    loading: <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />,
  };

  const bgColors = {
    idle: 'bg-gray-800/30 border-gray-700/30',
    success: 'bg-green-500/10 border-green-500/30',
    error: 'bg-red-500/10 border-red-500/30',
    info: 'bg-blue-500/10 border-blue-500/30',
    loading: 'bg-cyan-500/10 border-cyan-500/30',
  };

  const textColors = {
    idle: 'text-gray-500',
    success: 'text-green-300',
    error: 'text-red-300',
    info: 'text-blue-300',
    loading: 'text-cyan-300',
  };

  if (!status) return null;

  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${bgColors[type]}`}>
      {icons[type]}
      <span className={`text-sm ${textColors[type]}`}>{status}</span>
    </div>
  );
}
