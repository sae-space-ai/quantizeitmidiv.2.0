/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Main application component.
 * 
 * Features:
 * - Multi-track selection
 * - Before/after comparison
 * - Downloadable report
 * - Undo/reset
 * - MIDI verification after export
 * - Musical presets
 */

import { useState, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { FileLoader } from './components/FileLoader';
import { TrackSelector } from './components/TrackSelector';
import { QuantizePanel } from './components/QuantizePanel';
import { StatusBar } from './components/StatusBar';
import { ComparisonView } from './components/ComparisonView';
import { ReportPanel } from './components/ReportPanel';
import {
  loadMidiFile,
  quantizeMidi,
  exportMidiBlob,
  createMidiSnapshot,
  compareSnapshots,
  verifyMidiBlob,
  generateTextReport,
} from './utils/midi-io';
import type {
  MidiFileInfo,
  QuantizeParams,
  QuantizeResult,
  MidiSnapshot,
  ComparisonResult,
} from './types';
import { Midi } from '@tonejs/midi';

type StatusType = 'idle' | 'success' | 'error' | 'info' | 'loading';

function App() {
  // Store original ArrayBuffer for re-quantization
  const originalBufferRef = useRef<ArrayBuffer | null>(null);
  const [midi, setMidi] = useState<Midi | null>(null);
  const [fileInfo, setFileInfo] = useState<MidiFileInfo | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<StatusType>('idle');

  // Before/after snapshots
  const [beforeSnapshot, setBeforeSnapshot] = useState<MidiSnapshot | null>(null);
  const [afterSnapshot, setAfterSnapshot] = useState<MidiSnapshot | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);

  // Quantization result and report
  const [lastResult, setLastResult] = useState<QuantizeResult | null>(null);

  // Last exported blob for verification
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [verificationResult, setVerificationResult] = useState<string>('');
  const [tempoInfo, setTempoInfo] = useState<string>('');

  const [params, setParams] = useState<QuantizeParams>({
    ppq: 480,
    grid: '1/16',
    strength: 85,
    swing: 0,
    quantizeStarts: true,
    quantizeEnds: false,
    preserveVelocity: true,
    humanizeTicks: 0,
    outputTempo: 56,
  });

  const handleFileLoad = useCallback(async (file: File) => {
    setIsProcessing(true);
    setStatus('Loading MIDI file...');
    setStatusType('loading');

    try {
      if (file.size === 0) throw new Error('File is empty');
      if (file.size > 50 * 1024 * 1024) throw new Error('File too large (max 50MB)');

      const arrayBuffer = await file.arrayBuffer();
      originalBufferRef.current = arrayBuffer.slice(0);

      const { midi: loadedMidi, info } = await loadMidiFile(file);

      const hasNotes = info.tracks.some(t => t.noteCount > 0);
      if (!hasNotes) throw new Error('MIDI file has no notes');

      setMidi(loadedMidi);
      setFileInfo(info);

      // Select all tracks with notes by default
      const tracksWithNotes = info.tracks.filter(t => t.noteCount > 0).map(t => t.index);
      setSelectedTracks(tracksWithNotes);

      setParams(prev => ({ ...prev, ppq: info.ppq }));

      // Create before snapshot
      const snapshot = createMidiSnapshot(loadedMidi, info.name);
      setBeforeSnapshot(snapshot);
      setAfterSnapshot(null);
      setComparisons([]);
      setLastResult(null);
      setLastBlob(null);
      setVerificationResult('');

      const totalNotes = info.tracks.reduce((sum, t) => sum + t.noteCount, 0);
      setStatus(`✓ Loaded "${info.name}" — ${info.tracks.length} tracks, ${totalNotes} notes, ${info.ppq} PPQ, ${info.tempo} BPM`);
      setStatusType('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
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
    setSelectedTracks([]);
    setStatus('');
    setStatusType('idle');
    originalBufferRef.current = null;
    setBeforeSnapshot(null);
    setAfterSnapshot(null);
    setComparisons([]);
    setLastResult(null);
    setLastBlob(null);
    setVerificationResult('');
    setTempoInfo('');
  }, []);

  const handleReset = useCallback(() => {
    if (!originalBufferRef.current || !fileInfo) return;

    // Reload from original buffer
    const freshMidi = new Midi(originalBufferRef.current.slice(0));
    setMidi(freshMidi);

    const snapshot = createMidiSnapshot(freshMidi, fileInfo.name);
    setBeforeSnapshot(snapshot);
    setAfterSnapshot(null);
    setComparisons([]);
    setLastResult(null);
    setLastBlob(null);
    setVerificationResult('');
    setTempoInfo('');

    setStatus('✓ Reset to original. Ready to quantize again.');
    setStatusType('info');
  }, [fileInfo]);

  const handleQuantize = useCallback(async () => {
    if (!originalBufferRef.current || !fileInfo) {
      setStatus('✗ No MIDI file loaded');
      setStatusType('error');
      return;
    }

    if (selectedTracks.length === 0) {
      setStatus('✗ No tracks selected');
      setStatusType('error');
      return;
    }

    setIsProcessing(true);
    setStatus('Processing quantization...');
    setStatusType('loading');

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // Create fresh Midi from original buffer
      const freshMidi = new Midi(originalBufferRef.current.slice(0));
      const quantizeParams: QuantizeParams = { ...params, ppq: fileInfo.ppq };

      // Perform quantization
      const result = quantizeMidi(freshMidi, quantizeParams, selectedTracks, null);

      if (!result.success) {
        throw new Error(result.message);
      }

      // Update MIDI state
      setMidi(freshMidi);
      setLastResult(result);

      // Create after snapshot
      const afterSnap = createMidiSnapshot(freshMidi, fileInfo.name);
      setAfterSnapshot(afterSnap);

      // Generate comparisons
      if (beforeSnapshot) {
        const comps = selectedTracks.map(trackIdx =>
          compareSnapshots(beforeSnapshot, afterSnap, trackIdx)
        );
        setComparisons(comps);
      }

      // Export and verify
      const blob = exportMidiBlob(freshMidi);
      if (blob.size === 0) throw new Error('Generated MIDI is empty');

      setLastBlob(blob);

      // Verify the MIDI
      const verification = await verifyMidiBlob(blob);
      setVerificationResult(verification.message);
      setTempoInfo(verification.tempoInfo || '');

      if (!verification.valid) {
        throw new Error(`MIDI verification failed: ${verification.message}`);
      }

      // Verify constant tempo
      if (verification.tempoInfo && !verification.tempoInfo.includes('Single tempo')) {
        const warning = 'Warning: MIDI does not have a single constant tempo';
        setTempoInfo(prev => prev + ' - ' + warning);
      }

      // Trigger download
      const originalName = fileInfo.name.replace(/\.(mid|midi)$/i, '');
      const gridLabel = params.grid.replace('/', '');
      const downloadName = `${originalName}_q${gridLabel}_s${params.strength}.mid`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);

      setStatus(`✓ ${result.message}. Downloaded "${downloadName}" (${(blob.size / 1024).toFixed(1)} KB). Verified: ${verification.message}`);
      setStatusType('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quantization failed';
      setStatus(`✗ Error: ${message}`);
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  }, [fileInfo, params, selectedTracks, beforeSnapshot]);

  const handleDownloadReport = useCallback(() => {
    if (!lastResult?.report || !fileInfo) return;

    const reportText = generateTextReport(lastResult.report, fileInfo.name);
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quantize_report_${fileInfo.name.replace(/\.(mid|midi)$/i, '')}.txt`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);

    setStatus('✓ Report downloaded');
    setStatusType('success');
  }, [lastResult, fileInfo]);

  const handleDownloadMidi = useCallback(() => {
    if (!lastBlob || !fileInfo) return;

    const originalName = fileInfo.name.replace(/\.(mid|midi)$/i, '');
    const gridLabel = params.grid.replace('/', '');
    const downloadName = `${originalName}_q${gridLabel}_s${params.strength}.mid`;

    const url = URL.createObjectURL(lastBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);
  }, [lastBlob, fileInfo, params]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-6 space-y-5 w-full">
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
            {/* Left: Track Selector + Info */}
            <div className="lg:col-span-1 space-y-4">
              <TrackSelector
                tracks={fileInfo.tracks}
                selectedTracks={selectedTracks}
                onToggleTrack={(index) => {
                  setSelectedTracks(prev =>
                    prev.includes(index)
                      ? prev.filter(i => i !== index)
                      : [...prev, index]
                  );
                }}
                onSelectAll={() => {
                  setSelectedTracks(fileInfo.tracks.filter(t => t.noteCount > 0).map(t => t.index));
                }}
                onDeselectAll={() => setSelectedTracks([])}
              />

              {/* File Info */}
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
                  {fileInfo.tempoChanges.length > 1 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Tempo changes</span>
                      <span className="text-yellow-300 font-mono">{fileInfo.tempoChanges.length}</span>
                    </div>
                  )}
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
                    <span className="text-gray-400">Selected</span>
                    <span className="text-cyan-300 font-mono">
                      {selectedTracks.length} track(s)
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
                    🎯 Perfect 16th Notes (100%)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/16', strength: 85, swing: 20, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🎸 Groove (1/16, 85%, Swing 20)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/16', strength: 70, swing: 0, humanizeTicks: 5 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🎹 Soft + Humanize (70%)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/8T', strength: 90, swing: 0, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🥁 Triplet (1/8T, 90%)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/32', strength: 100, swing: 0, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    ⚡ Tight 32nd (100%)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, grid: '1/8', strength: 100, swing: 0, humanizeTicks: 0 })}
                    className="w-full text-left px-3 py-2 bg-gray-700/30 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    🎵 Eighth Notes (1/8, 100%)
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Quantize Panel + Results */}
            <div className="lg:col-span-2 space-y-4">
              <QuantizePanel
                params={params}
                onChangeParams={setParams}
                onQuantize={handleQuantize}
                onReset={handleReset}
                onDownloadReport={lastResult ? handleDownloadReport : undefined}
                onDownloadMidi={lastBlob ? handleDownloadMidi : undefined}
                isProcessing={isProcessing}
                disabled={!midi || selectedTracks.length === 0}
              />

              {/* Comparison View */}
              {comparisons.length > 0 && (
                <ComparisonView comparisons={comparisons} />
              )}

              {/* Report Panel */}
              {lastResult?.report && (
                <ReportPanel report={lastResult.report} verification={verificationResult} tempoInfo={tempoInfo} />
              )}
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
                <li>Select the tracks you want to quantize</li>
                <li>Choose a grid division and adjust parameters</li>
                <li>Click <strong className="text-cyan-400">Quantize & Download</strong></li>
                <li>Review the comparison and report</li>
                <li>Download again or reset to try different settings</li>
              </ol>
              <div className="mt-4 pt-4 border-t border-gray-700/30">
                <p className="text-xs text-gray-500">
                  <strong>Features:</strong> Multi-track • Binary & triplet grids • 
                  Strength 0–100% • Swing • Humanize • Velocity preservation • 
                  Tempo change support • Before/after comparison • Downloadable report • 
                  MIDI verification • Undo/reset
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-600 gap-2">
          <span>QUANTIZE.IT — MIDI Quantizer Pro v1.1</span>
          <span>All processing happens locally in your browser. No files are uploaded.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
