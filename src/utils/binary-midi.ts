/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Binary MIDI parser/writer using midi-file library.
 * 
 * Works directly with MIDI binary events and tick positions.
 */

// @ts-ignore - midi-file has no types
import { parseMidi as midiParse, writeMidi as midiWrite } from 'midi-file';
import type {
  MidiFile,
  MidiTrackEvent,
  ParsedNote,
  TempoEvent,
  TimeSignatureEvent,
  TrackAnalysis,
} from './midi-types';

/**
 * Parse a MIDI ArrayBuffer into structured data.
 */
export function parseMidiBinary(buffer: ArrayBuffer): MidiFile {
  const uint8 = new Uint8Array(buffer);
  const parsed = midiParse(uint8);
  
  // Convert delta times to absolute times
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

/**
 * Write a MidiFile structure back to binary.
 * Converts absolute times back to delta times.
 */
export function writeMidiBinary(midi: MidiFile): Uint8Array {
  // Convert absolute times to delta times
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

/**
 * Extract tempo events from a track (absolute times).
 */
export function extractTempoEvents(track: MidiTrackEvent[]): TempoEvent[] {
  const tempos: TempoEvent[] = [];
  for (const event of track) {
    if (event.type === 'setTempo') {
      tempos.push({
        tick: event.absoluteTime,
        microsecondsPerBeat: event.microsecondsPerBeat,
        bpm: 60000000 / event.microsecondsPerBeat,
      });
    }
  }
  return tempos.sort((a, b) => a.tick - b.tick);
}

/**
 * Extract time signature events from a track.
 */
export function extractTimeSignatureEvents(track: MidiTrackEvent[]): TimeSignatureEvent[] {
  const sigs: TimeSignatureEvent[] = [];
  for (const event of track) {
    if (event.type === 'timeSignature') {
      sigs.push({
        tick: event.absoluteTime,
        numerator: event.numerator,
        denominator: event.denominator,
      });
    }
  }
  return sigs.sort((a, b) => a.tick - b.tick);
}

/**
 * Extract notes from a track by pairing noteOn/noteOff events.
 */
export function extractNotes(track: MidiTrackEvent[]): ParsedNote[] {
  // Pending noteOn events indexed by "channel-noteNumber"
  const pending = new Map<string, { channel: number; noteNumber: number; velocity: number; tick: number }>();
  const notes: ParsedNote[] = [];

  for (const event of track) {
    if (event.type === 'noteOn' && event.velocity > 0) {
      const key = `${event.channel}-${event.noteNumber}`;
      // If there's already a pending note for this pitch/channel, close it
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
        channel: event.channel,
        noteNumber: event.noteNumber,
        velocity: event.velocity,
        tick: event.absoluteTime,
      });
    } else if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
      const key = `${event.channel}-${event.noteNumber}`;
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

  // Close any remaining pending notes (hung notes)
  for (const [, noteOn] of pending) {
    // Find the last event time in the track
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

/**
 * Extract track name from events.
 */
export function extractTrackName(track: MidiTrackEvent[]): string {
  for (const event of track) {
    if (event.type === 'trackName') {
      return event.text;
    }
  }
  return '';
}

/**
 * Extract channel from a track (most common channel used).
 */
export function extractChannel(track: MidiTrackEvent[]): number {
  const channelCount = new Map<number, number>();
  for (const event of track) {
    if (event.type === 'noteOn' || event.type === 'noteOff') {
      const ch = event.channel;
      channelCount.set(ch, (channelCount.get(ch) || 0) + 1);
    }
  }
  if (channelCount.size === 0) return 0;
  let maxChannel = 0;
  let maxCount = 0;
  for (const [ch, count] of channelCount) {
    if (count > maxCount) {
      maxCount = count;
      maxChannel = ch;
    }
  }
  return maxChannel;
}

/**
 * Extract program number (instrument) from a track.
 */
export function extractProgramNumber(track: MidiTrackEvent[]): number | undefined {
  for (const event of track) {
    if (event.type === 'programChange') {
      return event.programNumber;
    }
  }
  return undefined;
}

/**
 * Detect if a track is monophonic (no overlapping notes).
 */
export function detectMonophonic(notes: ParsedNote[]): boolean {
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
 * Detect if a track contains chords.
 */
export function detectChords(notes: ParsedNote[]): boolean {
  if (notes.length <= 1) return false;
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].startTick === sorted[i + 1].startTick && 
        sorted[i].noteNumber !== sorted[i + 1].noteNumber) {
      return true;
    }
  }
  return false;
}

/**
 * Analyze a track completely.
 */
export function analyzeTrack(track: MidiTrackEvent[], index: number): TrackAnalysis {
  return {
    index,
    name: extractTrackName(track) || `Track ${index + 1}`,
    channel: extractChannel(track),
    notes: extractNotes(track),
    programNumber: extractProgramNumber(track),
    isMonophonic: detectMonophonic(extractNotes(track)),
    hasChords: detectChords(extractNotes(track)),
  };
}

/**
 * Get all tempo events from all tracks (merged).
 */
export function getAllTempoEvents(midi: MidiFile): TempoEvent[] {
  const allTempos: TempoEvent[] = [];
  for (const track of midi.tracks) {
    allTempos.push(...extractTempoEvents(track));
  }
  return allTempos.sort((a, b) => a.tick - b.tick);
}

/**
 * Get all time signature events from all tracks (merged).
 */
export function getAllTimeSignatureEvents(midi: MidiFile): TimeSignatureEvent[] {
  const allSigs: TimeSignatureEvent[] = [];
  for (const track of midi.tracks) {
    allSigs.push(...extractTimeSignatureEvents(track));
  }
  return allSigs.sort((a, b) => a.tick - b.tick);
}
