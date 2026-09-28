/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Main application component.
 */

import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { FileLoader } from './components/FileLoader';
import { TrackSelector } from './components/TrackSelector';
import { QuantizePanel } from './components/QuantizePanel';
import { StatusBar } from './components/StatusBar';
import { loadMidiFile, quantizeMidi, exportMidiBlob } from './utils/midi-io';
import type { MidiFileInfo, QuantizeParams, QuantizeResult } from './types';
import { Midi } from '@tonejs/midi';

type StatusType = 'idle' | 'success' | 'error' | 'info' | 'loading';

function App() {
  const [midi, setMidi] = useState<Midi | null>(null);
  const [fileInfo, setFileInfo] = useState<MidiFileInfo | null>(null);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<StatusType>('idle');
  const [params, setParams] = useState<QuantizeParams>({
    ppq: 480,
    grid: '1/16',
    strength: 85,
    swing: 0,
    quantizeStarts: true,
    quantizeEnds: false,
    preserveVelocity: true,
    humanizeTicks: 0,
  });

  const handleFileLoad = useCallback(async (file: File) => {
    setIsProcessing(true);
    setStatus('Loading MIDI file...');
    setStatusType('loading');

    try {
      const { midi: loadedMidi, info } = await loadMidiFile(file);
      setMidi(loadedMidi);
      setFileInfo(info);
      setSelectedTrack(0);
      setParams(prev => ({ ...prev, ppq: info.ppq }));
      setStatus(`Loaded "${info.name}" — ${info.tracks.length} tracks, ${info.ppq} PPQ, ${info.tempo} BPM`);
      setStatusType('success');
    } catch (error) {
      setStatus(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setMidi(null);
    setFileInfo(null);
    setSelectedTrack(0);
    setStatus('');
    setStatusType('idle');
  }, []);

  const handleQuantize = useCallback(async () => {
    if (!midi || !fileInfo) return;

    setIsProcessing(true);
    setStatus('Quantizing...');
    setStatusType('loading');

    try {
      // Clone the MIDI to preserve original
      const midiClone = new Midi(midi.toArray());
      
      // Update PPQ from file info
      const quantizeParams = { ...params, ppq: fileInfo.ppq };
      
      // Quantize
      const result: QuantizeResult = quantizeMidi(midiClone, quantizeParams, selectedTrack, null);

      if (result.success) {
        // Export and download
        const blob = exportMidiBlob(midiClone);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quantized_${fileInfo.name}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setStatus(`✓ ${result.message} — ${result.notesQuantized} notes quantized. File downloaded!`);
        setStatusType('success');
      } else {
        setStatus(`Error: ${result.message}`);
        setStatusType('error');
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Quantization failed'}`);
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  }, [midi, fileInfo, params, selectedTrack]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* File Loader */}
        <FileLoader
          onFileLoad={handleFileLoad}
          fileInfo={fileInfo}
          isLoading={isProcessing}
          onClear={handleClear}
        />

        {/* Main Content */}
        {fileInfo && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Track Selector */}
            <div className="lg:col-span-1">
              <TrackSelector
                tracks={fileInfo.tracks}
                selectedTrack={selectedTrack}
                onSelectTrack={setSelectedTrack}
              />
              
              {/* Info Panel */}
              <div className="mt-4 bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                <h3 className="text-sm font-medium text-white mb-3">File Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Resolution</span>
                    <span className="text-gray-200 font-mono">{fileInfo.ppq} PPQ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tempo</span>
                    <span className="text-gray-200 font-mono">{fileInfo.tempo} BPM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Time Sig</span>
                    <span className="text-gray-200 font-mono">{fileInfo.timeSignature[0]}/{fileInfo.timeSignature[1]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Duration</span>
                    <span className="text-gray-200 font-mono">{fileInfo.duration.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Notes</span>
                    <span className="text-gray-200 font-mono">
                      {fileInfo.tracks.reduce((sum, t) => sum + t.noteCount, 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="mt-4 bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                <h3 className="text-sm font-medium text-white mb-3">Quick Presets</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setParams({ ...params, grid: '1/16', strength: 100, swing: 0, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🎯 Perfect Quantize (1/16, 100%)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/16', strength: 85, swing: 20, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🎸 Groove Quantize (1/16, 85%, Swing 20)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/16', strength: 70, swing: 0, humanizeTicks: 5 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🎹 Soft Quantize + Humanize (70%, ±5 ticks)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/8T', strength: 90, swing: 0, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🥁 Triplet Quantize (1/8T, 90%)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/32', strength: 100, swing: 0, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    ⚡ Tight 32nd Notes (1/32, 100%)
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Quantize Panel */}
            <div className="lg:col-span-2">
              <QuantizePanel
                params={params}
                onChangeParams={setParams}
                onQuantize={handleQuantize}
                isProcessing={isProcessing}
                disabled={!midi}
              />
            </div>
          </div>
        )}

        {/* Status Bar */}
        <StatusBar status={status} type={statusType} />

        {/* Footer Info */}
        {!fileInfo && (
          <div className="mt-8 text-center">
            <div className="inline-block bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 max-w-lg">
              <h2 className="text-lg font-semibold text-white mb-2">How it works</h2>
              <ol className="text-sm text-gray-400 text-left space-y-2 list-decimal list-inside">
                <li>Load a MIDI file (.mid or .midi)</li>
                <li>Select the track you want to quantize</li>
                <li>Choose a grid division (1/4 to 1/32, including triplets)</li>
                <li>Adjust strength, swing, and humanize parameters</li>
                <li>Click "Quantize & Download" to get your processed MIDI</li>
              </ol>
              <div className="mt-4 pt-4 border-t border-gray-700/30">
                <p className="text-xs text-gray-500">
                  Supports: Binary grids (1/4, 1/8, 1/16, 1/32) • Triplet grids (1/4T, 1/8T, 1/16T) • 
                  Strength 0-100% • Swing • Humanize • Velocity preservation • Note collision handling
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-800 py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-xs text-gray-600">
          <span>QUANTIZE.IT — MIDI Quantizer Pro v1.0</span>
          <span>All processing happens in your browser. No files are uploaded.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
