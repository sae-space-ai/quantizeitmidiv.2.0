/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * File loader component with drag & drop support.
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, FileAudio, X } from 'lucide-react';
import type { MidiFileInfo } from '../types';

interface FileLoaderProps {
  onFileLoad: (file: File) => void;
  fileInfo: MidiFileInfo | null;
  isLoading: boolean;
  onClear: () => void;
}

export function FileLoader({ onFileLoad, fileInfo, isLoading, onClear }: FileLoaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (file && (file.name.endsWith('.mid') || file.name.endsWith('.midi'))) {
      onFileLoad(file);
    }
  }, [onFileLoad]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileLoad(file);
    }
  }, [onFileLoad]);

  if (fileInfo) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <FileAudio className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">{fileInfo.name}</p>
              <p className="text-gray-400 text-xs">
                {fileInfo.tracks.length} tracks • {fileInfo.ppq} PPQ • {fileInfo.tempo} BPM • {fileInfo.timeSignature[0]}/{fileInfo.timeSignature[1]}
              </p>
            </div>
          </div>
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
            title="Remove file"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
        ${isDragging
          ? 'border-cyan-400 bg-cyan-500/10'
          : 'border-gray-600 hover:border-gray-500 bg-gray-800/30 hover:bg-gray-800/50'
        }
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-cyan-400' : 'text-gray-500'}`} />
      <p className="text-white font-medium mb-1">
        {isLoading ? 'Loading...' : 'Drop MIDI file here or click to browse'}
      </p>
      <p className="text-gray-500 text-sm">
        Supports .mid and .midi files
      </p>
    </div>
  );
}
