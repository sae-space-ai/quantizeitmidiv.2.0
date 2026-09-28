/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * MIDI I/O with tick-based quantization and constant output tempo.
 * 
 * Strategy:
 * 1. Parse MIDI binary directly (ticks, not seconds)
 * 2. Quantize note positions in ticks
 * 3. Rebuild MIDI with single tempo of 56 BPM
 * 4. Preserve rhythmic relationships in pulse positions
 */

import { Midi } from '@tonejs/midi';
import type {
  MidiFileInfo,
  TrackInfo,
  QuantizeParams,
  GrooveTemplate,
  QuantizeResult,
  QuantizeReport,
  TrackReport,
  MidiSnapshot,
  TrackSnapshot,
  ComparisonResult,
} from '../types';
import type { ParsedNote, TimeSignatureEvent, MidiFile, MidiTrackEvent } from './midi-types';
import {
  parseMidiBinary,
  writeMidiBinary,
  analyzeTrack,
  getAllTempoEvents,
  getAllTimeSignatureEvents,
  extractNotes,
} from './binary-midi';
import {
  getGridSizeTicks,
  getTimeSignatureAtTick,
  quantizeTickFull,
  getBarDurationTicks,
} from './tick-quantizer';

/**
 * Load and parse a MIDI file from a File object.
 * Returns both @tonejs/midi object (for UI) and binary parse (for quantization).
 */
export async function loadMidiFile(
  file: File
): Promise<{ midi: Midi; info: MidiFileInfo; binaryMidi: MidiFile }> {
  const arrayBuffer = await file.arrayBuffer();
  return loadMidiFileFromBuffer(arrayBuffer, file.name);
}

/**
 * Load and parse a MIDI file from an ArrayBuffer.
 */
export async function loadMidiFileFromBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<{ midi: Midi; info: MidiFileInfo; binaryMidi: MidiFile }> {
  // Parse with @tonejs/midi for UI display
  const midi = new Midi(arrayBuffer.slice(0));
  
  // Parse binary for tick-based operations
  const binaryMidi = parseMidiBinary(arrayBuffer);
  
  const tempoEvents = getAllTempoEvents(binaryMidi);
  const timeSigEvents = getAllTimeSignatureEvents(binaryMidi);
  
  const tracks: TrackInfo[] = binaryMidi.tracks.map((track, index) => {
    const analysis = analyzeTrack(track, index);
    return {
      index,
      name: analysis.name,
      noteCount: analysis.notes.length,
      instrument: undefined,
      channel: analysis.channel,
      isMonophonic: analysis.isMonophonic,
      hasChords: analysis.hasChords,
    };
  });

  const info: MidiFileInfo = {
    name: fileName,
    ppq: binaryMidi.header.ticksPerBeat,
    duration: midi.duration,
    tracks,
    tempo: tempoEvents.length > 0 ? tempoEvents[0].bpm : 120,
    timeSignature: timeSigEvents.length > 0
      ? [timeSigEvents[0].numerator, timeSigEvents[0].denominator] as [number, number]
      : [4, 4],
    tempoChanges: tempoEvents.map(t => ({ time: t.tick, bpm: t.bpm })),
    timeSignatureChanges: timeSigEvents.map(ts => ({
      time: ts.tick,
      beats: ts.numerator,
      beatUnit: ts.denominator,
    })),
  };

  return { midi, info, binaryMidi };
}

/**
 * Create a snapshot of the current MIDI state (using @tonejs/midi for display).
 */
export function createMidiSnapshot(midi: Midi, name: string): MidiSnapshot {
  const tracks: TrackSnapshot[] = midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    channel: track.channel ?? 0,
    instrument: track.instrument?.name,
    notes: track.notes.map(note => ({
      time: note.time,
      duration: note.duration,
      midi: note.midi,
      name: note.name,
      octave: note.octave,
      velocity: note.velocity,
      channel: track.channel ?? 0,
    })),
  }));

  return {
    name,
    ppq: midi.header.ppq,
    duration: midi.duration,
    tempo: midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120,
    timeSignature: midi.header.timeSignatures.length > 0
      ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]] as [number, number]
      : [4, 4],
    tracks,
  };
}

/**
 * Compare two MIDI snapshots.
 */
