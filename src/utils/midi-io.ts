/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * MIDI file I/O operations using @tonejs/midi.
 * 
 * Works in time domain (seconds) to properly handle tempo changes.
 * Preserves all MIDI events including program changes, control changes, etc.
 */

import { Midi } from '@tonejs/midi';
import type { MidiFileInfo, TrackInfo, QuantizeParams, GrooveTemplate, QuantizeResult, GridType } from '../types';
import { getGridIntervalSeconds, quantizeSingleTime, extractGrooveTemplate } from './quantizer';

/**
 * Load and parse a MIDI file from a File object.
 */
export async function loadMidiFile(file: File): Promise<{ midi: Midi; info: MidiFileInfo }> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const tracks: TrackInfo[] = midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    noteCount: track.notes.length,
    instrument: track.instrument?.name || undefined,
  }));

  const info: MidiFileInfo = {
    name: file.name,
    ppq: midi.header.ppq,
    duration: midi.duration,
    tracks,
    tempo: midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120,
    timeSignature: midi.header.timeSignatures.length > 0
      ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]] as [number, number]
      : [4, 4],
  };

  return { midi, info };
}

/**
 * Get the current BPM at a given time, considering tempo changes.
 */
function getBpmAtTime(midi: Midi, time: number): number {
  if (midi.header.tempos.length === 0) return 120;

  // Find the last tempo change before or at the given time
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
 * Detect if a track is monophonic (no overlapping notes).
 */
function isTrackMonophonic(notes: Array<{ time: number; duration: number }>): boolean {
  if (notes.length <= 1) return true;

  // Sort by start time
  const sorted = [...notes].sort((a, b) => a.time - b.time);

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = sorted[i].time + sorted[i].duration;
    const nextStart = sorted[i + 1].time;

    // If current note ends after next note starts, it's polyphonic
    if (currentEnd > nextStart) {
      return false;
    }
  }

  return true;
}

/**
 * Quantize a MIDI file with the given parameters.
 * Works in time domain (seconds) to properly handle tempo changes.
 */
export function quantizeMidi(
  midi: Midi,
  params: QuantizeParams,
  trackIndex: number,
  groove: GrooveTemplate | null
): QuantizeResult {
  try {
    const track = midi.tracks[trackIndex];
    if (!track) {
      throw new Error(`Track ${trackIndex} not found`);
    }

    if (track.notes.length === 0) {
      throw new Error('Track has no notes to quantize');
    }

    let notesQuantized = 0;
    const eventsProcessed = track.notes.length * 2; // note_on + note_off

    // Detect if track is monophonic
    const isMono = isTrackMonophonic(track.notes);

    // Process each note
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
      // Get BPM at note start time
      const bpm = getBpmAtTime(midi, note.time);
      const gridInterval = getGridIntervalSeconds(bpm, params.grid);

      let newTime = note.time;
      let newDuration = note.duration;

      // Quantize start time
      if (params.quantizeStarts) {
        newTime = quantizeSingleTime(note.time, gridInterval, params, groove);
        notesQuantized++;
      }

      // Quantize end time
      if (params.quantizeEnds) {
        const endTime = note.time + note.duration;
        const bpmEnd = getBpmAtTime(midi, endTime);
        const gridIntervalEnd = getGridIntervalSeconds(bpmEnd, params.grid);
        const newEndTime = quantizeSingleTime(endTime, gridIntervalEnd, params, groove);

        // Ensure duration is positive
        newDuration = Math.max(0.001, newEndTime - newTime);
        notesQuantized++;
      } else {
        // Preserve original duration
        newDuration = note.duration;
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

    // Sort by time to maintain chronological order
    quantizedNotes.sort((a, b) => a.time - b.time);

    // For monophonic tracks, ensure no overlapping notes
    if (isMono) {
      for (let i = 0; i < quantizedNotes.length - 1; i++) {
        const currentEnd = quantizedNotes[i].time + quantizedNotes[i].duration;
        const nextStart = quantizedNotes[i + 1].time;

        // If overlap, shorten current note
        if (currentEnd > nextStart) {
          quantizedNotes[i].duration = Math.max(0.001, nextStart - quantizedNotes[i].time);
        }
      }
    }

    // For polyphonic tracks, handle simultaneous notes (chords)
    // Keep them as separate notes but ensure proper ordering
    // No special handling needed - @tonejs/midi will manage this

    // Clear existing notes and add quantized ones
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

    return {
      success: true,
      message: `Quantized ${notesQuantized} events successfully`,
      eventsProcessed,
      notesQuantized,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during quantization',
      eventsProcessed: 0,
      notesQuantized: 0,
    };
  }
}

/**
 * Export a Midi object as a downloadable blob.
 * Returns a Blob containing valid MIDI data.
 */
export function exportMidiBlob(midi: Midi): Blob {
  const midiData = midi.toArray();
  // midi.toArray() returns Uint8Array, create a proper copy for the Blob
  const buffer = new ArrayBuffer(midiData.length);
  const view = new Uint8Array(buffer);
  view.set(midiData);
  return new Blob([buffer], { type: 'audio/midi' });
}

/**
 * Extract groove template from a MIDI file.
 */
export function extractGrooveFromMidi(
  midi: Midi,
  trackIndex: number,
  grid: GridType,
  _ppq: number
): GrooveTemplate {
  const track = midi.tracks[trackIndex];
  if (!track || track.notes.length === 0) {
    throw new Error('No notes found in selected track');
  }

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;
  const noteTimes = track.notes.map(note => note.time);

  return extractGrooveTemplate(noteTimes, bpm, grid, 'Extracted from MIDI');
}
