/**
 * QUANTIZE.IT - Musical Processing Stages
 * 
 * Implements the 4-stage musical processing workflow:
 * 1. Perfect Rhythmic Base
 * 2. Harmonic Base and Bass
 * 3. Strings and Woodwinds
 * 4. Brass (Trumpets)
 * 
 * Each stage analyzes, suggests, and validates without imposing changes.
 * The musician decides on all transformations.
 * 
 * Based on Prof. Manuel Gago Fernández's musical criteria:
 * - Rhythmic precision serves musical intention
 * - Pulse, meter, accents, articulation, phrasing have meaning
 * - Grid alignment alone doesn't prove artistic improvement
 * - The musician decides on expressive transformations
 * - Every change can be seen, heard, compared, undone, rebuilt
 * - Original is preserved; each result is a new version
 */

import type { MidiFile, ParsedNote, TrackAnalysis } from './midi-types';
import { extractNotes, analyzeTrack, getAllTimeSignatureEvents } from './binary-midi';
import { getGridSizeTicks, getTimeSignatureAtTick } from './tick-quantizer';
import type { GridType } from '../types';

// ============ TYPES ============

export type ProcessingStage = 
  | 'idle'
  | 'analyzing'
  | 'rhythmic-base'
  | 'harmonic-base'
  | 'strings-woodwinds'
  | 'brass'
  | 'validated'
  | 'requires-review'
  | 'error';

export type InstrumentFamily = 
  | 'percussion'
  | 'bass'
  | 'harmony'
  | 'strings'
  | 'woodwinds'
  | 'brass'
  | 'unknown';

export interface StageAnalysis {
  stage: ProcessingStage;
  tracks: TrackStageInfo[];
  suggestions: StageSuggestion[];
  warnings: string[];
  validated: boolean;
  requiresHumanReview: boolean;
}

export interface TrackStageInfo {
  trackIndex: number;
  trackName: string;
  family: InstrumentFamily;
  noteCount: number;
  isMonophonic: boolean;
  hasChords: boolean;
  processed: boolean;
  issues: string[];
}

export interface StageSuggestion {
  id: string;
  stage: ProcessingStage;
  trackIndex: number;
  type: 'rhythm' | 'harmony' | 'articulation' | 'coordination' | 'impossible';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  explanation: string;
  tickPosition?: number;
  barNumber?: number;
  canAutoFix: boolean;
  confidence: number;
}

export interface StageVersion {
  id: string;
  stage: ProcessingStage;
  timestamp: number;
  midiSnapshot: MidiFile;
  analysis: StageAnalysis;
  notes: string;
}

// ============ STAGE PROCESSING ============

/**
 * Detect instrument family from track analysis.
 * Uses multiple heuristics, not just name.
 */
export function detectInstrumentFamily(track: TrackAnalysis): InstrumentFamily {
  const name = track.name.toLowerCase();
  
  // Check name first
  if (name.includes('drum') || name.includes('percussion') || name.includes('perc')) {
    return 'percussion';
  }
  if (name.includes('bass') || name.includes('contrabass') || name.includes('double bass')) {
    return 'bass';
  }
  if (name.includes('piano') || name.includes('keyboard') || name.includes('organ') || name.includes('guitar')) {
    return 'harmony';
  }
  if (name.includes('violin') || name.includes('viola') || name.includes('cello') || name.includes('string')) {
    return 'strings';
  }
  if (name.includes('clarinet') || name.includes('flute') || name.includes('oboe') || name.includes('bassoon') || name.includes('woodwind')) {
    return 'woodwinds';
  }
  if (name.includes('trumpet') || name.includes('trombone') || name.includes('horn') || name.includes('brass')) {
    return 'brass';
  }
  
  // Use musical evidence
  const notes = track.notes;
  if (notes.length === 0) return 'unknown';
  
  // Check MIDI range
  const midiValues = notes.map(n => n.noteNumber);
  const minMidi = Math.min(...midiValues);
  const maxMidi = Math.max(...midiValues);
  const avgMidi = midiValues.reduce((a, b) => a + b, 0) / midiValues.length;
  
  // Bass range: typically MIDI 28-55 (E1-G3)
  if (avgMidi < 55 && maxMidi < 65) {
    return 'bass';
  }
  
  // Very high range: possibly brass
  if (minMidi > 55 && track.isMonophonic) {
    return 'brass';
  }
  
  // Polyphonic with wide range: likely harmony instrument
  if (track.hasChords && !track.isMonophonic) {
    return 'harmony';
  }
  
  // Monophonic mid-range: could be woodwind or strings
  if (track.isMonophonic && avgMidi > 50 && avgMidi < 80) {
    return 'woodwinds';
  }
  
  return 'unknown';
}