export function compareSnapshots(
  before: MidiSnapshot,
  after: MidiSnapshot,
  trackIndex: number
): ComparisonResult {
  const beforeTrack = before.tracks[trackIndex];
  const afterTrack = after.tracks[trackIndex];

  if (!beforeTrack || !afterTrack) {
    return {
      trackIndex,
      trackName: beforeTrack?.name || afterTrack?.name || `Track ${trackIndex}`,
      totalNotes: 0,
      movedNotes: 0,
      unchangedNotes: 0,
      maxDisplacementMs: 0,
      avgDisplacementMs: 0,
      addedNotes: 0,
      removedNotes: 0,
      warnings: ['Track not found in one of the snapshots'],
    };
  }

  const beforeNotes = [...beforeTrack.notes].sort((a, b) => a.time - b.time);
  const afterNotes = [...afterTrack.notes].sort((a, b) => a.time - b.time);

  let movedNotes = 0;
  let unchangedNotes = 0;
  let totalDisplacement = 0;
  let maxDisplacement = 0;
  const warnings: string[] = [];
  const matchedAfter = new Set<number>();

  for (const beforeNote of beforeNotes) {
    let bestMatch = -1;
    let bestDistance = Infinity;

    for (let j = 0; j < afterNotes.length; j++) {
      if (matchedAfter.has(j)) continue;
      if (afterNotes[j].midi !== beforeNote.midi) continue;
      const distance = Math.abs(afterNotes[j].time - beforeNote.time);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0 && bestDistance < 0.5) {
      matchedAfter.add(bestMatch);
      const displacementMs = Math.abs(afterNotes[bestMatch].time - beforeNote.time) * 1000;
      if (displacementMs > 1) {
        movedNotes++;
        totalDisplacement += displacementMs;
        maxDisplacement = Math.max(maxDisplacement, displacementMs);
      } else {
        unchangedNotes++;
      }
    } else {
      warnings.push(`Note ${beforeNote.name}${beforeNote.octave} may have been removed`);
    }
  }

  const addedNotes = afterNotes.length - matchedAfter.size;
  const totalNotes = beforeNotes.length;
  const avgDisplacement = movedNotes > 0 ? totalDisplacement / movedNotes : 0;

  return {
    trackIndex,
    trackName: beforeTrack.name,
    totalNotes,
    movedNotes,
    unchangedNotes,
    maxDisplacementMs: Math.round(maxDisplacement * 100) / 100,
    avgDisplacementMs: Math.round(avgDisplacement * 100) / 100,
    addedNotes,
    removedNotes: beforeNotes.length - (movedNotes + unchangedNotes),
    warnings: warnings.slice(0, 10),
  };
}

/**
 * Quantize a MIDI file using tick-based engine.
 * 
 * Process:
 * 1. Parse binary MIDI to get events in ticks
 * 2. For each selected track, quantize note positions
 * 3. Rebuild MIDI with constant 56 BPM tempo
 * 4. Preserve all non-note events (program changes, CCs, etc.)
 */
