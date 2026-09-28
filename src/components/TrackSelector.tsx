/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Track selector component.
 */

import { ListMusic } from 'lucide-react';
import type { TrackInfo } from '../types';

interface TrackSelectorProps {
  tracks: TrackInfo[];
  selectedTrack: number;
  onSelectTrack: (index: number) => void;
}

export function TrackSelector({ tracks, selectedTrack, onSelectTrack }: TrackSelectorProps) {
  if (tracks.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ListMusic className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-medium text-white">Track Selection</h3>
      </div>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {tracks.map((track) => (
          <button
            key={track.index}
            onClick={() => onSelectTrack(track.index)}
            className={`
              w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between
              ${selectedTrack === track.index
                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                : 'bg-gray-700/30 border border-transparent hover:bg-gray-700/50 text-gray-300'
              }
            `}
          >
            <span className="truncate">
              <span className="text-gray-500 mr-2">#{track.index + 1}</span>
              {track.name}
            </span>
            <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
              {track.noteCount} notes
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