/**
 * Stage 1: Perfect Rhythmic Base
 * 
 * Analyzes rhythmic coherence, grid alignment, accents, and patterns.
 * Does NOT automatically quantize - only suggests.
 */
export function analyzeRhythmicBase(
  midi: MidiFile,
  grid: GridType,
  ppq: number
): StageAnalysis {
  const tracks: TrackStageInfo[] = [];
  const suggestions: StageSuggestion[] = [];
  const warnings: string[] = [];
  
  const timeSignatures = getAllTimeSignatureEvents(midi);
  const gridSize = getGridSizeTicks(ppq, grid);
  
  for (let i = 0; i < midi.tracks.length; i++) {
    const trackAnalysis = analyzeTrack(midi.tracks[i], i);
    const family = detectInstrumentFamily(trackAnalysis);
    
    const trackInfo: TrackStageInfo = {
      trackIndex: i,
      trackName: trackAnalysis.name,
      family,
      noteCount: trackAnalysis.notes.length,
      isMonophonic: trackAnalysis.isMonophonic,
      hasChords: trackAnalysis.hasChords,
      processed: false,
      issues: [],
    };
    
    // Analyze rhythmic issues
    const notes = trackAnalysis.notes;
    let offGridCount = 0;
    
    for (const note of notes) {
      const remainder = note.startTick % gridSize;
      const distance = Math.min(remainder, gridSize - remainder);
      
      if (distance > gridSize * 0.15) { // >15% off grid
        offGridCount++;
      }
    }
    
    if (offGridCount > notes.length * 0.3) {
      trackInfo.issues.push(`${offGridCount} notes significantly off-grid (${((offGridCount / notes.length) * 100).toFixed(0)}%)`);
      suggestions.push({
        id: `rhythm-${i}-offgrid`,
        stage: 'rhythmic-base',
        trackIndex: i,
        type: 'rhythm',
        severity: 'warning',
        title: 'Rhythmic incoherence detected',
        description: `${offGridCount} notes are significantly off the ${grid} grid`,
        explanation: `This track has ${((offGridCount / notes.length) * 100).toFixed(0)}% of notes off-grid. ` +
          `This may be intentional (swing, rubato) or a timing issue. ` +
          `Review before applying quantization.`,
        canAutoFix: true,
        confidence: 0.7,
      });
    }
    
    tracks.push(trackInfo);
  }
  
  return {
    stage: 'rhythmic-base',
    tracks,
    suggestions,
    warnings,
    validated: false,
    requiresHumanReview: suggestions.length > 0,
  };
}

/**
 * Stage 2: Harmonic Base and Bass
 * 
 * Analyzes bass lines and harmonic support.
 * Checks for collisions and coordination.
 */
export function analyzeHarmonicBase(
  midi: MidiFile,
  previousAnalysis: StageAnalysis
): StageAnalysis {
  const tracks: TrackStageInfo[] = [];
  const suggestions: StageSuggestion[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < midi.tracks.length; i++) {
    const trackAnalysis = analyzeTrack(midi.tracks[i], i);
    const family = detectInstrumentFamily(trackAnalysis);
    
    const trackInfo: TrackStageInfo = {
      trackIndex: i,
      trackName: trackAnalysis.name,
      family,
      noteCount: trackAnalysis.notes.length,
      isMonophonic: trackAnalysis.isMonophonic,
      hasChords: trackAnalysis.hasChords,
      processed: false,
      issues: [],
    };
    
    // Check bass tracks
    if (family === 'bass') {
      const notes = trackAnalysis.notes;
      
      // Check for very short notes (possible errors)
      const shortNotes = notes.filter(n => n.durationTicks < 10);
      if (shortNotes.length > 0) {
        trackInfo.issues.push(`${shortNotes.length} very short notes (<10 ticks)`);
        suggestions.push({
          id: `bass-${i}-short`,
          stage: 'harmonic-base',
          trackIndex: i,
          type: 'articulation',
          severity: 'info',
          title: 'Very short bass notes',
          description: `${shortNotes.length} notes shorter than 10 ticks`,
          explanation: `These notes may be artifacts or intentional staccato. ` +
            `Review to confirm musical intention.`,
          canAutoFix: false,
          confidence: 0.5,
        });
      }
    }
    
    // Check harmony tracks
    if (family === 'harmony') {
      const notes = trackAnalysis.notes;
      
      // Check for overlapping notes in same pitch (possible duplicates)
      const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
      let duplicates = 0;
      
      for (let j = 0; j < sorted.length - 1; j++) {
        if (sorted[j].noteNumber === sorted[j + 1].noteNumber &&
            sorted[j].endTick > sorted[j + 1].startTick) {
          duplicates++;
        }
      }
      
      if (duplicates > 0) {
        trackInfo.issues.push(`${duplicates} potential duplicate notes`);
        suggestions.push({
          id: `harmony-${i}-duplicates`,
          stage: 'harmonic-base',
          trackIndex: i,
          type: 'articulation',
          severity: 'warning',
          title: 'Possible duplicate notes',
          description: `${duplicates} overlapping notes with same pitch detected`,
          explanation: `These may be MIDI recording artifacts or intentional repetitions. ` +
            `Review to confirm.`,
          canAutoFix: true,
          confidence: 0.6,
        });
      }
    }
    
    tracks.push(trackInfo);
  }
  
  return {
    stage: 'harmonic-base',
    tracks,
    suggestions,
    warnings,
    validated: false,
    requiresHumanReview: suggestions.length > 0,
  };
}