export function quantizeMidiBinary(
  binaryMidi: MidiFile,
  params: QuantizeParams,
  trackIndices: number[],
  groove: GrooveTemplate | null
): { quantizedMidi: MidiFile; result: QuantizeResult } {
  const ppq = binaryMidi.header.ticksPerBeat;
  const outputTempo = params.outputTempo || 56;
  const outputMicrosecondsPerBeat = Math.round(60000000 / outputTempo);
  
  // Get all time signature events
  const allTimeSigs = getAllTimeSignatureEvents(binaryMidi);
  
  // Clone the MIDI structure
  const quantizedMidi: MidiFile = {
    header: { ...binaryMidi.header },
    tracks: binaryMidi.tracks.map(track => [...track]),
  };
  
  let totalNotesQuantized = 0;
  let totalEventsProcessed = 0;
  const perTrackReports: TrackReport[] = [];
  const allWarnings: string[] = [];
  let globalMaxDisplacement = 0;
  let globalTotalDisplacement = 0;
  let globalMovedNotes = 0;

  for (const trackIndex of trackIndices) {
    if (trackIndex >= quantizedMidi.tracks.length) {
      allWarnings.push(`Track ${trackIndex} not found, skipping`);
      continue;
    }
    
    const track = quantizedMidi.tracks[trackIndex];
    const analysis = analyzeTrack(track, trackIndex);
    
    if (analysis.notes.length === 0) {
      allWarnings.push(`Track "${analysis.name}" has no notes, skipping`);
      continue;
    }
    
    const report = quantizeTrackTicks(
      track,
      analysis.notes,
      ppq,
      allTimeSigs,
      params,
      groove,
      trackIndex,
      analysis.name
    );
    
    perTrackReports.push(report);
    totalNotesQuantized += report.notesMoved * 2;
    totalEventsProcessed += report.notesProcessed * 2;
    globalMaxDisplacement = Math.max(globalMaxDisplacement, report.maxDisplacementMs);
    globalTotalDisplacement += report.notesMoved * report.avgDisplacementMs;
    globalMovedNotes += report.notesMoved;
    allWarnings.push(...report.warnings);
  }

  // Replace all tempo events with single output tempo
  // Remove all setTempo events from all tracks
  for (const track of quantizedMidi.tracks) {
    const filtered = track.filter(e => e.type !== 'setTempo');
    track.length = 0;
    track.push(...filtered);
  }
  
  // Add single tempo event at tick 0 in the first track
  if (quantizedMidi.tracks.length > 0) {
    quantizedMidi.tracks[0].push({
      absoluteTime: 0,
      deltaTime: 0,
      type: 'setTempo',
      microsecondsPerBeat: outputMicrosecondsPerBeat,
    } as any);
  }
  
  allWarnings.push(`Tempo set to ${outputTempo} BPM constant (single event at tick 0)`);
  allWarnings.push(`PPQ: ${ppq}, Grid: ${params.grid}`);

  const report: QuantizeReport = {
    totalNotes: totalEventsProcessed / 2,
    notesMoved: globalMovedNotes,
    notesUnchanged: (totalEventsProcessed / 2) - globalMovedNotes,
    maxDisplacementMs: globalMovedNotes > 0
      ? Math.round(globalMaxDisplacement * 100) / 100
      : 0,
    avgDisplacementMs: globalMovedNotes > 0
      ? Math.round((globalTotalDisplacement / globalMovedNotes) * 100) / 100
      : 0,
    warnings: allWarnings.slice(0, 20),
    perTrack: perTrackReports,
  };

  return {
    quantizedMidi,
    result: {
      success: true,
      message: `Quantized ${trackIndices.length} track(s), ${globalMovedNotes} notes moved. Output: ${outputTempo} BPM, PPQ ${ppq}`,
      eventsProcessed: totalEventsProcessed,
      notesQuantized: totalNotesQuantized,
      report,
    },
  };
}

/**
 * Quantize a single track in tick domain.
 */
