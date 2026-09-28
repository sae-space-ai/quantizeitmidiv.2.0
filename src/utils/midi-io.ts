/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * MIDI file I/O operations with constant output tempo.
 * 
 * Strategy:
 * 1. Convert note times to grid positions using local BPM
 * 2. Quantize grid positions
 * 3. Convert back to time using outputTempo (56 BPM)
 * 4. Replace all tempos with single outputTempo
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
  GridType,
  MidiSnapshot,
  TrackSnapshot,
  ComparisonResult,
} from '../types';
import {
  timeToGridPosition,
  gridPositionToTime,
  quantizeGridPositionFull,
  getGridIntervalSeconds,
} from './quantizer';

/**
 * Load and parse a MIDI file from a File object.
 */
export async function loadMidiFile(file: File): Promise<{ midi: Midi; info: MidiFileInfo }> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const tempoChanges = midi.header.tempos.map(t => ({
    time: t.time ?? 0,
    bpm: t.bpm,
  }));

  const timeSignatureChanges = midi.header.timeSignatures.map((ts: any) => ({
    time: ts.time ?? 0,
    beats: ts.timeSignature[0],
    beatUnit: ts.timeSignature[1],
  }));

  const tracks: TrackInfo[] = midi.tracks.map((track, index) => {
    const isMono = detectMonophonic(track.notes);
    const hasChords = detectChords(track.notes);
    return {
      index,
      name: track.name || `Track ${index + 1}`,
      noteCount: track.notes.length,
      instrument: track.instrument?.name || undefined,
      channel: track.channel ?? 0,
      isMonophonic: isMono,
      hasChords,
    };
  });

  const info: MidiFileInfo = {
    name: file.name,
    ppq: midi.header.ppq,
    duration: midi.duration,
    tracks,
    tempo: midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120,
    timeSignature: midi.header.timeSignatures.length > 0
      ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]] as [number, number]
      : [4, 4],
    tempoChanges,
    timeSignatureChanges,
  };

  return { midi, info };
}

/**
 * Detect if a track is monophonic.
 */
function detectMonophonic(notes: Array<{ time: number; duration: number }>): boolean {
  if (notes.length <= 1) return true;
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = sorted[i].time + sorted[i].duration;
    const nextStart = sorted[i + 1].time;
    if (currentEnd > nextStart + 0.001) {
      return false;
    }
  }
  return true;
}

/**
 * Detect if a track contains chords.
 */
function detectChords(notes: Array<{ time: number; midi: number }>): boolean {
  if (notes.length <= 1) return false;
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentTime = sorted[i].time;
    const nextTime = sorted[i + 1].time;
    if (Math.abs(currentTime - nextTime) < 0.01 && sorted[i].midi !== sorted[i + 1].midi) {
      return true;
    }
  }
  return false;
}

/**
 * Get the current BPM at a given time, considering tempo changes.
 */
function getBpmAtTime(midi: Midi, time: number): number {
  if (midi.header.tempos.length === 0) return 120;
  let currentBpm = midi.header.tempos[0].bpm;
  for (const tempo of midi.header.tempos) {
    if (tempo.time !== undefined && tempo.time <= time) {
      currentBpm = tempo.bpm;
    } else if (tempo.time !== undefined && tempo.time > time) {
      break;
    }
  }
  return currentBpm;
}

/**
 * Get the current time signature at a given time.
 */
function getTimeSignatureAtTime(midi: Midi, time: number): [number, number] {
  if (midi.header.timeSignatures.length === 0) return [4, 4];
  let current = midi.header.timeSignatures[0].timeSignature as [number, number];
  for (const ts of midi.header.timeSignatures) {
    const tsAny = ts as any;
    if (tsAny.time !== undefined && tsAny.time <= time) {
      current = ts.timeSignature as [number, number];
    } else if (tsAny.time !== undefined && tsAny.time > time) {
      break;
    }
  }
  return current;
}

/**
 * Create a snapshot of the current MIDI state.
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
      warnings.push(`Note ${beforeNote.name}${beforeNote.octave} at ${(beforeNote.time * 1000).toFixed(0)}ms may have been removed`);
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
 * Quantize a MIDI file with constant output tempo.
 * 
 * Strategy:
 * 1. Convert each note time to grid position using local BPM
 * 2. Quantize the grid position
 * 3. Convert quantized position back to time using outputTempo
 * 4. Replace all tempos with single outputTempo
 */
