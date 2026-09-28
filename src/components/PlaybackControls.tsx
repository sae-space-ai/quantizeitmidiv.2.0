/**
 * QUANTIZE.IT - Playback Controls Component
 * 
 * Reusable playback controls for all 7 contexts:
 * - Play/Pause/Stop
 * - Progress bar with seek
 * - Loop toggle
 * - Time display
 * - Context indicator
 * 
 * Synchronizes with unified playback hook.
 */

import { Play, Pause, Square, Repeat } from 'lucide-react';
import type { UnifiedPlaybackState } from '../hooks/useUnifiedPlayback';

interface PlaybackControlsProps {
  state: UnifiedPlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  contextLabel?: string;
  showProgress?: boolean;
}

export function PlaybackControls({
  state,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onToggleLoop,
  contextLabel,
  showProgress = true,
}: PlaybackControlsProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * state.duration;
    onSeek(time);
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
      {/* Context indicator */}
      {contextLabel && (
        <div className="text-xs text-gray-400 text-center">
          {contextLabel}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Stop button */}
        <button
          onClick={onStop}
          disabled={!state.isPlaying && !state.isPaused}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Stop"
        >
          <Square className="w-4 h-4" />
        </button>

        {/* Play/Pause button */}
        {state.isPlaying ? (
          <button
            onClick={onPause}
            className="p-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
            title="Pause"
          >
            <Pause className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onPlay}
            className="p-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
            title="Play"
          >
            <Play className="w-4 h-4" />
          </button>
        )}

        {/* Loop button */}
        <button
          onClick={onToggleLoop}
          className={`p-2 rounded transition-colors ${
            state.loopEnabled
              ? 'bg-yellow-600 hover:bg-yellow-500'
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title="Toggle loop"
        >
          <Repeat className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        {showProgress && (
          <div
            className="flex-1 h-2 bg-gray-700 rounded cursor-pointer relative"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-blue-500 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
            {state.loopEnabled && state.loopEnd > 0 && (
              <div
                className="absolute h-full bg-yellow-500/30 rounded"
                style={{
                  left: `${(state.loopStart / state.duration) * 100}%`,
                  width: `${((state.loopEnd - state.loopStart) / state.duration) * 100}%`,
                }}
              />
            )}
          </div>
        )}

        {/* Time display */}
        <div className="text-xs font-mono text-gray-300 min-w-[100px] text-right">
          {formatTime(state.currentTime)} / {formatTime(state.duration)}
        </div>
      </div>
    </div>
  );
}