function quantizeTrackTicks(
  track: MidiTrackEvent[],
  notes: ParsedNote[],
  ppq: number,
  timeSignatures: TimeSignatureEvent[],
  params: QuantizeParams,
  groove: GrooveTemplate | null,
  trackIndex: number,
  trackName: string
): TrackReport {
  const notesProcessed = notes.length;
  let notesMoved = 0;
  let totalDisplacementTicks = 0;
  let maxDisplacementTicks = 0;
  const warnings: string[] = [];
  
  // Build a map of original noteOn/noteOff events by their tick
  const noteOnByTick = new Map<string, number>(); // key: "channel-note-startTick" -> index in track
  const noteOffByTick = new Map<string, number>(); // key: "channel-note-endTick" -> index in track
  
  // Track which events we've processed
  const processedEvents = new Set<number>();
  
  // Map original notes to their event indices
  interface NoteEventMapping {
    noteOnIndex: number;
    noteOffIndex: number;
    note: ParsedNote;
  }
  const noteMappings: NoteEventMapping[] = [];
  
  // Find noteOn and noteOff events for each note
  const sortedNotes = [...notes].sort((a, b) => a.startTick - b.startTick);
  const pendingNoteOns = new Map<string, number>(); // "channel-noteNumber" -> event index
  
  for (let i = 0; i < track.length; i++) {
    const event = track[i];
    
    if (event.type === 'noteOn' && (event as any).velocity > 0) {
      const key = `${(event as any).channel}-${(event as any).noteNumber}`;
      // If there's already a pending noteOn, close it
      if (pendingNoteOns.has(key)) {
        pendingNoteOns.delete(key);
      }
      pendingNoteOns.set(key, i);
    } else if (event.type === 'noteOff' || (event.type === 'noteOn' && (event as any).velocity === 0)) {
      const key = `${(event as any).channel}-${(event as any).noteNumber}`;
      const noteOnIdx = pendingNoteOns.get(key);
      if (noteOnIdx !== undefined) {
        const noteOnEvent = track[noteOnIdx] as any;
        const note = sortedNotes.find(n => 
          n.channel === noteOnEvent.channel && 
          n.noteNumber === noteOnEvent.noteNumber &&
          n.startTick === track[noteOnIdx].absoluteTime
        );
        if (note) {
          noteMappings.push({
            noteOnIndex: noteOnIdx,
            noteOffIndex: i,
            note,
          });
        }
        pendingNoteOns.delete(key);
      }
    }
  }
  
  // Quantize each note
  for (const mapping of noteMappings) {
    const { noteOnIndex, noteOffIndex, note } = mapping;
    const originalStart = note.startTick;
    const originalEnd = note.endTick;
    
    // Get time signature at note position
    const timeSig = getTimeSignatureAtTick(note.startTick, timeSignatures);
    const gridSize = getGridSizeTicks(ppq, params.grid);
    
    let newStart = note.startTick;
    let newEnd = note.endTick;
    
    // Quantize start
    if (params.quantizeStarts) {
      newStart = quantizeTickFull(note.startTick, gridSize, params, groove);
      const displacement = Math.abs(newStart - originalStart);
      if (displacement > 0) {
        notesMoved++;
        totalDisplacementTicks += displacement;
        maxDisplacementTicks = Math.max(maxDisplacementTicks, displacement);
      }
    }
    
    // Quantize end
    if (params.quantizeEnds) {
      newEnd = quantizeTickFull(note.endTick, gridSize, params, groove);
    }
    
    // Ensure positive duration
    const duration = Math.max(1, newEnd - newStart);
    newEnd = newStart + duration;
    
    // Update event times
    (track[noteOnIndex] as any).absoluteTime = newStart;
    (track[noteOffIndex] as any).absoluteTime = newEnd;
    
    processedEvents.add(noteOnIndex);
    processedEvents.add(noteOffIndex);
  }
  
  // Handle monophonic tracks - prevent overlaps
  if (notes.length > 0 && detectMonophonicFromNotes(notes)) {
    // Sort note mappings by new start time
    const sortedMappings = [...noteMappings].sort((a, b) => {
      const aStart = (track[a.noteOnIndex] as any).absoluteTime;
      const bStart = (track[b.noteOnIndex] as any).absoluteTime;
      return aStart - bStart;
    });
    
    for (let i = 0; i < sortedMappings.length - 1; i++) {
      const currentEnd = (track[sortedMappings[i].noteOffIndex] as any).absoluteTime;
      const nextStart = (track[sortedMappings[i + 1].noteOnIndex] as any).absoluteTime;
      
      if (currentEnd > nextStart) {
        (track[sortedMappings[i].noteOffIndex] as any).absoluteTime = nextStart;
        warnings.push('Note shortened to prevent overlap in mono track');
      }
    }
  }
  
  // Convert tick displacement to ms (approximate, using output tempo)
  const outputTempo = params.outputTempo || 56;
  const ticksPerMs = (ppq * outputTempo) / 60000;
  const maxDisplacementMs = maxDisplacementTicks / ticksPerMs;
  const avgDisplacementMs = notesMoved > 0 
    ? (totalDisplacementTicks / notesMoved) / ticksPerMs
    : 0;

  return {
    trackIndex,
    trackName,
    notesProcessed,
    notesMoved,
    notesUnchanged: notesProcessed - notesMoved,
    maxDisplacementMs: Math.round(maxDisplacementMs * 100) / 100,
    avgDisplacementMs: Math.round(avgDisplacementMs * 100) / 100,
    warnings: warnings.slice(0, 10),
  };
}

/**
 * Detect monophonic from parsed notes.
 */
function detectMonophonicFromNotes(notes: ParsedNote[]): boolean {
  if (notes.length <= 1) return true;
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTick > sorted[i + 1].startTick) {
      return false;
    }
  }
  return true;
}

