/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Type definitions for raw MIDI binary parsing (midi-file format).
 */

export interface MidiFile {
  header: {
    formatType: number;
    numTracks: number;
    ticksPerBeat: number;
  };
  tracks: MidiTrackEvent[][];
}

export type MidiTrackEvent =
  | { absoluteTime: number; deltaTime: number; type: 'setTempo'; microsecondsPerBeat: number }
  | { absoluteTime: number; deltaTime: number; type: 'timeSignature'; numerator: number; denominator: number; metronome: number; thirtyseconds: number }
  | { absoluteTime: number; deltaTime: number; type: 'endOfTrack' }
  | { absoluteTime: number; deltaTime: number; type: 'sequenceNumber'; sequenceNumber: number }
  | { absoluteTime: number; deltaTime: number; type: 'text'; text: string }
  | { absoluteTime: number; deltaTime: number; type: 'trackName'; text: string }
  | { absoluteTime: number; deltaTime: number; type: 'instrumentName'; text: string }
  | { absoluteTime: number; deltaTime: number; type: 'marker'; text: string }
  | { absoluteTime: number; deltaTime: number; type: 'cuePoint'; text: string }
  | { absoluteTime: number; deltaTime: number; type: 'programChange'; channel: number; programNumber: number }
  | { absoluteTime: number; deltaTime: number; type: 'channelAftertouch'; channel: number; amount: number }
  | { absoluteTime: number; deltaTime: number; type: 'pitchBend'; channel: number; value: number }
  | { absoluteTime: number; deltaTime: number; type: 'controlChange'; channel: number; controllerType: number; value: number }
  | { absoluteTime: number; deltaTime: number; type: 'noteOn'; channel: number; noteNumber: number; velocity: number }
  | { absoluteTime: number; deltaTime: number; type: 'noteOff'; channel: number; noteNumber: number; velocity: number }
  | { absoluteTime: number; deltaTime: number; type: string; [key: string]: any };

export interface ParsedNote {
  channel: number;
  noteNumber: number;
  velocity: number;
  startTick: number;
  endTick: number;
  durationTicks: number;
}

export interface TempoEvent {
  tick: number;
  bpm: number;
  microsecondsPerBeat: number;
}

export interface TimeSignatureEvent {
  tick: number;
  numerator: number;
  denominator: number;
}

export interface TrackAnalysis {
  index: number;
  name: string;
  channel: number;
  notes: ParsedNote[];
  programNumber?: number;
  isMonophonic: boolean;
  hasChords: boolean;
}
