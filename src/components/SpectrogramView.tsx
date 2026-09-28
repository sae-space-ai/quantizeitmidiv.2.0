/**
 * QUANTIZE.IT - Spectrogram Visualization Component
 * 
 * Displays synchronized spectrogram with:
 * - Waveform overlay
 * - Note markers (from transcription)
 * - Zoom and selection
 * - Loop regions
 * - Cursor synchronization
 * - Adjustable frequency scale
 * 
 * LIMITATIONS:
 * - Canvas-based rendering (performance depends on data size)
 * - No real-time updates (batch rendering)
 * - Color mapping is fixed (logarithmic magnitude)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { SpectrogramData } from '../utils/spectral-analysis';
import type { TranscribedNote } from '../utils/transcription-enhanced';

interface SpectrogramViewProps {
  spectrogram: SpectrogramData | null;
  notes?: TranscribedNote[];
  currentTime?: number;
  selectionStart?: number;
  selectionEnd?: number;
  loopStart?: number;
  loopEnd?: number;
  onTimeChange?: (time: number) => void;
  onSelectionChange?: (start: number, end: number) => void;
  height?: number;
  showNotes?: boolean;
  showWaveform?: boolean;
}

export function SpectrogramView({
  spectrogram,
  notes = [],
  currentTime = 0,
  selectionStart,
  selectionEnd,
  loopStart,
  loopEnd,
  onTimeChange,
  onSelectionChange,
  height = 300,
  showNotes = true,
  showWaveform = true,
}: SpectrogramViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [minFreq, setMinFreq] = useState(0);
  const [maxFreq, setMaxFreq] = useState(8000);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);

  // Draw spectrogram
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !spectrogram) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    const duration = spectrogram.duration;
    const visibleDuration = duration / zoom;
    const startTime = scrollX;
    const endTime = startTime + visibleDuration;

    // Draw spectrogram
    const frameWidth = width / spectrogram.frames.length;
    const freqRange = maxFreq - minFreq;

    for (let i = 0; i < spectrogram.frames.length; i++) {
      const frame = spectrogram.frames[i];
      const frameTime = frame.time;

      if (frameTime < startTime || frameTime > endTime) continue;

      const x = ((frameTime - startTime) / visibleDuration) * width;

      // Draw magnitude spectrum as vertical line
      const numBins = frame.magnitudes.length;
      const sampleRate = spectrogram.sampleRate;
      const fftSize = spectrogram.fftSize;

      for (let bin = 0; bin < numBins; bin++) {
        const freq = (bin * sampleRate) / fftSize;
        if (freq < minFreq || freq > maxFreq) continue;

        const y = height - ((freq - minFreq) / freqRange) * height;
        const magnitude = frame.magnitudes[bin];

        // Logarithmic color mapping
        const normalizedMag = Math.log10(magnitude + 1e-10) / Math.log10(frame.peakMagnitude + 1e-10);
        const colorValue = Math.max(0, Math.min(1, normalizedMag));

        // Color: blue (low) -> green (mid) -> red (high)
        const r = Math.floor(colorValue * 255);
        const g = Math.floor((1 - Math.abs(colorValue - 0.5) * 2) * 255);
        const b = Math.floor((1 - colorValue) * 255);

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, Math.max(1, frameWidth), 1);
      }
    }

    // Draw waveform overlay
    if (showWaveform && spectrogram.frames.length > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 0; i < spectrogram.frames.length; i++) {
        const frame = spectrogram.frames[i];
        const frameTime = frame.time;

        if (frameTime < startTime || frameTime > endTime) continue;

        const x = ((frameTime - startTime) / visibleDuration) * width;
        const y = height - (frame.rms * height * 10); // Scale RMS for visibility

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    // Draw notes overlay
    if (showNotes && notes.length > 0) {
      for (const note of notes) {
        if (note.endTime < startTime || note.startTime > endTime) continue;

        const x1 = ((note.startTime - startTime) / visibleDuration) * width;
        const x2 = ((note.endTime - startTime) / visibleDuration) * width;
        const y = height - ((note.frequency - minFreq) / freqRange) * height;

        // Note rectangle
        ctx.fillStyle = note.isDoubtful ? 'rgba(251, 191, 36, 0.5)' : 'rgba(34, 197, 94, 0.5)';
        ctx.fillRect(x1, y - 3, x2 - x1, 6);

        // Note border
        ctx.strokeStyle = note.isDoubtful ? 'rgba(251, 191, 36, 0.8)' : 'rgba(34, 197, 94, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, y - 3, x2 - x1, 6);
      }
    }

    // Draw selection region
    if (selectionStart !== undefined && selectionEnd !== undefined) {
      const x1 = ((selectionStart - startTime) / visibleDuration) * width;
      const x2 = ((selectionEnd - startTime) / visibleDuration) * width;

      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.fillRect(x1, 0, x2 - x1, height);

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, 0, x2 - x1, height);
    }

    // Draw loop region
    if (loopStart !== undefined && loopEnd !== undefined) {
      const x1 = ((loopStart - startTime) / visibleDuration) * width;
      const x2 = ((loopEnd - startTime) / visibleDuration) * width;

      ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
      ctx.fillRect(x1, 0, x2 - x1, height);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x1, 0, x2 - x1, height);
      ctx.setLineDash([]);
    }

    // Draw current time cursor
    if (currentTime > 0) {
      const x = ((currentTime - startTime) / visibleDuration) * width;
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Draw frequency axis
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 50, height);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    const freqSteps = [100, 500, 1000, 2000, 4000, 8000];
    for (const freq of freqSteps) {
      if (freq < minFreq || freq > maxFreq) continue;
      const y = height - ((freq - minFreq) / freqRange) * height;
      ctx.fillText(`${freq}Hz`, 5, y + 3);
    }

  }, [spectrogram, notes, currentTime, selectionStart, selectionEnd, loopStart, loopEnd, zoom, scrollX, minFreq, maxFreq, height, showNotes, showWaveform]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!spectrogram) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;
    const duration = spectrogram.duration;
    const visibleDuration = duration / zoom;
    const startTime = scrollX;

    const time = startTime + (x / width) * visibleDuration;
    setIsDragging(true);
    setDragStart(time);
  }, [spectrogram, zoom, scrollX]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || dragStart === null || !spectrogram) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;
    const duration = spectrogram.duration;
    const visibleDuration = duration / zoom;
    const startTime = scrollX;

    const time = startTime + (x / width) * visibleDuration;
    const start = Math.min(dragStart, time);
    const end = Math.max(dragStart, time);

    onSelectionChange?.(start, end);
  }, [isDragging, dragStart, spectrogram, zoom, scrollX, onSelectionChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!spectrogram) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;
    const duration = spectrogram.duration;
    const visibleDuration = duration / zoom;
    const startTime = scrollX;

    const time = startTime + (x / width) * visibleDuration;
    onTimeChange?.(time);
  }, [spectrogram, zoom, scrollX, onTimeChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      // Zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(1, Math.min(10, z * delta)));
    } else {
      // Scroll
      const delta = e.deltaY * 0.01;
      setScrollX(x => Math.max(0, Math.min((spectrogram?.duration || 0) - (spectrogram?.duration || 0) / zoom, x + delta)));
    }
  }, [spectrogram, zoom]);

  if (!spectrogram) {
    return (
      <div
        ref={containerRef}
        className="bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-sm"
        style={{ height }}
      >
        No spectrogram data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative bg-gray-800 rounded-lg overflow-hidden cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <label>Zoom:</label>
          <input
            type="range"
            min="1"
            max="10"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-24"
          />
          <span className="font-mono">{zoom.toFixed(1)}x</span>
        </div>

        <div className="flex items-center gap-2">
          <label>Freq Range:</label>
          <input
            type="number"
            value={minFreq}
            onChange={(e) => setMinFreq(Number(e.target.value))}
            className="w-16 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-white"
          />
          <span>-</span>
          <input
            type="number"
            value={maxFreq}
            onChange={(e) => setMaxFreq(Number(e.target.value))}
            className="w-16 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-white"
          />
          <span>Hz</span>
        </div>

        <div className="flex items-center gap-2">
          <label>
            <input
              type="checkbox"
              checked={showNotes}
              onChange={(e) => {}}
              className="mr-1"
            />
            Notes
          </label>
          <label>
            <input
              type="checkbox"
              checked={showWaveform}
              onChange={(e) => {}}
              className="mr-1"
            />
            Waveform
          </label>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Ctrl+Scroll: Zoom • Scroll: Pan • Click: Set cursor • Drag: Select region
      </div>
    </div>
  );
}
