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
  outputTempo: number;    // BPM constante para el archivo de salida
}

/** MIDI Track info */
export interface TrackInfo {
  index: number;
  name: string;
  noteCount: number;
  instrument?: string;
  channel: number;
  isMonophonic: boolean;
  hasChords: boolean;
}

/** MIDI File info */
export interface MidiFileInfo {
  name: string;
  ppq: number;
  duration: number;
  tracks: TrackInfo[];
  tempo: number;
  timeSignature: [number, number];
  tempoChanges: Array<{ time: number; bpm: number }>;
  timeSignatureChanges: Array<{ time: number; beats: number; beatUnit: number }>;
}

/** Quantization result */
export interface QuantizeResult {
  success: boolean;
  message: string;
  eventsProcessed: number;
  notesQuantized: number;
  report: QuantizeReport | null;
}

/** Detailed quantization report */
export interface QuantizeReport {
  totalNotes: number;
  notesMoved: number;
  notesUnchanged: number;
  maxDisplacementMs: number;
  avgDisplacementMs: number;
  warnings: string[];
  perTrack: TrackReport[];
}

/** Per-track report */
export interface TrackReport {
  trackIndex: number;
  trackName: string;
  notesProcessed: number;
  notesMoved: number;
  notesUnchanged: number;
  maxDisplacementMs: number;
  avgDisplacementMs: number;
  warnings: string[];
}

/** Groove template extracted from a MIDI file */
export interface GrooveTemplate {
  offsets: number[];
  name: string;
}

/** Note snapshot for before/after comparison */
export interface NoteSnapshot {
  time: number;
  duration: number;
  midi: number;
  name: string;
  octave: number;
  velocity: number;
  channel: number;
}

/** Track snapshot for comparison */
export interface TrackSnapshot {
  index: number;
  name: string;
  notes: NoteSnapshot[];
  channel: number;
  instrument?: string;
}

/** Full MIDI snapshot */
export interface MidiSnapshot {
  name: string;
  ppq: number;
  duration: number;
  tempo: number;
  timeSignature: [number, number];
  tracks: TrackSnapshot[];
}

/** Comparison between before and after */
export interface ComparisonResult {
  trackIndex: number;
  trackName: string;
  totalNotes: number;
  movedNotes: number;
  unchangedNotes: number;
  maxDisplacementMs: number;
  avgDisplacementMs: number;
  addedNotes: number;
  removedNotes: number;
  warnings: string[];
}
