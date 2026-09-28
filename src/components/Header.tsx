/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Header component with branding.
 */

import { Music2 } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-cyan-500/30">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/40">
            <Music2 className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              QUANTIZE<span className="text-cyan-400">.IT</span>
            </h1>
            <p className="text-xs text-gray-400">MIDI Quantizer Pro</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-1 bg-gray-700/50 rounded border border-gray-600/50">v1.0</span>
          <span className="px-2 py-1 bg-gray-700/50 rounded border border-gray-600/50">Browser Edition</span>
        </div>
      </div>
    </header>
  );
}
