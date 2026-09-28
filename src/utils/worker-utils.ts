/**
 * QUANTIZE.IT - Worker Utilities
 * 
 * Shared code for Web Worker. Contains MIDI parsing and quantization
 * logic that runs off the main thread.
 */

import type { MidiFile, MidiTrackEvent, ParsedNote, TempoEvent, TimeSignatureEvent } from './midi-types';
import type { GridType, QuantizeParams, GrooveTemplate } from '../types';

// @ts-ignore - midi-file has no types
import { parseMidi as midiParse, writeMidi as midiWrite } from 'midi-file';

// ============ MIDI PARSING ============

export function parseMidiBinary(buffer: ArrayBuffer): MidiFile {
  const uint8 = new Uint8Array(buffer);
  const parsed = midiParse(uint8);
  
  const tracks: MidiTrackEvent[][] = parsed.tracks.map((track: any[]) => {
    let absoluteTime = 0;
    return track.map((event: any) => {
      absoluteTime += event.deltaTime;
      return { ...event, absoluteTime };
    }) as MidiTrackEvent[];
  });

  return {
    header: {
      formatType: parsed.header.format,
      numTracks: parsed.header.numTracks,
      ticksPerBeat: parsed.header.ticksPerBeat || 480,
    },
    tracks,
  };
}

export function writeMidiBinary(midi: MidiFile): Uint8Array {
  const tracks = midi.tracks.map(track => {
    let lastTime = 0;
    return track
      .slice()
      .sort((a, b) => a.absoluteTime - b.absoluteTime)
      .map(event => {
        const deltaTime = event.absoluteTime - lastTime;
        lastTime = event.absoluteTime;
        const { absoluteTime, ...rest } = event;
        return { ...rest, deltaTime };
      });
  });

  const result = midiWrite({
    header: {
      format: midi.header.formatType as 0 | 1 | 2,
      numTracks: midi.header.numTracks,
      ticksPerBeat: midi.header.ticksPerBeat,
    },
    tracks: tracks as any,
  });

  return new Uint8Array(result);
}

export function extractNotes(track: MidiTrackEvent[]): ParsedNote[] {
  const pending = new Map<string, { channel: number; noteNumber: number; velocity: number; tick: number }>();
  const notes: ParsedNote[] = [];

  for (const event of track) {
    if (event.type === 'noteOn' && (event as any).velocity > 0) {
      const key = `${(event as any).channel}-${(event as any).noteNumber}`;
      const existing = pending.get(key);
      if (existing) {
        notes.push({
          channel: existing.channel,
          noteNumber: existing.noteNumber,
          velocity: existing.velocity,
          startTick: existing.tick,
          endTick: event.absoluteTime,
          durationTicks: event.absoluteTime - existing.tick,
        });
      }
      pending.set(key, {
        channel: (event as any).channel,
        noteNumber: (event as any).noteNumber,
        velocity: (event as any).velocity,
        tick: event.absoluteTime,
      });
    } else if (event.type === 'noteOff' || (event.type === 'noteOn' && (event as any).velocity === 0)) {
      const key = `${(event as any).channel}-${(event as any).noteNumber}`;
      const noteOn = pending.get(key);
      if (noteOn) {
        notes.push({
          channel: noteOn.channel,
          noteNumber: noteOn.noteNumber,
          velocity: noteOn.velocity,
          startTick: noteOn.tick,
          endTick: event.absoluteTime,
          durationTicks: event.absoluteTime - noteOn.tick,
        });
        pending.delete(key);
      }
    }
  }

  // Close remaining pending notes
  for (const [, noteOn] of pending) {
    const lastTime = track.length > 0 ? track[track.length - 1].absoluteTime : noteOn.tick;
    notes.push({
      channel: noteOn.channel,
      noteNumber: noteOn.noteNumber,
      velocity: noteOn.velocity,
      startTick: noteOn.tick,
      endTick: Math.max(lastTime, noteOn.tick + 1),
      durationTicks: Math.max(1, lastTime - noteOn.tick),
    });
  }

  return notes.sort((a, b) => a.startTick - b.startTick);
}

export function getAllTimeSignatureEvents(midi: MidiFile): TimeSignatureEvent[] {
  const allSigs: TimeSignatureEvent[] = [];
  for (const track of midi.tracks) {
    for (const event of track) {
      if (event.type === 'timeSignature') {
        allSigs.push({
          tick: event.absoluteTime,
          numerator: (event as any).numerator,
          denominator: (event as any).denominator,
        });
      }
    }
  }
  return allSigs.sort((a, b) => a.tick - b.tick);
}

// ============ QUANTIZATION ============

export function getGridSizeTicks(ppq: number, grid: GridType): number {
  const gridConfig: Record<GridType, { division: number; isTriplet: boolean }> = {
    '1/4':  { division: 1,  isTriplet: false },
    '1/8':  { division: 2,  isTriplet: false },
    '1/16': { division: 4,  isTriplet: false },
    '1/32': { division: 8,  isTriplet: false },
    '1/4T': { division: 1,  isTriplet: true },
    '1/8T': { division: 2,  isTriplet: true },
    '1/16T': { division: 4, isTriplet: true },
  };

  const config = gridConfig[grid];
  if (!config) throw new Error(`Invalid grid: ${grid}`);

  let gridSize = ppq / config.division;
  if (config.isTriplet) gridSize = (gridSize * 2) / 3;
  return gridSize;
}

