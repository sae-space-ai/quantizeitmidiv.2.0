/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Comparison view showing before/after differences.
 */

import { BarChart3, ArrowRight } from 'lucide-react';
import type { ComparisonResult } from '../types';

interface ComparisonViewProps {
  comparisons: ComparisonResult[];
}

export function ComparisonView({ comparisons }: ComparisonViewProps) {
  if (comparisons.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Before / After Comparison</h3>
      </div>

      <div className="space-y-3">
        {comparisons.map((comp) => (
          <div
            key={comp.trackIndex}
            className="bg-gray-700/30 rounded-lg p-3 border border-gray-600/30"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-white">
                Track {comp.trackIndex + 1}: {comp.trackName}
              </h4>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-gray-400">{comp.totalNotes} notes</span>
                <ArrowRight className="w-3 h-3 text-gray-500" />
                <span className="text-cyan-400">{comp.movedNotes} moved</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-gray-400">Moved</div>
                <div className="text-cyan-300 font-mono">{comp.movedNotes}</div>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-gray-400">Unchanged</div>
                <div className="text-green-300 font-mono">{comp.unchangedNotes}</div>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-gray-400">Max shift</div>
                <div className="text-yellow-300 font-mono">{comp.maxDisplacementMs}ms</div>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-gray-400">Avg shift</div>
                <div className="text-purple-300 font-mono">{comp.avgDisplacementMs}ms</div>
              </div>
            </div>

            {comp.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-600/30">
                <p className="text-xs text-yellow-400 mb-1">Warnings:</p>
                <ul className="text-xs text-gray-400 space-y-0.5">
                  {comp.warnings.slice(0, 3).map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
