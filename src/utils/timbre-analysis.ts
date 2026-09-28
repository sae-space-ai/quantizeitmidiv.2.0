/**
 * QUANTIZE.IT - Timbre and Tessitura Analysis
 * 
 * Uses spectral features to:
 * - Propose instrument family based on timbre
 * - Detect octave errors
 * - Identify notes outside expected tessitura
 * - Detect harmonics transcribed as separate notes
 * - Support the 4 musical stages
 * 
 * IMPORTANT: This provides EVIDENCE, not conclusions.
 * Different instruments can produce similar spectra.
 * Always mark uncertain cases as "instrument to be confirmed".
 */

import type { SpectrogramData, HarmonicAnalysis, TimbreFeatures } from './spectral-analysis';
import { analyzeHarmonics, extractTimbreFeatures } from './spectral-analysis';
import type { TranscribedNote } from './transcription-enhanced';

export interface InstrumentProfile {
  family: string;
  name: string;
  minMidi: number;
  maxMidi: number;
  typicalCentroid: [number, number]; // [min, max] Hz
  typicalFlatness: [number, number]; // [min, max]
  typicalBrightness: [number, number]; // [min, max]
  transposition?: number; // semitones (e.g., -2 for Bb clarinet)
}

export interface TimbreAnalysis {
  noteIndex: number;
  note: TranscribedNote;
  features: TimbreFeatures;
  harmonics: HarmonicAnalysis;
  proposedFamily: string | null;
  confidence: number;
  alternatives: Array<{ family: string; confidence: number }>;
  warnings: string[];
  isDoubtful: boolean;
}

export interface TessituraAnalysis {
  trackIndex: number;
  trackName: string;
  detectedMin: number;
  detectedMax: number;
  expectedMin: number;
  expectedMax: number;
  outOfRangeNotes: number[];
  octaveErrors: number[];
  harmonicFalsePositives: number[];
  warnings: string[];
}

export interface SpectralSuggestion {
  id: string;
  stage: 'rhythmic-base' | 'harmonic-base' | 'strings-woodwinds' | 'brass';
  type: 'timbre' | 'tessitura' | 'octave-error' | 'harmonic-error' | 'attack';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  explanation: string;
  evidence: string;
  confidence: number;
  noteIndex?: number;
  trackIndex?: number;
  canAutoFix: boolean;
}

// Instrument profiles (simplified - in production would be more detailed)
const INSTRUMENT_PROFILES: InstrumentProfile[] = [
  {
    family: 'woodwinds',
    name: 'Clarinet (Bb)',
    minMidi: 50, // D3
    maxMidi: 92, // G6
    typicalCentroid: [1500, 3000],
    typicalFlatness: [0.1, 0.3],
    typicalBrightness: [0.3, 0.6],
    transposition: -2,
  },
  {
    family: 'woodwinds',
    name: 'Flute',
    minMidi: 60, // C4
    maxMidi: 96, // C7
    typicalCentroid: [2000, 4000],
    typicalFlatness: [0.05, 0.2],
    typicalBrightness: [0.5, 0.8],
  },
  {
    family: 'woodwinds',
    name: 'Oboe',
    minMidi: 58, // Bb3
    maxMidi: 93, // A6
    typicalCentroid: [1800, 3500],
    typicalFlatness: [0.15, 0.35],
    typicalBrightness: [0.4, 0.7],
  },
  {
    family: 'strings',
    name: 'Violin',
    minMidi: 55, // G3
    maxMidi: 103, // G7
    typicalCentroid: [2500, 5000],
    typicalFlatness: [0.2, 0.4],
    typicalBrightness: [0.6, 0.9],
  },
  {
    family: 'strings',
    name: 'Cello',
    minMidi: 36, // C2
    maxMidi: 80, // G5
    typicalCentroid: [800, 2000],
    typicalFlatness: [0.15, 0.35],
    typicalBrightness: [0.2, 0.5],
  },
  {
    family: 'brass',
    name: 'Trumpet (Bb)',
    minMidi: 52, // E3
    maxMidi: 84, // C6
    typicalCentroid: [2000, 4500],
    typicalFlatness: [0.1, 0.25],
    typicalBrightness: [0.5, 0.8],
    transposition: -2,
  },
  {
    family: 'brass',
    name: 'Trombone',
    minMidi: 40, // E2
    maxMidi: 77, // F5
    typicalCentroid: [1200, 3000],
    typicalFlatness: [0.1, 0.3],
    typicalBrightness: [0.3, 0.6],
  },
  {
    family: 'bass',
    name: 'Double Bass',
    minMidi: 28, // E1
    maxMidi: 67, // G4
    typicalCentroid: [400, 1200],
    typicalFlatness: [0.2, 0.4],
    typicalBrightness: [0.1, 0.4],
  },
];