export function getTimeSignatureAtTick(tick: number, timeSignatures: TimeSignatureEvent[]): [number, number] {
  if (timeSignatures.length === 0) return [4, 4];
  let current: [number, number] = [timeSignatures[0].numerator, timeSignatures[0].denominator];
  for (const ts of timeSignatures) {
    if (ts.tick <= tick) current = [ts.numerator, ts.denominator];
    else break;
  }
  return current;
}

export function quantizeTickFull(
  originalTick: number,
  gridSize: number,
  params: QuantizeParams,
  _groove: GrooveTemplate | null
): number {
  // Quantize to grid
  let result = Math.round(originalTick / gridSize) * gridSize;
  
  // Apply strength
  const clampedStrength = Math.max(0, Math.min(100, params.strength));
  result = Math.round(originalTick + (result - originalTick) * (clampedStrength / 100));
  
  // Apply swing
  if (params.swing > 0) {
    const clampedSwing = Math.max(0, Math.min(100, params.swing));
    const gridPosition = Math.round(result / gridSize);
    if (gridPosition % 2 !== 0) {
      const swingOffset = Math.round((clampedSwing / 100) * (gridSize / 3));
      result += swingOffset;
    }
  }
  
  // Apply humanize
  if (params.humanizeTicks > 0) {
    const offset = Math.floor(Math.random() * (2 * params.humanizeTicks + 1)) - params.humanizeTicks;
    result = Math.max(0, result + offset);
  }
  
  return Math.max(0, result);
}

export function quantizeTrackInWorker(
  midi: MidiFile,
  trackIndex: number,
  params: QuantizeParams
): any {
  const track = midi.tracks[trackIndex];
  if (!track) return { trackIndex, error: 'Track not found' };

  const ppq = midi.header.ticksPerBeat;
  const notes = extractNotes(track);
  const timeSignatures = getAllTimeSignatureEvents(midi);
  const gridSize = getGridSizeTicks(ppq, params.grid);

  if (notes.length === 0) return { trackIndex, notesProcessed: 0, notesMoved: 0 };

  // Map notes to their event indices
  const noteMappings: Array<{ noteOnIndex: number; noteOffIndex: number; note: ParsedNote }> = [];
  const pendingNoteOns = new Map<string, number>();

  for (let i = 0; i < track.length; i++) {
    const event = track[i];
    
    if (event.type === 'noteOn' && (event as any).velocity > 0) {
      const key = `${(event as any).channel}-${(event as any).noteNumber}`;
      if (pendingNoteOns.has(key)) pendingNoteOns.delete(key);
      pendingNoteOns.set(key, i);
    } else if (event.type === 'noteOff' || (event.type === 'noteOn' && (event as any).velocity === 0)) {
      const key = `${(event as any).channel}-${(event as any).noteNumber}`;
      const noteOnIdx = pendingNoteOns.get(key);
      if (noteOnIdx !== undefined) {
        const noteOnEvent = track[noteOnIdx] as any;
        const note = notes.find(n =>
          n.channel === noteOnEvent.channel &&
          n.noteNumber === noteOnEvent.noteNumber &&
          n.startTick === track[noteOnIdx].absoluteTime
        );
        if (note) {
          noteMappings.push({ noteOnIndex: noteOnIdx, noteOffIndex: i, note });
        }
        pendingNoteOns.delete(key);
      }
    }
  }

  // Quantize each note
  let notesMoved = 0;
  let totalDisplacement = 0;
  let maxDisplacement = 0;

  for (const mapping of noteMappings) {
    const { noteOnIndex, noteOffIndex, note } = mapping;
    const originalStart = note.startTick;

    let newStart = note.startTick;
    let newEnd = note.endTick;

    if (params.quantizeStarts) {
      newStart = quantizeTickFull(note.startTick, gridSize, params, null);
      const displacement = Math.abs(newStart - originalStart);
      if (displacement > 0) {
        notesMoved++;
        totalDisplacement += displacement;
        maxDisplacement = Math.max(maxDisplacement, displacement);
      }
    }

    if (params.quantizeEnds) {
      newEnd = quantizeTickFull(note.endTick, gridSize, params, null);
    }

    const duration = Math.max(1, newEnd - newStart);
    newEnd = newStart + duration;

    (track[noteOnIndex] as any).absoluteTime = newStart;
    (track[noteOffIndex] as any).absoluteTime = newEnd;
  }

  // Handle monophonic tracks
  const isMono = detectMonophonic(notes);
  if (isMono) {
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
      }
    }
  }

  const outputTempo = params.outputTempo || 56;
  const ticksPerMs = (ppq * outputTempo) / 60000;

  return {
    trackIndex,
    trackName: (track.find(e => e.type === 'trackName') as any)?.text || `Track ${trackIndex + 1}`,
    notesProcessed: notes.length,
    notesMoved,
    notesUnchanged: notes.length - notesMoved,
    maxDisplacementMs: Math.round((maxDisplacement / ticksPerMs) * 100) / 100,
    avgDisplacementMs: notesMoved > 0
      ? Math.round(((totalDisplacement / notesMoved) / ticksPerMs) * 100) / 100
      : 0,
  };
}

function detectMonophonic(notes: ParsedNote[]): boolean {
  if (notes.length <= 1) return true;
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTick > sorted[i + 1].startTick) return false;
  }
  return true;
}
