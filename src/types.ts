/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Type definitions for the MIDI quantizer application.
 */

/** Supported grid divisions */
export type GridType = '1/4' | '1/8' | '1/16' | '1/32' | '1/4T' | '1/8T' | '1/16T';

/** Quantization parameters */
export interface QuantizeParams {
  ppq: number;
  grid: GridType;
  strength: number;       // 0-100
  swing: number;          // 0-100
  quantizeStarts: boolean;
  quantizeEnds: boolean;
  preserveVelocity: boolean;
  humanizeTicks: number;
}

/** MIDI Note event */
export interface MidiNote {
  midi: number;
  name: string;
  octave: number;
  velocity: number;
  time: number;
  duration: number;
  ticks: number;
  durationTicks: number;
}

/** MIDI Track info */
export interface TrackInfo {
  index: number;
  name: string;
  noteCount: number;
  instrument?: string;
}

/** MIDI File info */
export interface MidiFileInfo {
  name: string;
  ppq: number;
  duration: number;
  tracks: TrackInfo[];
  tempo: number;
  timeSignature: [number, number];
}

/** Quantization result */
export interface QuantizeResult {
  success: boolean;
  message: string;
  eventsProcessed: number;
  notesQuantized: number;
}

/** Groove template extracted from a MIDI file */
export interface GrooveTemplate {
  offsets: number[];
  name: string;
}

/** Application state */
export interface AppState {
  fileLoaded: boolean;
  fileName: string;
  midiInfo: MidiFileInfo | null;
  selectedTrack: number;
  params: QuantizeParams;
  status: string;
  isProcessing: boolean;
  grooveTemplate: GrooveTemplate | null;
}