export function quantizeMidi(
  midi: Midi,
  params: QuantizeParams,
  trackIndices: number[],
  groove: GrooveTemplate | null
): QuantizeResult {
  try {
    if (trackIndices.length === 0) {
      throw new Error('No tracks selected for quantization');
    }

    const outputTempo = params.outputTempo || 56;
    let totalNotesQuantized = 0;
    let totalEventsProcessed = 0;
    const perTrackReports: TrackReport[] = [];
    const allWarnings: string[] = [];
    let globalMaxDisplacement = 0;
    let globalTotalDisplacement = 0;
    let globalMovedNotes = 0;

    for (const trackIndex of trackIndices) {
      const track = midi.tracks[trackIndex];
      if (!track) {
        allWarnings.push(`Track ${trackIndex} not found, skipping`);
        continue;
      }

      if (track.notes.length === 0) {
        allWarnings.push(`Track "${track.name}" has no notes, skipping`);
        continue;
      }

      const trackReport = quantizeTrack(midi, track, trackIndex, params, groove, outputTempo);
      perTrackReports.push(trackReport);

      totalNotesQuantized += trackReport.notesMoved * 2;
      totalEventsProcessed += trackReport.notesProcessed * 2;
      globalMaxDisplacement = Math.max(globalMaxDisplacement, trackReport.maxDisplacementMs);
      globalTotalDisplacement += trackReport.notesMoved * trackReport.avgDisplacementMs;
      globalMovedNotes += trackReport.notesMoved;
      allWarnings.push(...trackReport.warnings);
    }

    // Replace all tempos with single outputTempo at time 0
    midi.header.tempos = [];
    midi.header.tempos.push({
      bpm: outputTempo,
      time: 0,
    } as any);

    allWarnings.push(`Tempo set to ${outputTempo} BPM constant`);

    const report: QuantizeReport = {
      totalNotes: totalEventsProcessed / 2,
      notesMoved: globalMovedNotes,
      notesUnchanged: (totalEventsProcessed / 2) - globalMovedNotes,
      maxDisplacementMs: Math.round(globalMaxDisplacement * 100) / 100,
      avgDisplacementMs: globalMovedNotes > 0
        ? Math.round((globalTotalDisplacement / globalMovedNotes) * 100) / 100
        : 0,
      warnings: allWarnings.slice(0, 20),
      perTrack: perTrackReports,
    };

    return {
      success: true,
      message: `Quantized ${trackIndices.length} track(s), ${globalMovedNotes} notes moved. Output tempo: ${outputTempo} BPM`,
      eventsProcessed: totalEventsProcessed,
      notesQuantized: totalNotesQuantized,
      report,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during quantization',
      eventsProcessed: 0,
      notesQuantized: 0,
      report: null,
    };
  }
}

/**
 * Quantize a single track using grid position strategy.
 */
