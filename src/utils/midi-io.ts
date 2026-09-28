/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * MIDI file I/O operations using @tonejs/midi.
 */

import { Midi } from '@tonejs/midi';
import type { MidiFileInfo, TrackInfo, QuantizeParams, GrooveTemplate, QuantizeResult } from '../types';
import { quantizeSingle, extractGrooveTemplate, type GridType } from './quantizer';

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
 * Quantize a MIDI file with the given parameters.
 * Returns a new Midi object with quantized notes.
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

    let notesQuantized = 0;
    const eventsProcessed = track.notes.length * 2; // note_on + note_off

    // Convert note times to ticks
    const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;
    const ticksPerSecond = (params.ppq * bpm) / 60;

    // Collect all note data
    interface NoteData {
      startTick: number;
      endTick: number;
      midiNote: number;
      velocity: number;
      duration: number;
    }

    const noteData: NoteData[] = track.notes.map(note => ({
      startTick: Math.round(note.time * ticksPerSecond),
      endTick: Math.round((note.time + note.duration) * ticksPerSecond),
      midiNote: note.midi,
      velocity: note.velocity,
      duration: note.duration,
    }));

    // Quantize starts
    if (params.quantizeStarts) {
      for (const note of noteData) {
        const originalStart = note.startTick;
        note.startTick = quantizeSingle(originalStart, params, groove);
        notesQuantized++;
      }
    }

    // Quantize ends
    if (params.quantizeEnds) {
      for (const note of noteData) {
        const originalEnd = note.endTick;
        note.endTick = quantizeSingle(originalEnd, params, groove);
        // Ensure end is after start
        if (note.endTick <= note.startTick) {
          note.endTick = note.startTick + 1;
        }
        notesQuantized++;
      }
    }

    // Sort by start tick to maintain chronological order
    noteData.sort((a, b) => a.startTick - b.startTick);

    // Check for collisions (same tick and same note)
    const seen = new Set<string>();
    const uniqueNotes: NoteData[] = [];
    for (const note of noteData) {
      const key = `${note.startTick}-${note.midiNote}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueNotes.push(note);
      }
    }

    // Apply changes back to track - clear and re-add notes
    track.notes = [];
    for (const note of uniqueNotes) {
      const noteName = midiNoteToName(note.midiNote);
      const octave = Math.floor(note.midiNote / 12) - 1;
      const time = note.startTick / ticksPerSecond;
      const duration = (note.endTick - note.startTick) / ticksPerSecond;
      const velocity = params.preserveVelocity ? note.velocity : 0.8;
      
      track.addNote({
        midi: note.midiNote,
        name: noteName,
        octave: octave,
        velocity: velocity,
        time: time,
        duration: duration,
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
 */
export function exportMidiBlob(midi: Midi): Blob {
  const midiData = midi.toArray();
  return new Blob([new Uint8Array(midiData)], { type: 'audio/midi' });
}

/**
 * Convert MIDI note number to note name.
 */
function midiNoteToName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return noteNames[midi % 12];
}

/**
 * Extract groove template from a MIDI file.
 */
export function extractGrooveFromMidi(
  midi: Midi,
  trackIndex: number,
  grid: GridType,
  ppq: number
): GrooveTemplate {
  const track = midi.tracks[trackIndex];
  if (!track || track.notes.length === 0) {
    throw new Error('No notes found in selected track');
  }

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;
  const ticksPerSecond = (ppq * bpm) / 60;
  const noteTicks = track.notes.map(note => Math.round(note.time * ticksPerSecond));

  return extractGrooveTemplate(noteTicks, ppq, grid, 'Extracted from MIDI');
}
