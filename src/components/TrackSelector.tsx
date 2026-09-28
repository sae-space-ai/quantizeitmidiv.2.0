/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Track selector component with multi-select support.
 */

import { ListMusic, CheckSquare, Square } from 'lucide-react';
import type { TrackInfo } from '../types';

interface TrackSelectorProps {
  tracks: TrackInfo[];
  selectedTracks: number[];
  onToggleTrack: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function TrackSelector({ tracks, selectedTracks, onToggleTrack, onSelectAll, onDeselectAll }: TrackSelectorProps) {
  if (tracks.length === 0) return null;

  const allSelected = tracks.filter(t => t.noteCount > 0).every(t => selectedTracks.includes(t.index));

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-medium text-white">Track Selection</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {tracks.map((track) => {
          const isSelected = selectedTracks.includes(track.index);
          const hasNotes = track.noteCount > 0;

          return (
            <button
              key={track.index}
              onClick={() => hasNotes && onToggleTrack(track.index)}
              disabled={!hasNotes}
              className={`
                w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between
                ${!hasNotes ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${isSelected
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                  : 'bg-gray-700/30 border border-transparent hover:bg-gray-700/50 text-gray-300'
                }
              `}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-500 flex-shrink-0" />
                )}
                <span className="truncate">
                  <span className="text-gray-500 mr-2">#{track.index + 1}</span>
                  {track.name}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                {track.isMonophonic && (
                  <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">Mono</span>
                )}
                {track.hasChords && (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">Chords</span>
                )}
                <span className="text-xs text-gray-500">
                  {track.noteCount} notes
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
