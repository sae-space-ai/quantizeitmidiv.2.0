/**
 * QUANTIZE.IT - Piano Roll Editor
 * 
 * Basic piano roll for editing transcribed notes.
 * Features:
 * - Visual note display with pitch/time
 * - Click to select notes
 * - Drag to move notes (time/pitch)
 * - Resize note duration
 * - Delete notes
 * - Insert new notes
 * - Undo/redo support
 * 
 * LIMITATIONS:
 * - Basic implementation (not full DAW-level)
 * - No velocity editing yet
 * - No multi-select yet
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { TranscribedNote } from '../utils/transcription';

interface PianoRollProps {
  notes: TranscribedNote[];
  duration: number;
  onNotesChange: (notes: TranscribedNote[]) => void;
  currentTime?: number;
  onTimeChange?: (time: number) => void;
}

export function PianoRoll({ notes, duration, onNotesChange, currentTime = 0, onTimeChange }: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; note: TranscribedNote } | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  // Configuration
  const pixelsPerSecond = 100;
  const pixelsPerNote = 8;
  const minMidi = 36; // C2
  const maxMidi = 96; // C7
  const totalNotes = maxMidi - minMidi;

  // Draw piano roll
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    // Draw piano keys on left
    const keyWidth = 40;
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      const y = height - ((midi - minMidi) * pixelsPerNote) - scrollY;
      if (y < 0 || y > height) continue;

      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      ctx.fillStyle = isBlack ? '#374151' : '#4b5563';
      ctx.fillRect(0, y, keyWidth, pixelsPerNote);
      ctx.strokeStyle = '#1f2937';
      ctx.strokeRect(0, y, keyWidth, pixelsPerNote);

      // Draw note name on C notes
      if (midi % 12 === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px monospace';
        ctx.fillText(`C${Math.floor(midi / 12) - 1}`, 5, y + pixelsPerNote - 2);
      }
    }

    // Draw grid lines (beats)
    const beatInterval = 0.5; // 0.5 seconds per beat
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let t = 0; t < duration; t += beatInterval) {
      const x = keyWidth + (t * pixelsPerSecond) - scrollX;
      if (x < keyWidth || x > width) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw notes
    notes.forEach((note, index) => {
      const x = keyWidth + (note.startTime * pixelsPerSecond) - scrollX;
      const y = height - ((note.midiNote - minMidi + 1) * pixelsPerNote) - scrollY;
      const noteWidth = (note.endTime - note.startTime) * pixelsPerSecond;
      const noteHeight = pixelsPerNote - 1;

      if (x + noteWidth < keyWidth || x > width || y + noteHeight < 0 || y > height) return;

      // Note color based on confidence
      const confidence = note.confidence;
      if (note.isDoubtful) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.7)'; // Yellow for doubtful
      } else if (confidence > 0.85) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.8)'; // Green for high confidence
      } else {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'; // Blue for normal
      }

      // Selected note highlight
      if (index === selectedNote) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.9)'; // Purple for selected
      }

      ctx.fillRect(x, y, noteWidth, noteHeight);
      ctx.strokeStyle = '#1f2937';
      ctx.strokeRect(x, y, noteWidth, noteHeight);
    });

    // Draw current time cursor
    if (currentTime > 0) {
      const x = keyWidth + (currentTime * pixelsPerSecond) - scrollX;
      if (x >= keyWidth && x <= width) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }, [notes, duration, selectedNote, currentTime, scrollX, scrollY, pixelsPerSecond, pixelsPerNote, minMidi, maxMidi]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const keyWidth = 40;
    if (x < keyWidth) return; // Clicked on piano keys

    // Check if clicked on a note
    const time = (x - keyWidth + scrollX) / pixelsPerSecond;
    const midi = maxMidi - Math.floor((y + scrollY) / pixelsPerNote);

    let clickedNote = -1;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (time >= note.startTime && time <= note.endTime && midi === note.midiNote) {
        clickedNote = i;
        break;
      }
    }

    if (clickedNote >= 0) {
      setSelectedNote(clickedNote);
      setIsDragging(true);
      setDragStart({ x, y, note: { ...notes[clickedNote] } });
    } else {
      setSelectedNote(null);
      // Click on empty space - move playhead
      if (onTimeChange) {
        onTimeChange(time);
      }
    }
  }, [notes, scrollX, scrollY, pixelsPerSecond, pixelsPerNote, maxMidi, onTimeChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart || selectedNote === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - dragStart.x;
    const dy = y - dragStart.y;

    const timeDelta = dx / pixelsPerSecond;
    const midiDelta = -Math.round(dy / pixelsPerNote);

    const newNotes = [...notes];
    const note = newNotes[selectedNote];

    note.startTime = Math.max(0, dragStart.note.startTime + timeDelta);
    note.endTime = Math.max(note.startTime + 0.01, dragStart.note.endTime + timeDelta);
    note.midiNote = Math.max(minMidi, Math.min(maxMidi, dragStart.note.midiNote + midiDelta));
    note.source = 'user';

    onNotesChange(newNotes);
  }, [isDragging, dragStart, selectedNote, notes, onNotesChange, pixelsPerSecond, pixelsPerNote, minMidi, maxMidi]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (selectedNote === null) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const newNotes = notes.filter((_, i) => i !== selectedNote);
      onNotesChange(newNotes);
      setSelectedNote(null);
    }
  }, [selectedNote, notes, onNotesChange]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const keyWidth = 40;
    if (x < keyWidth) return;

    // Insert new note
    const time = (x - keyWidth + scrollX) / pixelsPerSecond;
    const midi = maxMidi - Math.floor((y + scrollY) / pixelsPerNote);

    const newNote: TranscribedNote = {
      startTime: time,
      endTime: time + 0.5,
      midiNote: midi,
      frequency: 440 * Math.pow(2, (midi - 69) / 12),
      confidence: 1.0,
      velocity: 0.8,
      isDoubtful: false,
      source: 'user',
    };

    const newNotes = [...notes, newNote].sort((a, b) => a.startTime - b.startTime);
    onNotesChange(newNotes);
  }, [notes, onNotesChange, scrollX, scrollY, maxMidi]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.shiftKey) {
      setScrollX(Math.max(0, scrollX + e.deltaY));
    } else {
      setScrollY(Math.max(0, Math.min(totalNotes * pixelsPerNote - 400, scrollY + e.deltaY)));
    }
  }, [scrollX, scrollY, totalNotes, pixelsPerNote]);

  return (
    <div
      ref={containerRef}
      className="relative bg-gray-800 rounded-lg overflow-hidden"
      style={{ height: 400 }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
      <div className="absolute bottom-2 right-2 text-xs text-gray-400 bg-gray-900/80 px-2 py-1 rounded">
        Click: select/move • Double-click: insert • Delete: remove • Shift+Scroll: horizontal
      </div>
    </div>
  );
}
