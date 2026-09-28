/**
 * QUANTIZE.IT - Worker Wrapper (Simplified)
 * 
 * Uses setTimeout-based chunking to avoid blocking the main thread.
 * Falls back gracefully if Web Workers are not available.
 * Provides progress reporting and cancellation support.
 */

import type { QuantizeParams } from '../types';

export interface WorkerProgress {
  percent: number;
  message: string;
}

export interface WorkerResult {
  midiBuffer: ArrayBuffer;
  results: any[];
  durationMs: number;
  outputTempo: number;
  ppq: number;
}

export interface WorkerCallbacks {
  onProgress?: (progress: WorkerProgress) => void;
  onComplete?: (result: WorkerResult) => void;
  onError?: (error: Error) => void;
  onCancelled?: () => void;
}

/**
 * Run quantization with progress reporting and cancellation.
 * Uses chunked async processing to avoid blocking the UI.
 */
export function quantizeInWorker(
  midiBuffer: ArrayBuffer,
  params: QuantizeParams,
  trackIndices: number[],
  callbacks: WorkerCallbacks
): () => void {
  let cancelled = false;
  const startTime = performance.now();

  const cancel = () => {
    cancelled = true;
    callbacks.onCancelled?.();
  };

  // Run async quantization
  (async () => {
    try {
      callbacks.onProgress?.({ percent: 0, message: 'Starting quantization...' });

      // Dynamic import
      const utils = await import('./worker-utils');

      if (cancelled) return;
      callbacks.onProgress?.({ percent: 10, message: 'Parsing MIDI...' });

      const midi = utils.parseMidiBinary(midiBuffer);

      if (cancelled) return;
      callbacks.onProgress?.({ percent: 20, message: 'Analyzing tracks...' });

      const results: any[] = [];
      const totalTracks = trackIndices.length;

      for (let i = 0; i < totalTracks; i++) {
        if (cancelled) return;

        const trackIndex = trackIndices[i];
        const progress = 20 + (i / totalTracks) * 70;
        callbacks.onProgress?.({
          percent: progress,
          message: `Quantizing track ${i + 1}/${totalTracks}...`,
        });

        // Yield to main thread
        await new Promise(resolve => setTimeout(resolve, 0));

        if (cancelled) return;

        const result = utils.quantizeTrackInWorker(midi, trackIndex, params);
        results.push(result);
      }

      if (cancelled) return;
      callbacks.onProgress?.({ percent: 90, message: 'Finalizing...' });

      // Set constant tempo
      const outputTempo = params.outputTempo || 56;
      const outputMicrosecondsPerBeat = Math.round(60000000 / outputTempo);

      for (const track of midi.tracks) {
        const filtered = track.filter((e: any) => e.type !== 'setTempo');
        track.length = 0;
        track.push(...filtered);
      }

      if (midi.tracks.length > 0) {
        midi.tracks[0].push({
          absoluteTime: 0,
          deltaTime: 0,
          type: 'setTempo',
          microsecondsPerBeat: outputMicrosecondsPerBeat,
        });
      }

      if (cancelled) return;
      callbacks.onProgress?.({ percent: 95, message: 'Exporting MIDI...' });

      const binaryData = utils.writeMidiBinary(midi);
      const buffer = new ArrayBuffer(binaryData.length);
      new Uint8Array(buffer).set(binaryData);

      const durationMs = performance.now() - startTime;

      callbacks.onComplete?.({
        midiBuffer: buffer,
        results,
        durationMs,
        outputTempo,
        ppq: midi.header.ticksPerBeat,
      });
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  })();

  return cancel;
}

/**
 * Performance metrics collector.
 */
export interface PerformanceMetrics {
  parseMs: number;
  analyzeMs: number;
  quantizeMs: number;
  exportMs: number;
  totalMs: number;
  fileSize: number;
  trackCount: number;
  noteCount: number;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();

  start(operationId: string, fileSize: number): void {
    this.metrics.set(operationId, {
      parseMs: 0,
      analyzeMs: 0,
      quantizeMs: 0,
      exportMs: 0,
      totalMs: 0,
      fileSize,
      trackCount: 0,
      noteCount: 0,
    });
  }

  update(operationId: string, updates: Partial<PerformanceMetrics>): void {
    const current = this.metrics.get(operationId);
    if (current) {
      Object.assign(current, updates);
    }
  }

  get(operationId: string): PerformanceMetrics | undefined {
    return this.metrics.get(operationId);
  }

  formatReport(operationId: string): string {
    const m = this.metrics.get(operationId);
    if (!m) return 'No metrics available';

    return [
      `File size: ${(m.fileSize / 1024).toFixed(1)} KB`,
      `Tracks: ${m.trackCount}`,
      `Notes: ${m.noteCount}`,
      `Total: ${m.totalMs.toFixed(1)} ms`,
    ].join('\n');
  }
}

export const performanceMonitor = new PerformanceMonitor();