function quantizeTrack(
  midi: Midi,
  track: any,
  trackIndex: number,
  params: QuantizeParams,
  groove: GrooveTemplate | null,
  outputTempo: number
): TrackReport {
  const isMono = detectMonophonic(track.notes);
  const notesProcessed = track.notes.length;
  let notesMoved = 0;
  let totalDisplacement = 0;
  let maxDisplacement = 0;
  const warnings: string[] = [];

  interface QuantizedNote {
    time: number;
    duration: number;
    midi: number;
    name: string;
    octave: number;
    velocity: number;
  }

  const quantizedNotes: QuantizedNote[] = [];

  for (const note of track.notes) {
    const originalTime = note.time;
    const originalEndTime = note.time + note.duration;

    // Get BPM at note start and end times
    const bpmStart = getBpmAtTime(midi, note.time);
    const bpmEnd = getBpmAtTime(midi, originalEndTime);
    const timeSigStart = getTimeSignatureAtTime(midi, note.time);
    const timeSigEnd = getTimeSignatureAtTime(midi, originalEndTime);

    let newTime = note.time;
    let newDuration = note.duration;

    // Quantize start time
    if (params.quantizeStarts) {
      // Convert to grid position using local BPM
      const startPos = timeToGridPosition(note.time, bpmStart, params.grid);
      
      // Quantize the position
      const quantizedPos = quantizeGridPositionFull(startPos, params, groove);
      
      // Convert back to time using outputTempo
      newTime = gridPositionToTime(quantizedPos, outputTempo, params.grid);
      
      const displacementMs = Math.abs(newTime - originalTime) * 1000;
      if (displacementMs > 1) {
        notesMoved++;
        totalDisplacement += displacementMs;
        maxDisplacement = Math.max(maxDisplacement, displacementMs);
      }
    }

    // Quantize end time
    if (params.quantizeEnds) {
      const endPos = timeToGridPosition(originalEndTime, bpmEnd, params.grid);
      const quantizedEndPos = quantizeGridPositionFull(endPos, params, groove);
      const newEndTime = gridPositionToTime(quantizedEndPos, outputTempo, params.grid);
      newDuration = Math.max(0.001, newEndTime - newTime);
    } else {
      // Preserve original duration but scale it to outputTempo
      // Calculate duration in grid units, then convert to outputTempo time
      const durationGridUnits = note.duration / getGridIntervalSeconds(bpmStart, params.grid, timeSigStart);
      newDuration = durationGridUnits * getGridIntervalSeconds(outputTempo, params.grid);
    }

    quantizedNotes.push({
      time: newTime,
      duration: newDuration,
      midi: note.midi,
      name: note.name,
      octave: note.octave,
      velocity: params.preserveVelocity ? note.velocity : 0.8,
    });
  }

  // Sort by time
  quantizedNotes.sort((a, b) => a.time - b.time);

  // For monophonic tracks, ensure no overlapping notes
  if (isMono) {
    for (let i = 0; i < quantizedNotes.length - 1; i++) {
      const currentEnd = quantizedNotes[i].time + quantizedNotes[i].duration;
      const nextStart = quantizedNotes[i + 1].time;
      if (currentEnd > nextStart) {
        quantizedNotes[i].duration = Math.max(0.001, nextStart - quantizedNotes[i].time);
        warnings.push(`Note shortened to avoid overlap in mono track`);
      }
    }
  }

  // Clear and re-add notes
  track.notes = [];
  for (const note of quantizedNotes) {
    track.addNote({
      midi: note.midi,
      name: note.name,
      octave: note.octave,
      velocity: note.velocity,
      time: note.time,
      duration: note.duration,
    });
  }

  const avgDisplacement = notesMoved > 0 ? totalDisplacement / notesMoved : 0;

  return {
    trackIndex,
    trackName: track.name || `Track ${trackIndex + 1}`,
    notesProcessed,
    notesMoved,
    notesUnchanged: notesProcessed - notesMoved,
    maxDisplacementMs: Math.round(maxDisplacement * 100) / 100,
    avgDisplacementMs: Math.round(avgDisplacement * 100) / 100,
    warnings: warnings.slice(0, 10),
  };
}

/**
 * Export a Midi object as a downloadable blob.
 */
export function exportMidiBlob(midi: Midi): Blob {
  const midiData = midi.toArray();
  const buffer = new ArrayBuffer(midiData.length);
  const view = new Uint8Array(buffer);
  view.set(midiData);
  return new Blob([buffer], { type: 'audio/midi' });
}

/**
 * Verify a MIDI blob and check for constant tempo.
 */
export async function verifyMidiBlob(blob: Blob): Promise<{ valid: boolean; message: string; tempoInfo?: string }> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const midi = new Midi(arrayBuffer);

    if (midi.tracks.length === 0) {
      return { valid: false, message: 'MIDI has no tracks' };
    }

    const totalNotes = midi.tracks.reduce((sum, t) => sum + t.notes.length, 0);
    if (totalNotes === 0) {
      return { valid: false, message: 'MIDI has no notes' };
    }

    // Check for negative durations
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        if (note.duration <= 0) {
          return { valid: false, message: `Invalid note duration: ${note.duration}s` };
        }
        if (note.time < 0) {
          return { valid: false, message: `Invalid note time: ${note.time}s` };
        }
      }
    }

    // Check tempo
    let tempoInfo = '';
    if (midi.header.tempos.length === 0) {
      tempoInfo = 'No tempo events found (default 120 BPM)';
    } else if (midi.header.tempos.length === 1) {
      const tempo = midi.header.tempos[0];
      tempoInfo = `Single tempo: ${tempo.bpm} BPM at ${(tempo.time ?? 0).toFixed(2)}s`;
    } else {
      const tempos = midi.header.tempos.map(t => `${t.bpm} BPM`).join(', ');
      tempoInfo = `Multiple tempos detected: ${tempos}`;
    }

    return {
      valid: true,
      message: `Valid MIDI: ${midi.tracks.length} tracks, ${totalNotes} notes, ${midi.duration.toFixed(1)}s`,
      tempoInfo,
    };
  } catch (error) {
    return {
      valid: false,
      message: `MIDI verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate a text report.
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
        lines.push(`  Warnings:`);
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
