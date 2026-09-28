/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Main application component.
 * 
 * Flow: Load MIDI → Parse → Select track/params → Quantize → Download result.
 * Uses ArrayBuffer cloning to preserve original and process a copy.
 */

import { useState, useCallback, useRef } from 'react';
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
  // Store original ArrayBuffer to allow re-quantization from scratch
  const originalBufferRef = useRef<ArrayBuffer | null>(null);
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
      // Validate file size
      if (file.size === 0) {
        throw new Error('File is empty');
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('File is too large (max 50MB)');
      }

      // Read file as ArrayBuffer and store for re-quantization
      const arrayBuffer = await file.arrayBuffer();
      originalBufferRef.current = arrayBuffer.slice(0); // Clone the buffer

      // Parse MIDI
      const { midi: loadedMidi, info } = await loadMidiFile(file);

      // Validate we have at least one track with notes
      const hasNotes = info.tracks.some(t => t.noteCount > 0);
      if (!hasNotes) {
        throw new Error('MIDI file has no notes in any track');
      }

      setMidi(loadedMidi);
      setFileInfo(info);
      setSelectedTrack(0);
      setParams(prev => ({ ...prev, ppq: info.ppq }));

      const totalNotes = info.tracks.reduce((sum, t) => sum + t.noteCount, 0);
      setStatus(`✓ Loaded "${info.name}" — ${info.tracks.length} tracks, ${totalNotes} notes, ${info.ppq} PPQ, ${info.tempo} BPM`);
      setStatusType('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading file';
      setStatus(`✗ Error: ${message}`);
      setStatusType('error');
      setMidi(null);
      setFileInfo(null);
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
    originalBufferRef.current = null;
  }, []);

  const handleQuantize = useCallback(async () => {
    if (!originalBufferRef.current || !fileInfo) {
      setStatus('✗ No MIDI file loaded');
      setStatusType('error');
      return;
    }

    setIsProcessing(true);
    setStatus('Processing quantization...');
    setStatusType('loading');

    // Use setTimeout to allow UI to update before heavy processing
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // Create fresh Midi from original buffer (never modify original)
      const freshMidi = new Midi(originalBufferRef.current.slice(0));

      // Validate track
      const track = freshMidi.tracks[selectedTrack];
      if (!track) {
        throw new Error(`Track ${selectedTrack} not found`);
      }
      if (track.notes.length === 0) {
        throw new Error('Selected track has no notes');
      }

      // Set up quantization parameters with correct PPQ
      const quantizeParams: QuantizeParams = { ...params, ppq: fileInfo.ppq };

      // Perform quantization
      const result: QuantizeResult = quantizeMidi(freshMidi, quantizeParams, selectedTrack, null);

      if (!result.success) {
        throw new Error(result.message);
      }

      // Export quantized MIDI
      const blob = exportMidiBlob(freshMidi);

      // Validate blob
      if (blob.size === 0) {
        throw new Error('Generated MIDI file is empty');
      }

      // Generate download filename
      const originalName = fileInfo.name.replace(/\.(mid|midi)$/i, '');
      const gridLabel = params.grid.replace('/', '');
      const downloadName = `${originalName}_q${gridLabel}_s${params.strength}.mid`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Cleanup after a delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);

      setStatus(`✓ Success! ${result.notesQuantized} events quantized. Downloaded "${downloadName}" (${(blob.size / 1024).toFixed(1)} KB)`);
      setStatusType('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quantization failed';
      setStatus(`✗ Error: ${message}`);
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  }, [fileInfo, params, selectedTrack]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Header />
      
      <main className="flex-1 max-w-5xl mx-auto px-4 py-6 space-y-5 w-full">
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
            {/* Left: Track Selector + Info + Presets */}
            <div className="lg:col-span-1 space-y-4">
              <TrackSelector
                tracks={fileInfo.tracks}
                selectedTrack={selectedTrack}
                onSelectTrack={setSelectedTrack}
              />
              
              {/* Info Panel */}
              <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
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
                  <div className="flex justify-between">
                    <span className="text-gray-400">Selected Track</span>
                    <span className="text-cyan-300 font-mono">
                      {fileInfo.tracks[selectedTrack]?.noteCount ?? 0} notes
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
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
                    🎹 Soft + Humanize (70%, ±5 ticks)
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
            <div className="inline-block bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 max-w-lg text-left">
              <h2 className="text-lg font-semibold text-white mb-3 text-center">How it works</h2>
              <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                <li>Load a MIDI file (.mid or .midi)</li>
                <li>Select the track you want to quantize</li>
                <li>Choose a grid division (1/4 to 1/32, including triplets)</li>
                <li>Adjust strength, swing, and humanize parameters</li>
                <li>Click <strong className="text-cyan-400">Quantize & Download</strong> to get your processed MIDI</li>
              </ol>
              <div className="mt-4 pt-4 border-t border-gray-700/30">
                <p className="text-xs text-gray-500">
                  <strong>Features:</strong> Binary grids (1/4, 1/8, 1/16, 1/32) • Triplet grids (1/4T, 1/8T, 1/16T) • 
                  Strength 0–100% • Swing • Humanize • Velocity preservation • 
                  Monophonic/polyphonic detection • Tempo change support • Note collision handling
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-600 gap-2">
          <span>QUANTIZE.IT — MIDI Quantizer Pro v1.0</span>
          <span>All processing happens locally in your browser. No files are uploaded to any server.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