/**
 * Analyze timbre of transcribed notes using spectral data.
 */
export function analyzeTimbre(
  audioBuffer: AudioBuffer,
  notes: TranscribedNote[],
  spectrogram: SpectrogramData
): TimbreAnalysis[] {
  const analyses: TimbreAnalysis[] = [];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    
    // Extract timbre features for this note
    const features = extractTimbreFeatures(audioBuffer, note.startTime, note.endTime);
    
    // Find corresponding spectral frame
    const frameIndex = spectrogram.frames.findIndex(
      f => f.time >= note.startTime && f.time <= note.endTime
    );
    
    let harmonics: HarmonicAnalysis;
    if (frameIndex >= 0) {
      harmonics = analyzeHarmonics(
        spectrogram.frames[frameIndex],
        spectrogram.sampleRate,
        spectrogram.fftSize,
        note.frequency
      );
    } else {
      harmonics = {
        fundamental: note.frequency,
        harmonics: [],
        harmonicStrengths: [],
        inharmonicity: 0,
        brightness: 0,
      };
    }
    
    // Propose instrument family based on features
    const { proposedFamily, confidence, alternatives } = proposeInstrumentFamily(features, harmonics);
    
    // Generate warnings
    const warnings: string[] = [];
    
    if (confidence < 0.5) {
      warnings.push('Low confidence in instrument identification');
    }
    
    if (alternatives.length > 2) {
      warnings.push('Multiple instrument families match - review needed');
    }
    
    if (features.spectralFlatness > 0.5) {
      warnings.push('High noisiness - may be percussive or noisy signal');
    }
    
    const isDoubtful = confidence < 0.6 || warnings.length > 0;
    
    analyses.push({
      noteIndex: i,
      note,
      features,
      harmonics,
      proposedFamily,
      confidence,
      alternatives,
      warnings,
      isDoubtful,
    });
  }
  
  return analyses;
}

/**
 * Propose instrument family based on spectral features.
 */