/**
 * Stage 3: Strings and Woodwinds
 * 
 * Analyzes melodic lines, counterpoint, phrasing.
 * Preserves breaths, articulation, sustained notes.
 */
export function analyzeStringsWoodwinds(
  midi: MidiFile,
  previousAnalysis: StageAnalysis
): StageAnalysis {
  const tracks: TrackStageInfo[] = [];
  const suggestions: StageSuggestion[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < midi.tracks.length; i++) {
    const trackAnalysis = analyzeTrack(midi.tracks[i], i);
    const family = detectInstrumentFamily(trackAnalysis);
    
    const trackInfo: TrackStageInfo = {
      trackIndex: i,
      trackName: trackAnalysis.name,
      family,
      noteCount: trackAnalysis.notes.length,
      isMonophonic: trackAnalysis.isMonophonic,
      hasChords: trackAnalysis.hasChords,
      processed: false,
      issues: [],
    };
    
    // Check woodwinds and strings
    if (family === 'woodwinds' || family === 'strings') {
      const notes = trackAnalysis.notes;
      
      // Check for very fast passages (possible articulation issues)
      const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
      let fastPassages = 0;
      
      for (let j = 0; j < sorted.length - 3; j++) {
        const timeSpan = sorted[j + 3].startTick - sorted[j].startTick;
        if (timeSpan < 100) { // 4 notes in <100 ticks = very fast
          fastPassages++;
        }
      }
      
      if (fastPassages > 0) {
        trackInfo.issues.push(`${fastPassages} very fast passages detected`);
        suggestions.push({
          id: `melody-${i}-fast`,
          stage: 'strings-woodwinds',
          trackIndex: i,
          type: 'articulation',
          severity: 'info',
          title: 'Very fast passage',
          description: `${fastPassages} rapid note sequences detected`,
          explanation: `These fast passages may require special articulation or breathing. ` +
            `For woodwinds, ensure breaths are preserved. ` +
            `For strings, check bowing and phrasing.`,
          canAutoFix: false,
          confidence: 0.4,
        });
      }
      
      // Check for monophonic tracks with overlaps (shouldn't happen)
      if (trackAnalysis.isMonophonic) {
        const overlaps = notes.filter((n, idx) => {
          const next = notes[idx + 1];
          return next && n.endTick > next.startTick;
        });
        
        if (overlaps.length > 0) {
          trackInfo.issues.push(`${overlaps.length} overlaps in monophonic track`);
          suggestions.push({
            id: `mono-${i}-overlap`,
            stage: 'strings-woodwinds',
            trackIndex: i,
            type: 'coordination',
            severity: 'warning',
            title: 'Overlaps in monophonic track',
            description: `${overlaps.length} note overlaps in a monophonic instrument`,
            explanation: `Monophonic instruments should not have overlapping notes. ` +
              `These may need to be shortened or are recording artifacts.`,
            canAutoFix: true,
            confidence: 0.8,
          });
        }
      }
    }
    
    tracks.push(trackInfo);
  }
  
  return {
    stage: 'strings-woodwinds',
    tracks,
    suggestions,
    warnings,
    validated: false,
    requiresHumanReview: suggestions.length > 0,
  };
}

/**
 * Stage 4: Brass (Trumpets)
 * 
 * Analyzes brass parts for attacks, entries, coordination.
 * Checks for impossible passages.
 */
