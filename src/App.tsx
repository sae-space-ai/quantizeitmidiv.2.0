/**
 * QUANTIZE.IT - MIDI Quantizer Pro v2.0
 * Main application with DB, AI, and Worker integration.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Music } from 'lucide-react';
import { Header } from './components/Header';
import { FileLoader } from './components/FileLoader';
import { TrackSelector } from './components/TrackSelector';
import { QuantizePanel } from './components/QuantizePanel';
import { StatusBar } from './components/StatusBar';
import { ComparisonView } from './components/ComparisonView';
import { ReportPanel } from './components/ReportPanel';
import { BinaryTestPanel } from './components/BinaryTestPanel';
import { ProgressBar } from './components/ProgressBar';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { ProjectManager } from './components/ProjectManager';
import { AudioTranscriptionPanel } from './components/AudioTranscriptionPanel';
import { MusicalStagesPanel } from './components/MusicalStagesPanel';
import { Player } from './components/Player';
import { SpectralAnalysisPanel } from './components/SpectralAnalysisPanel';
import { MidiImportTestPanel } from './components/MidiImportTestPanel';
import {
  loadMidiFile,
  loadMidiFileFromBuffer,
  quantizeMidiBinary,
  exportQuantizedMidiBlob,
  createMidiSnapshot,
  compareSnapshots,
  verifyMidiBlob,
  generateTextReport,
} from './utils/midi-io';
import { runBinaryTests, type TestSuite } from './utils/binary-tests';
import { aiRegistry, type AiAnalysisResult, type AiSuggestion } from './utils/ai-provider';
import { quantizeInWorker, type WorkerProgress, performanceMonitor } from './utils/worker-wrapper';
import { initializeDatabase, saveConfiguration, type DBConfiguration } from './utils/database';
import type { MidiFile } from './utils/midi-types';
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
  // Core state
  const originalBufferRef = useRef<ArrayBuffer | null>(null);
  const [midi, setMidi] = useState<Midi | null>(null);
  const [binaryMidi, setBinaryMidi] = useState<MidiFile | null>(null);
  const [fileInfo, setFileInfo] = useState<MidiFileInfo | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<StatusType>('idle');

  // Worker state
  const [workerProgress, setWorkerProgress] = useState<WorkerProgress | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const cancelWorkerRef = useRef<(() => void) | null>(null);

  // AI state
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResult | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // Comparison and reports
  const [beforeSnapshot, setBeforeSnapshot] = useState<MidiSnapshot | null>(null);
  const [afterSnapshot, setAfterSnapshot] = useState<MidiSnapshot | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);
  const [lastResult, setLastResult] = useState<QuantizeResult | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [lastOutputBuffer, setLastOutputBuffer] = useState<ArrayBuffer | null>(null);
  const [verificationResult, setVerificationResult] = useState<string>('');
  const [tempoInfo, setTempoInfo] = useState<string>('');
  const [binaryTestSuite, setBinaryTestSuite] = useState<TestSuite | null>(null);

  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string>('default');

  // Quantization params
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

  // Audio transcription panel visibility
  const [showAudioPanel, setShowAudioPanel] = useState(false);

  // Player state
  const [quantizedBinaryMidi, setQuantizedBinaryMidi] = useState<MidiFile | null>(null);
  const [trackNames, setTrackNames] = useState<string[]>([]);

  // Spectral analysis state
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [transcribedNotes, setTranscribedNotes] = useState<any[] | null>(null);

  // Initialize DB
  useEffect(() => {
    initializeDatabase().catch(err => {
      console.error('Failed to initialize database:', err);
    });
  }, []);

  const handleFileLoad = useCallback(async (file: File) => {
    setIsProcessing(true);
    setStatus('Loading MIDI file...');
    setStatusType('loading');

    try {
      if (file.size === 0) throw new Error('File is empty');
      if (file.size > 50 * 1024 * 1024) throw new Error('File too large (max 50MB)');

      const arrayBuffer = await file.arrayBuffer();
      originalBufferRef.current = arrayBuffer.slice(0);

      const { midi: loadedMidi, info, binaryMidi: loadedBinaryMidi } = await loadMidiFile(file);

      const hasNotes = info.tracks.some(t => t.noteCount > 0);
      if (!hasNotes) throw new Error('MIDI file has no notes');

      setMidi(loadedMidi);
      setBinaryMidi(loadedBinaryMidi);
      setFileInfo(info);

      const tracksWithNotes = info.tracks.filter(t => t.noteCount > 0).map(t => t.index);
      setSelectedTracks(tracksWithNotes);
      setParams(prev => ({ ...prev, ppq: info.ppq }));

      // Extract track names for player
      setTrackNames(info.tracks.map(t => t.name));
      setQuantizedBinaryMidi(null);

      const snapshot = createMidiSnapshot(loadedMidi, info.name);
      setBeforeSnapshot(snapshot);
      setAfterSnapshot(null);
      setComparisons([]);
      setLastResult(null);
      setLastBlob(null);
      setLastOutputBuffer(null);
      setVerificationResult('');
      setTempoInfo('');
      setBinaryTestSuite(null);
      setAiAnalysis(null);
      setCurrentProjectId(null);

      const totalNotes = info.tracks.reduce((sum, t) => sum + t.noteCount, 0);
      setStatus(`✓ Loaded "${info.name}" — ${info.tracks.length} tracks, ${totalNotes} notes, ${info.ppq} PPQ`);
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
    if (cancelWorkerRef.current) {
      cancelWorkerRef.current();
      cancelWorkerRef.current = null;
    }
    setMidi(null);
    setBinaryMidi(null);
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
    setLastOutputBuffer(null);
    setVerificationResult('');
    setTempoInfo('');
    setBinaryTestSuite(null);
    setAiAnalysis(null);
    setCurrentProjectId(null);
    setShowProgress(false);
    setWorkerProgress(null);
  }, []);

  const handleReset = useCallback(() => {
    if (!originalBufferRef.current || !fileInfo) return;
    const freshMidi = new Midi(originalBufferRef.current.slice(0));
    setMidi(freshMidi);
    const snapshot = createMidiSnapshot(freshMidi, fileInfo.name);
    setBeforeSnapshot(snapshot);
    setAfterSnapshot(null);
    setComparisons([]);
    setLastResult(null);
    setLastBlob(null);
    setLastOutputBuffer(null);
    setVerificationResult('');
    setTempoInfo('');
    setBinaryTestSuite(null);
    setStatus('✓ Reset to original.');
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
    setShowProgress(true);
    setWorkerProgress({ percent: 0, message: 'Starting...' });
    setStatusType('loading');

    const operationId = `op-${Date.now()}`;
    performanceMonitor.start(operationId, originalBufferRef.current.byteLength);

    const quantizeParams = { ...params, ppq: fileInfo.ppq };

    const cancel = quantizeInWorker(
      originalBufferRef.current.slice(0),
      quantizeParams,
      selectedTracks,
      {
        onProgress: (progress) => {
          setWorkerProgress(progress);
        },
        onComplete: async (result) => {
          try {
            performanceMonitor.update(operationId, {
              totalMs: result.durationMs,
              trackCount: selectedTracks.length,
            });

            // Create blob from worker result
            const blob = new Blob([result.midiBuffer], { type: 'audio/midi' });
            setLastBlob(blob);
            setLastOutputBuffer(result.midiBuffer);

            // Re-parse for UI
            const { midi: freshMidi, binaryMidi: freshBinaryMidi } = await loadMidiFileFromBuffer(
              result.midiBuffer,
              fileInfo.name
            );
            setMidi(freshMidi);
            setQuantizedBinaryMidi(freshBinaryMidi);

            const afterSnap = createMidiSnapshot(freshMidi, fileInfo.name);
            setAfterSnapshot(afterSnap);

            if (beforeSnapshot) {
              const comps = selectedTracks.map(trackIdx =>
                compareSnapshots(beforeSnapshot, afterSnap, trackIdx)
              );
              setComparisons(comps);
            }

            // Build result from worker output
            const quantizeResult: QuantizeResult = {
              success: true,
              message: `Quantized ${selectedTracks.length} track(s). Output: ${result.outputTempo} BPM, PPQ ${result.ppq}`,
              eventsProcessed: result.results.reduce((sum: number, r: any) => sum + (r.notesProcessed || 0) * 2, 0),
              notesQuantized: result.results.reduce((sum: number, r: any) => sum + (r.notesMoved || 0) * 2, 0),
              report: {
                totalNotes: result.results.reduce((sum: number, r: any) => sum + (r.notesProcessed || 0), 0),
                notesMoved: result.results.reduce((sum: number, r: any) => sum + (r.notesMoved || 0), 0),
                notesUnchanged: result.results.reduce((sum: number, r: any) => sum + (r.notesUnchanged || 0), 0),
                maxDisplacementMs: Math.max(...result.results.map((r: any) => r.maxDisplacementMs || 0)),
                avgDisplacementMs: result.results.reduce((sum: number, r: any) => sum + (r.avgDisplacementMs || 0), 0) / Math.max(1, result.results.length),
                warnings: [`Tempo set to ${result.outputTempo} BPM constant`, `PPQ: ${result.ppq}`],
                perTrack: result.results,
              },
            };
            setLastResult(quantizeResult);

            // Verify
            const verification = await verifyMidiBlob(blob);
            setVerificationResult(verification.message);
            setTempoInfo(verification.tempoInfo || '');

            // Run binary tests
            const testSuite = await runBinaryTests(
              blob,
              fileInfo.ppq,
              params.outputTempo,
              fileInfo.timeSignature,
              params.grid
            );
            setBinaryTestSuite(testSuite);

            // Download
            const originalName = fileInfo.name.replace(/\.(mid|midi)$/i, '');
            const gridLabel = params.grid.replace('/', '');
            const downloadName = `${originalName}_q${gridLabel}_s${params.strength}.mid`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }, 1000);

            setStatus(`✓ ${quantizeResult.message}. Downloaded "${downloadName}" (${(blob.size / 1024).toFixed(1)} KB)`);
            setStatusType('success');
          } catch (error) {
            setStatus(`✗ Post-processing error: ${error instanceof Error ? error.message : 'Unknown'}`);
            setStatusType('error');
          } finally {
            setIsProcessing(false);
            setShowProgress(false);
          }
        },
        onError: (error) => {
          setStatus(`✗ Error: ${error.message}`);
          setStatusType('error');
          setIsProcessing(false);
          setShowProgress(false);
        },
        onCancelled: () => {
          setStatus('⚠ Quantization cancelled');
          setStatusType('info');
          setIsProcessing(false);
          setShowProgress(false);
        },
      }
    );

    cancelWorkerRef.current = cancel;
  }, [fileInfo, params, selectedTracks, beforeSnapshot]);

  const handleCancelQuantize = useCallback(() => {
    if (cancelWorkerRef.current) {
      cancelWorkerRef.current();
      cancelWorkerRef.current = null;
    }
  }, []);

  const handleAiAnalyze = useCallback(async () => {
    if (!binaryMidi || selectedTracks.length === 0) return;

    setIsAiAnalyzing(true);
    try {
      const provider = aiRegistry.getActive();
      if (!provider) throw new Error('No AI provider available');

      const result = await provider.analyze(binaryMidi, selectedTracks[0], params.grid);
      setAiAnalysis(result);
    } catch (error) {
      setStatus(`✗ AI analysis failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      setStatusType('error');
    } finally {
      setIsAiAnalyzing(false);
    }
  }, [binaryMidi, selectedTracks, params.grid]);

  const handleAcceptSuggestion = useCallback((suggestion: AiSuggestion) => {
    // In a full implementation, this would apply the suggestion to the MIDI
    setStatus(`✓ Suggestion accepted: ${suggestion.title}`);
    setStatusType('success');
  }, []);

  const handleRejectSuggestion = useCallback((suggestion: AiSuggestion) => {
    setStatus(`✗ Suggestion rejected: ${suggestion.title}`);
    setStatusType('info');
  }, []);

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

  const handleLoadProject = useCallback(async (projectId: string) => {
    // Load project from DB
    setStatus(`Loading project ${projectId}...`);
    setStatusType('loading');
    // Implementation would load from IndexedDB
  }, []);

  const handleProjectSaved = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
    setStatus('✓ Project saved');
    setStatusType('success');
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 space-y-5 w-full">
        <FileLoader
          onFileLoad={handleFileLoad}
          fileInfo={fileInfo}
          isLoading={isProcessing}
          onClear={handleClear}
        />

        <ProgressBar
          progress={workerProgress?.percent || 0}
          message={workerProgress?.message || ''}
          onCancel={handleCancelQuantize}
          isVisible={showProgress}
        />

        {fileInfo && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            {/* Left column */}
            <div className="lg:col-span-1 space-y-4">
              <TrackSelector
                tracks={fileInfo.tracks}
                selectedTracks={selectedTracks}
                onToggleTrack={(index) => {
                  setSelectedTracks(prev =>
                    prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
                  );
                }}
                onSelectAll={() => setSelectedTracks(fileInfo.tracks.filter(t => t.noteCount > 0).map(t => t.index))}
                onDeselectAll={() => setSelectedTracks([])}
              />

              <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                <h3 className="text-sm font-medium text-white mb-3">File Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">PPQ</span>
                    <span className="text-gray-200 font-mono">{fileInfo.ppq}</span>
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
                    <span className="text-gray-400">Selected</span>
                    <span className="text-cyan-300 font-mono">{selectedTracks.length} track(s)</span>
                  </div>
                </div>
              </div>

              <ProjectManager
                currentProjectId={currentProjectId}
                fileName={fileInfo.name}
                inputFileBuffer={originalBufferRef.current}
                outputFileBuffer={lastOutputBuffer}
                configId={configId}
                onLoadProject={handleLoadProject}
                onProjectSaved={handleProjectSaved}
              />
            </div>

            {/* Middle column */}
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

              {comparisons.length > 0 && <ComparisonView comparisons={comparisons} />}
              {lastResult?.report && (
                <ReportPanel report={lastResult.report} verification={verificationResult} tempoInfo={tempoInfo} />
              )}
              {binaryTestSuite && <BinaryTestPanel testSuite={binaryTestSuite} />}
              
              {/* MIDI Player */}
              {(binaryMidi || quantizedBinaryMidi) && (
                <Player
                  originalMidi={binaryMidi}
                  quantizedMidi={quantizedBinaryMidi}
                  trackNames={trackNames}
                />
              )}

              {/* Musical Processing Stages */}
              {binaryMidi && (
                <MusicalStagesPanel
                  midi={binaryMidi}
                  grid={params.grid}
                  ppq={params.ppq}
                  onStatusChange={(message, type) => {
                    setStatus(message);
                    setStatusType(type === 'success' ? 'success' : type === 'error' ? 'error' : 'info');
                  }}
                />
              )}
            </div>

            {/* Right column */}
            <div className="lg:col-span-1 space-y-4">
              <AiAssistantPanel
                analysis={aiAnalysis}
                isAnalyzing={isAiAnalyzing}
                onAnalyze={handleAiAnalyze}
                onAcceptSuggestion={handleAcceptSuggestion}
                onRejectSuggestion={handleRejectSuggestion}
                disabled={!binaryMidi || selectedTracks.length === 0}
              />
            </div>
          </div>
        )}

        <StatusBar status={status} type={statusType} />

        {/* MIDI Import Test Panel - Para verificar corrección de regresión */}
        <div className="mt-4">
          <MidiImportTestPanel />
        </div>

        {/* Audio Transcription Panel (CAPA 1-5) */}
        <div className="mt-4">
          <button
            onClick={() => setShowAudioPanel(!showAudioPanel)}
            className="w-full flex items-center justify-between px-4 py-3 bg-purple-500/10 hover:bg-purple-500/15 border border-purple-500/30 rounded-xl text-left transition-colors"
          >
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-purple-400" />
              <span className="font-medium text-white">Audio → MIDI Transcription</span>
              <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">NEW</span>
            </div>
            <span className="text-sm text-gray-400">
              {showAudioPanel ? '▼ Hide' : '▶ Show'}
            </span>
          </button>
          {showAudioPanel && (
            <div className="mt-3 space-y-3">
              <AudioTranscriptionPanel
                onStatusChange={(message, type) => {
                  setStatus(message);
                  setStatusType(type === 'success' ? 'success' : type === 'error' ? 'error' : 'info');
                }}
              />
              
              {/* Spectral Analysis Panel */}
              <SpectralAnalysisPanel
                audioBuffer={audioBuffer}
                notes={transcribedNotes}
                trackIndex={0}
                trackName="Transcription"
                onStatusChange={(message, type) => {
                  setStatus(message);
                  setStatusType(type === 'success' ? 'success' : type === 'error' ? 'error' : 'info');
                }}
              />
            </div>
          )}
        </div>

        {!fileInfo && (
          <div className="mt-8 text-center">
            <div className="inline-block bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 max-w-lg text-left">
              <h2 className="text-lg font-semibold text-white mb-3 text-center">How it works</h2>
              <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                <li>Load a MIDI file (.mid or .midi)</li>
                <li>Select tracks and parameters</li>
                <li>Click Quantize & Download (runs in Web Worker)</li>
                <li>Review comparison, report, and binary tests</li>
                <li>Optionally run AI analysis for suggestions</li>
                <li>Save project to local database</li>
              </ol>
              <div className="mt-4 pt-4 border-t border-gray-700/30">
                <p className="text-xs text-gray-500">
                  <strong>New in v2.0:</strong> IndexedDB project storage • Local AI heuristic analysis • 
                  Web Worker acceleration with progress • Cancellable operations • 
                  Binary MIDI verification • Deterministic tick-based engine
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-600 gap-2">
          <span>QUANTIZE.IT — MIDI Quantizer Pro v2.0</span>
          <span>All processing is local. No data leaves your browser.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