function proposeInstrumentFamily(
  features: TimbreFeatures,
  harmonics: HarmonicAnalysis
): {
  proposedFamily: string | null;
  confidence: number;
  alternatives: Array<{ family: string; confidence: number }>;
} {
  const scores: Array<{ family: string; score: number }> = [];
  
  for (const profile of INSTRUMENT_PROFILES) {
    let score = 0;
    let factors = 0;
    
    // Spectral centroid match
    if (features.spectralCentroid >= profile.typicalCentroid[0] &&
        features.spectralCentroid <= profile.typicalCentroid[1]) {
      score += 1;
    } else {
      const distance = Math.min(
        Math.abs(features.spectralCentroid - profile.typicalCentroid[0]),
        Math.abs(features.spectralCentroid - profile.typicalCentroid[1])
      );
      score += Math.max(0, 1 - distance / 1000);
    }
    factors++;
    
    // Spectral flatness match
    if (features.spectralFlatness >= profile.typicalFlatness[0] &&
        features.spectralFlatness <= profile.typicalFlatness[1]) {
      score += 1;
    } else {
      const distance = Math.min(
        Math.abs(features.spectralFlatness - profile.typicalFlatness[0]),
        Math.abs(features.spectralFlatness - profile.typicalFlatness[1])
      );
      score += Math.max(0, 1 - distance / 0.2);
    }
    factors++;
    
    // Brightness match
    if (harmonics.brightness >= profile.typicalBrightness[0] &&
        harmonics.brightness <= profile.typicalBrightness[1]) {
      score += 1;
    } else {
      const distance = Math.min(
        Math.abs(harmonics.brightness - profile.typicalBrightness[0]),
        Math.abs(harmonics.brightness - profile.typicalBrightness[1])
      );
      score += Math.max(0, 1 - distance / 0.3);
    }
    factors++;
    
    // Harmonic structure match
    if (harmonics.harmonics.length >= 3) {
      score += 0.5; // Has clear harmonics
    }
    if (harmonics.inharmonicity < 0.1) {
      score += 0.5; // Very harmonic
    }
    factors++;
    
    const normalizedScore = score / factors;
    scores.push({ family: profile.family, score: normalizedScore });
  }
  
  // Sort by score
  scores.sort((a, b) => b.score - a.score);
  
  const proposedFamily = scores[0].score > 0.5 ? scores[0].family : null;
  const confidence = scores[0].score;
  
  const alternatives = scores
    .slice(1, 4)
    .filter(s => s.score > 0.3)
    .map(s => ({ family: s.family, confidence: s.score }));
  
  return { proposedFamily, confidence, alternatives };
}

/**
 * Analyze tessitura (range) of a track.
 */
export function analyzeTessitura(
  notes: TranscribedNote[],
  trackIndex: number,
  trackName: string,
  proposedFamily?: string
): TessituraAnalysis {
  if (notes.length === 0) {
    return {
      trackIndex,
      trackName,
      detectedMin: 0,
      detectedMax: 0,
      expectedMin: 0,
      expectedMax: 0,
      outOfRangeNotes: [],
      octaveErrors: [],
      harmonicFalsePositives: [],
      warnings: [],
    };
  }
  
  const midiNotes = notes.map(n => n.midiNote);
  const detectedMin = Math.min(...midiNotes);
  const detectedMax = Math.max(...midiNotes);
  
  // Find expected range based on proposed family
  let expectedMin = 0;
  let expectedMax = 127;
  
  if (proposedFamily) {
    const profiles = INSTRUMENT_PROFILES.filter(p => p.family === proposedFamily);
    if (profiles.length > 0) {
      expectedMin = Math.min(...profiles.map(p => p.minMidi));
      expectedMax = Math.max(...profiles.map(p => p.maxMidi));
    }
  }
  
  // Detect out-of-range notes
  const outOfRangeNotes: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].midiNote < expectedMin || notes[i].midiNote > expectedMax) {
      outOfRangeNotes.push(i);
    }
  }
  
  // Detect potential octave errors (large leaps followed by return)
  const octaveErrors: number[] = [];
  for (let i = 1; i < notes.length - 1; i++) {
    const prevDiff = Math.abs(notes[i].midiNote - notes[i - 1].midiNote);
    const nextDiff = Math.abs(notes[i + 1].midiNote - notes[i].midiNote);
    
    // Large leap up followed by large leap down (or vice versa)
    if (prevDiff >= 12 && nextDiff >= 12) {
      const direction1 = Math.sign(notes[i].midiNote - notes[i - 1].midiNote);
      const direction2 = Math.sign(notes[i + 1].midiNote - notes[i].midiNote);
      
      if (direction1 !== direction2) {
        octaveErrors.push(i);
      }
    }
  }
  
  // Detect potential harmonic false positives
  const harmonicFalsePositives: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const prevNote = notes[i - 1];
    const currNote = notes[i];
    
    // Check if current note is a harmonic of previous (octave, fifth, etc.)
    const ratio = currNote.frequency / prevNote.frequency;
    const isHarmonic = 
      Math.abs(ratio - 2) < 0.1 || // Octave
      Math.abs(ratio - 3) < 0.1 || // Octave + fifth
      Math.abs(ratio - 1.5) < 0.1; // Fifth
    
    // And they're very close in time
    const timeDiff = currNote.startTime - prevNote.endTime;
    if (isHarmonic && timeDiff < 0.05) {
      harmonicFalsePositives.push(i);
    }
  }
  
  // Generate warnings
  const warnings: string[] = [];
  
  if (outOfRangeNotes.length > 0) {
    warnings.push(`${outOfRangeNotes.length} notes outside expected range for ${proposedFamily || 'unknown instrument'}`);
  }
  
  if (octaveErrors.length > 0) {
    warnings.push(`${octaveErrors.length} potential octave errors detected`);
  }
  
  if (harmonicFalsePositives.length > 0) {
    warnings.push(`${harmonicFalsePositives.length} notes may be harmonics transcribed as separate notes`);
  }
  
  return {
    trackIndex,
    trackName,
    detectedMin,
    detectedMax,
    expectedMin,
    expectedMax,
    outOfRangeNotes,
    octaveErrors,
    harmonicFalsePositives,
    warnings,
  };
}