export function analyzeBrass(
  midi: MidiFile,
  previousAnalysis: StageAnalysis
): StageAnalysis {
  const tracks: TrackStageInfo[] = [];
  const suggestions: StageSuggestion[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < midi.tracks.length; i++) {
    const trackAnalysis = analyzeTrack(midi.tracks[i], i);
    const family = detectInstrumentFamily(trackAnalysis);
    
    const trackInfo: TrackStageInfo = {
      trackIndex: i,
      trackName: trackAnalysis.name,
      family,
      noteCount: trackAnalysis.notes.length,
      isMonophonic: trackAnalysis.isMonophonic,
      hasChords: trackAnalysis.hasChords,
      processed: false,
      issues: [],
    };
    
    // Check brass
    if (family === 'brass') {
      const notes = trackAnalysis.notes;
      
      // Check for very high notes (may be impossible)
      const highNotes = notes.filter(n => n.noteNumber > 84); // Above C6
      if (highNotes.length > 0) {
        trackInfo.issues.push(`${highNotes.length} very high notes (above C6)`);
        suggestions.push({
          id: `brass-${i}-high`,
          stage: 'brass',
          trackIndex: i,
          type: 'impossible',
          severity: 'warning',
          title: 'Very high brass notes',
          description: `${highNotes.length} notes above C6 (MIDI 84)`,
          explanation: `These notes may be outside the instrument's comfortable range. ` +
            `Review for playability.`,
          canAutoFix: false,
          confidence: 0.5,
        });
      }
      
      // Check for very fast repeated notes (tonguing issues)
      const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
      let fastRepeats = 0;
      
      for (let j = 0; j < sorted.length - 1; j++) {
        if (sorted[j].noteNumber === sorted[j + 1].noteNumber &&
            sorted[j + 1].startTick - sorted[j].endTick < 20) {
          fastRepeats++;
        }
      }
      
      if (fastRepeats > 0) {
        trackInfo.issues.push(`${fastRepeats} very fast repeated notes`);
        suggestions.push({
          id: `brass-${i}-repeats`,
          stage: 'brass',
          trackIndex: i,
          type: 'impossible',
          severity: 'info',
          title: 'Fast repeated notes',
          description: `${fastRepeats} very fast note repetitions`,
          explanation: `These may require difficult tonguing. ` +
            `Review for playability and articulation.`,
          canAutoFix: false,
          confidence: 0.4,
        });
      }
    }
    
    tracks.push(trackInfo);
  }
  
  return {
    stage: 'brass',
    tracks,
    suggestions,
    warnings,
    validated: false,
    requiresHumanReview: suggestions.length > 0,
  };
}

/**
 * Run all 4 stages in sequence.
 */
export function runAllStages(
  midi: MidiFile,
  grid: GridType,
  ppq: number
): {
  rhythmicBase: StageAnalysis;
  harmonicBase: StageAnalysis;
  stringsWoodwinds: StageAnalysis;
  brass: StageAnalysis;
} {
  const rhythmicBase = analyzeRhythmicBase(midi, grid, ppq);
  const harmonicBase = analyzeHarmonicBase(midi, rhythmicBase);
  const stringsWoodwinds = analyzeStringsWoodwinds(midi, harmonicBase);
  const brass = analyzeBrass(midi, stringsWoodwinds);
  
  return {
    rhythmicBase,
    harmonicBase,
    stringsWoodwinds,
    brass,
  };
}

/**
 * Get summary of all stages.
 */
export function getStagesSummary(stages: {
  rhythmicBase: StageAnalysis;
  harmonicBase: StageAnalysis;
  stringsWoodwinds: StageAnalysis;
  brass: StageAnalysis;
}): {
  totalSuggestions: number;
  criticalIssues: number;
  warningsCount: number;
  infoCount: number;
  requiresReview: boolean;
} {
  const allSuggestions = [
    ...stages.rhythmicBase.suggestions,
    ...stages.harmonicBase.suggestions,
    ...stages.stringsWoodwinds.suggestions,
    ...stages.brass.suggestions,
  ];
  
  return {
    totalSuggestions: allSuggestions.length,
    criticalIssues: allSuggestions.filter(s => s.severity === 'critical').length,
    warningsCount: allSuggestions.filter(s => s.severity === 'warning').length,
    infoCount: allSuggestions.filter(s => s.severity === 'info').length,
    requiresReview: allSuggestions.some(s => s.severity === 'warning' || s.severity === 'critical'),
  };
}
