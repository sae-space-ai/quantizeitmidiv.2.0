/**
 * QUANTIZE.IT - Audio Loader Component
 * 
 * Loads audio files (WAV, MP3, FLAC, OGG) and displays metadata.
 * Separate from MIDI loader - uses independent state.
 */

import { useCallback, useRef, useState } from 'react';
import { Music, FileAudio, X, AlertCircle } from 'lucide-react';
import { decodeAudioFile, generateWaveform, verifyAudioFile, type AudioFileInfo, type WaveformData } from '../utils/audio-import';
import { WaveformView } from './WaveformView';

interface AudioLoaderProps {
  onAudioLoad?: (info: AudioFileInfo, waveform: WaveformData, audioBuffer: AudioBuffer) => void;
  onAudioClear?: () => void;
  audioInfo?: AudioFileInfo | null;
  waveformData?: WaveformData | null;
  selectionStart?: number;
  selectionEnd?: number;
  onSelectionChange?: (start: number, end: number) => void;
  playbackPosition?: number;
}

export function AudioLoader({
  onAudioLoad,
  onAudioClear,
  audioInfo,
  waveformData,
  selectionStart,
  selectionEnd,
  onSelectionChange,
  playbackPosition,
}: AudioLoaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);

    try {
      const { audioBuffer: buffer, info } = await decodeAudioFile(file);
      
      // Verify integrity
      const verification = verifyAudioFile(buffer);
      if (!verification.valid) {
        throw new Error(verification.message);
      }

      // Generate waveform
      const waveform = generateWaveform(buffer, 1500);

      setAudioBuffer(buffer);
      onAudioLoad?.(info, waveform, buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load audio';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onAudioLoad]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClear = useCallback(() => {
    setAudioBuffer(null);
    setError(null);
    onAudioClear?.();
  }, [onAudioClear]);

  // Show loaded audio info
  if (audioInfo) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <FileAudio className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">{audioInfo.name}</p>
              <p className="text-gray-400 text-xs">
                {audioInfo.format.toUpperCase()} • {audioInfo.numberOfChannels} ch • {audioInfo.sampleRate} Hz • {formatDuration(audioInfo.duration)}
              </p>
            </div>
          </div>
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
            title="Remove audio"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Waveform */}
        <WaveformView
          waveformData={waveformData || null}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          onSelectionChange={onSelectionChange}
          playbackPosition={playbackPosition}
        />

        {selectionStart !== undefined && selectionEnd !== undefined && (
          <div className="text-xs text-green-400">
            Selection: {formatDuration(selectionStart)} → {formatDuration(selectionEnd)} ({formatDuration(selectionEnd - selectionStart)})
          </div>
        )}
      </div>
    );
  }

  // Show loader
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all
        ${isDragging
          ? 'border-purple-400 bg-purple-500/10'
          : 'border-gray-600 hover:border-gray-500 bg-gray-800/30 hover:bg-gray-800/50'
        }
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/wav,audio/mp3,audio/mpeg,audio/flac,audio/ogg,audio/aac,audio/mp4,audio/x-m4a,.wav,.mp3,.flac,.ogg,.aac,.m4a"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Music className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-purple-400' : 'text-gray-500'}`} />
      <p className="text-white font-medium text-sm mb-1">
        {isLoading ? 'Loading audio...' : 'Load Audio (WAV, MP3, FLAC, OGG)'}
      </p>
      <p className="text-gray-500 text-xs">
        For transcription to MIDI
      </p>
      {error && (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-400 justify-center">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${secs}.${ms.toString().padStart(2, '0')}s`;
}