/**
 * Generate spectral suggestions for the 4 musical stages.
 */
export function generateSpectralSuggestions(
  timbreAnalyses: TimbreAnalysis[],
  tessituraAnalysis: TessituraAnalysis,
  stage: 'rhythmic-base' | 'harmonic-base' | 'strings-woodwinds' | 'brass'
): SpectralSuggestion[] {
  const suggestions: SpectralSuggestion[] = [];
  
  // Tessitura-based suggestions
  for (const noteIndex of tessituraAnalysis.octaveErrors) {
    suggestions.push({
      id: `octave-error-${noteIndex}`,
      stage,
      type: 'octave-error',
      severity: 'warning',
      title: 'Potential octave error',
      description: `Note at index ${noteIndex} may be an octave error`,
      explanation: 'Large leap in one direction followed by large leap in opposite direction suggests possible octave transcription error.',
      evidence: `MIDI note: ${tessituraAnalysis.detectedMin} to ${tessituraAnalysis.detectedMax}`,
      confidence: 0.6,
      noteIndex,
      trackIndex: tessituraAnalysis.trackIndex,
      canAutoFix: false,
    });
  }
  
  for (const noteIndex of tessituraAnalysis.harmonicFalsePositives) {
    suggestions.push({
      id: `harmonic-fp-${noteIndex}`,
      stage,
      type: 'harmonic-error',
      severity: 'info',
      title: 'Possible harmonic false positive',
      description: `Note at index ${noteIndex} may be a harmonic of previous note`,
      explanation: 'This note is very close in time to the previous note and has a frequency ratio consistent with a harmonic relationship.',
      evidence: 'Harmonic ratio detected',
      confidence: 0.5,
      noteIndex,
      trackIndex: tessituraAnalysis.trackIndex,
      canAutoFix: true,
    });
  }
  
  // Timbre-based suggestions
  for (const analysis of timbreAnalyses) {
    if (analysis.isDoubtful) {
      suggestions.push({
        id: `timbre-doubtful-${analysis.noteIndex}`,
        stage,
        type: 'timbre',
        severity: 'info',
        title: 'Uncertain instrument identification',
        description: `Low confidence in instrument family for note ${analysis.noteIndex}`,
        explanation: analysis.warnings.join('. '),
        evidence: `Spectral centroid: ${analysis.features.spectralCentroid.toFixed(0)} Hz, Flatness: ${analysis.features.spectralFlatness.toFixed(2)}`,
        confidence: analysis.confidence,
        noteIndex: analysis.noteIndex,
        trackIndex: tessituraAnalysis.trackIndex,
        canAutoFix: false,
      });
    }
  }
  
  return suggestions;
}
