/**
 * QUANTIZE.IT - Waveform Visualization Component
 * 
 * Renders audio waveform with selection region.
 * Uses Canvas for performance.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { WaveformData } from '../utils/audio-import';

interface WaveformViewProps {
  waveformData: WaveformData | null;
  selectionStart?: number; // seconds
  selectionEnd?: number;   // seconds
  onSelectionChange?: (start: number, end: number) => void;
  playbackPosition?: number; // seconds
  height?: number;
}

export function WaveformView({
  waveformData,
  selectionStart,
  selectionEnd,
  onSelectionChange,
  playbackPosition,
  height = 120,
}: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [tempSelection, setTempSelection] = useState<{ start: number; end: number } | null>(null);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !waveformData) return;

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

    // Draw center line
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw waveform (use first channel or mix)
    const channelData = waveformData.channels[0] || new Float32Array();
    const samples = channelData.length;
    const duration = waveformData.duration;

    if (samples === 0 || duration === 0) return;

    // Draw waveform
    ctx.fillStyle = '#06b6d4';
    ctx.globalAlpha = 0.7;
    
    const step = width / samples;
    for (let i = 0; i < samples; i++) {
      const x = i * step;
      const amplitude = Math.abs(channelData[i]) * (height / 2) * 0.9;
      ctx.fillRect(x, height / 2 - amplitude, Math.max(1, step), amplitude * 2);
    }

    ctx.globalAlpha = 1;

    // Draw selection region
    if (selectionStart !== undefined && selectionEnd !== undefined) {
      const startX = (selectionStart / duration) * width;
      const endX = (selectionEnd / duration) * width;
      
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.fillRect(startX, 0, endX - startX, height);
      
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, 0, endX - startX, height);
    }

    // Draw temp selection while dragging
    if (tempSelection) {
      const startX = (tempSelection.start / duration) * width;
      const endX = (tempSelection.end / duration) * width;
      
      ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      ctx.fillRect(startX, 0, endX - startX, height);
    }

    // Draw playback position
    if (playbackPosition !== undefined && playbackPosition >= 0) {
      const x = (playbackPosition / duration) * width;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

  }, [waveformData, selectionStart, selectionEnd, playbackPosition, tempSelection, height]);

  // Handle mouse interactions
  const getTimeFromX = useCallback((clientX: number): number => {
    const container = containerRef.current;
    if (!container || !waveformData) return 0;
    
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = x / rect.width;
    return ratio * waveformData.duration;
  }, [waveformData]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!waveformData) return;
    setIsDragging(true);
    const time = getTimeFromX(e.clientX);
    setDragStart(time);
    setTempSelection({ start: time, end: time });
  }, [waveformData, getTimeFromX]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || dragStart === null || !waveformData) return;
    const time = getTimeFromX(e.clientX);
    const start = Math.min(dragStart, time);
    const end = Math.max(dragStart, time);
    setTempSelection({ start, end });
  }, [isDragging, dragStart, waveformData, getTimeFromX]);

  const handleMouseUp = useCallback(() => {
    if (tempSelection && onSelectionChange) {
      onSelectionChange(tempSelection.start, tempSelection.end);
    }
    setIsDragging(false);
    setDragStart(null);
    setTempSelection(null);
  }, [tempSelection, onSelectionChange]);

  if (!waveformData) {
    return (
      <div
        ref={containerRef}
        className="bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-sm"
        style={{ height }}
      >
        No audio loaded
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative bg-gray-800 rounded-lg overflow-hidden cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={canvasRef} className="w-full" style={{ height }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>0:00</span>
        <span>{formatTime(waveformData.duration)}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