/**
 * Export quantized MIDI to blob.
 */
export function exportQuantizedMidiBlob(quantizedMidi: MidiFile): Blob {
  const binaryData = writeMidiBinary(quantizedMidi);
  const buffer = new ArrayBuffer(binaryData.length);
  const view = new Uint8Array(buffer);
  view.set(binaryData);
  return new Blob([buffer], { type: 'audio/midi' });
}

/**
 * Verify a MIDI blob by re-reading it.
 * Checks PPQ, tempo, time signatures, and note validity.
 */
export async function verifyMidiBlob(blob: Blob): Promise<{
  valid: boolean;
  message: string;
  tempoInfo?: string;
  ppq?: number;
  trackCount?: number;
  noteCount?: number;
}> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const binaryMidi = parseMidiBinary(arrayBuffer);
    
    const ppq = binaryMidi.header.ticksPerBeat;
    const tempoEvents = getAllTempoEvents(binaryMidi);
    const timeSigEvents = getAllTimeSignatureEvents(binaryMidi);
    
    let totalNotes = 0;
    for (const track of binaryMidi.tracks) {
      const notes = extractNotes(track);
      totalNotes += notes.length;
      
      // Check for invalid notes
      for (const note of notes) {
        if (note.durationTicks <= 0) {
          return {
            valid: false,
            message: `Invalid note duration: ${note.durationTicks} ticks`,
            ppq,
          };
        }
        if (note.startTick < 0) {
          return {
            valid: false,
            message: `Invalid note start tick: ${note.startTick}`,
            ppq,
          };
        }
      }
    }
    
    // Check tempo
    let tempoInfo = '';
    if (tempoEvents.length === 0) {
      tempoInfo = 'No tempo events (default 120 BPM)';
    } else if (tempoEvents.length === 1) {
      tempoInfo = `Single tempo: ${tempoEvents[0].bpm.toFixed(1)} BPM at tick ${tempoEvents[0].tick}`;
    } else {
      tempoInfo = `Multiple tempos: ${tempoEvents.map(t => `${t.bpm.toFixed(1)} BPM`).join(', ')}`;
    }
    
    return {
      valid: true,
      message: `Valid MIDI: ${binaryMidi.tracks.length} tracks, ${totalNotes} notes, PPQ ${ppq}`,
      tempoInfo,
      ppq,
      trackCount: binaryMidi.tracks.length,
      noteCount: totalNotes,
    };
  } catch (error) {
    return {
      valid: false,
      message: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate text report.
 */
export function generateTextReport(report: QuantizeReport, fileName: string): string {
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push('QUANTIZE.IT - Quantization Report');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Source file: ${fileName}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push('-'.repeat(40));
  lines.push(`Total notes processed: ${report.totalNotes}`);
  lines.push(`Notes moved: ${report.notesMoved}`);
  lines.push(`Notes unchanged: ${report.notesUnchanged}`);
  lines.push(`Max displacement: ${report.maxDisplacementMs} ms`);
  lines.push(`Avg displacement: ${report.avgDisplacementMs} ms`);
  lines.push('');
  
  if (report.perTrack.length > 0) {
    lines.push('PER-TRACK DETAILS');
    lines.push('-'.repeat(40));
    for (const track of report.perTrack) {
      lines.push(`Track ${track.trackIndex + 1}: ${track.trackName}`);
      lines.push(`  Notes processed: ${track.notesProcessed}`);
      lines.push(`  Notes moved: ${track.notesMoved}`);
      lines.push(`  Notes unchanged: ${track.notesUnchanged}`);
      lines.push(`  Max displacement: ${track.maxDisplacementMs} ms`);
      lines.push(`  Avg displacement: ${track.avgDisplacementMs} ms`);
      if (track.warnings.length > 0) {
        lines.push('  Warnings:');
        for (const w of track.warnings) {
          lines.push(`    - ${w}`);
        }
      }
      lines.push('');
    }
  }
  
  if (report.warnings.length > 0) {
    lines.push('GLOBAL WARNINGS');
    lines.push('-'.repeat(40));
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }
  
  lines.push('='.repeat(60));
  lines.push('End of report');
  lines.push('='.repeat(60));
  
  return lines.join('\n');
}
