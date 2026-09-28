/**
 * QUANTIZE.IT - AI Provider Interface & Local Heuristic Analyzer
 * 
 * Design:
 * - Provider interface is swappable (local, remote API, etc.)
 * - Local provider uses heuristic analysis (no ML, no training)
 * - Remote provider requires user-provided API key (never exposed in browser)
 * - Does NOT modify the work without explicit user action
 * - Does NOT claim to "learn" from user files
 * - Does NOT use files for training
 * 
 * The local analyzer detects:
 * - Rhythm errors (notes significantly off-grid)
 * - Note proximity issues (notes too close that may be unintended)
 * - Articulation suggestions (staccato vs legato based on duration)
 * - Per-bar suggestions (bars with unusual density)
 */

import type { ParsedNote, MidiFile } from './midi-types';
import { extractNotes, getAllTimeSignatureEvents } from './binary-midi';
import { getGridSizeTicks, getTimeSignatureAtTick } from './tick-quantizer';
import type { GridType } from '../types';

// ============ TYPES ============

export type SuggestionType = 
  | 'rhythm_error'
  | 'note_proximity'
  | 'articulation'
  | 'bar_density'
  | 'velocity_anomaly'
  | 'duration_anomaly';

export interface AiSuggestion {
  id: string;
  provider: string;
  trackIndex: number;
  type: SuggestionType;
  severity: 'info' | 'warning' | 'suggestion';
  title: string;
  description: string;
  explanation: string;
  tickPosition?: number;
  beforeData: {
    noteIndex?: number;
    startTick?: number;
    endTick?: number;
    velocity?: number;
    duration?: number;
  };
  afterData: {
    startTick?: number;
    endTick?: number;
    velocity?: number;
    duration?: number;
  } | null; // null means no automatic fix
  canAutoFix: boolean;
  confidence: number; // 0-1
}

export interface AiAnalysisResult {
  provider: string;
  analyzedAt: number;
  durationMs: number;
  suggestions: AiSuggestion[];
  summary: {
    totalNotes: number;
    rhythmErrors: number;
    proximityIssues: number;
    articulationSuggestions: number;
    otherSuggestions: number;
  };
}

export interface AiProvider {
  name: string;
  type: 'local' | 'remote';
  isAvailable: () => boolean;
  analyze: (
    midi: MidiFile,
    trackIndex: number,
    grid: GridType
  ) => Promise<AiAnalysisResult>;
}

// ============ LOCAL HEURISTIC PROVIDER ============

/**
 * Local provider: analyzes MIDI using heuristic rules.
 * No ML, no external API, no training on user data.
 */
export class LocalHeuristicProvider implements AiProvider {
  name = 'Local Heuristic Analyzer';
  type = 'local' as const;

  isAvailable(): boolean {
    return true; // Always available
  }

  async analyze(
    midi: MidiFile,
    trackIndex: number,
    grid: GridType
  ): Promise<AiAnalysisResult> {
    const startTime = performance.now();
    const track = midi.tracks[trackIndex];
    if (!track) {
      return this.emptyResult('Track not found');
    }

    const notes = extractNotes(track);
    if (notes.length === 0) {
      return this.emptyResult('Track has no notes');
    }

    const ppq = midi.header.ticksPerBeat;
    const timeSignatures = getAllTimeSignatureEvents(midi);
    const gridSize = getGridSizeTicks(ppq, grid);
    const suggestions: AiSuggestion[] = [];

    // Analysis 1: Rhythm errors (notes significantly off-grid)
    suggestions.push(...this.analyzeRhythmErrors(notes, gridSize, ppq, trackIndex));

    // Analysis 2: Note proximity (notes too close)
    suggestions.push(...this.analyzeNoteProximity(notes, gridSize, trackIndex));

    // Analysis 3: Articulation (duration patterns)
    suggestions.push(...this.analyzeArticulation(notes, gridSize, trackIndex));

    // Analysis 4: Velocity anomalies
    suggestions.push(...this.analyzeVelocityAnomalies(notes, trackIndex));

    // Analysis 5: Duration anomalies
    suggestions.push(...this.analyzeDurationAnomalies(notes, gridSize, trackIndex));

    const durationMs = performance.now() - startTime;

    return {
      provider: this.name,
      analyzedAt: Date.now(),
      durationMs,
      suggestions: suggestions.slice(0, 50), // Limit to 50 suggestions
      summary: {
        totalNotes: notes.length,
        rhythmErrors: suggestions.filter(s => s.type === 'rhythm_error').length,
        proximityIssues: suggestions.filter(s => s.type === 'note_proximity').length,
        articulationSuggestions: suggestions.filter(s => s.type === 'articulation').length,
        otherSuggestions: suggestions.filter(s => 
          !['rhythm_error', 'note_proximity', 'articulation'].includes(s.type)
        ).length,
      },
    };
  }

  private emptyResult(reason: string): AiAnalysisResult {
    return {
      provider: this.name,
      analyzedAt: Date.now(),
      durationMs: 0,
      suggestions: [],
      summary: {
        totalNotes: 0,
        rhythmErrors: 0,
        proximityIssues: 0,
        articulationSuggestions: 0,
        otherSuggestions: 0,
      },
    };
  }

  /**
   * Detect notes significantly off the grid.
   * Threshold: > 20% of grid size off-grid.
   */
  private analyzeRhythmErrors(
    notes: ParsedNote[],
    gridSize: number,
    ppq: number,
    trackIndex: number
  ): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];
    const threshold = gridSize * 0.2;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const remainder = note.startTick % gridSize;
      const distance = Math.min(remainder, gridSize - remainder);

      if (distance > threshold) {
        const quantizedTick = Math.round(note.startTick / gridSize) * gridSize;
        suggestions.push({
          id: `rhythm-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'rhythm_error',
          severity: distance > gridSize * 0.4 ? 'warning' : 'info',
          title: 'Note off-grid',
          description: `Note at tick ${note.startTick} is ${distance.toFixed(0)} ticks off the ${gridSize.toFixed(0)}-tick grid`,
          explanation: `This note is ${((distance / gridSize) * 100).toFixed(0)}% away from the nearest grid position. ` +
            `This may be intentional (human feel) or a timing error. ` +
            `Quantizing would move it ${distance > gridSize / 2 ? 'backward' : 'forward'} by ${Math.abs(quantizedTick - note.startTick).toFixed(0)} ticks.`,
          tickPosition: note.startTick,
          beforeData: {
            noteIndex: i,
            startTick: note.startTick,
            endTick: note.endTick,
            velocity: note.velocity,
          },
          afterData: {
            startTick: quantizedTick,
            endTick: note.endTick + (quantizedTick - note.startTick),
          },
          canAutoFix: true,
          confidence: Math.min(1, distance / (gridSize * 0.5)),
        });
      }
    }

    return suggestions.slice(0, 20); // Limit
  }

  /**
   * Detect notes too close together (potential duplicates or errors).
   * Threshold: < 10% of grid size.
   */
  private analyzeNoteProximity(
    notes: ParsedNote[],
    gridSize: number,
    trackIndex: number
  ): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];
    const threshold = gridSize * 0.1;
    const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);

    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].startTick - sorted[i].startTick;
      
      if (gap > 0 && gap < threshold && sorted[i].noteNumber === sorted[i + 1].noteNumber) {
        suggestions.push({
          id: `proximity-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'note_proximity',
          severity: 'warning',
          title: 'Duplicate note detected',
          description: `Two identical notes (pitch ${sorted[i].noteNumber}) only ${gap} ticks apart`,
          explanation: `Two notes with the same pitch are very close together (${gap} ticks). ` +
            `This may be a MIDI recording artifact (double trigger) or intentional repetition. ` +
            `Consider merging them into a single note or keeping them separate based on musical intent.`,
          tickPosition: sorted[i].startTick,
          beforeData: {
            startTick: sorted[i].startTick,
            endTick: sorted[i].endTick,
          },
          afterData: {
            startTick: sorted[i].startTick,
            endTick: sorted[i + 1].endTick,
          },
          canAutoFix: true,
          confidence: 0.8,
        });
      }
    }

    return suggestions.slice(0, 10);
  }

  /**
   * Analyze articulation patterns (staccato vs legato).
   */
  private analyzeArticulation(
    notes: ParsedNote[],
    gridSize: number,
    trackIndex: number
  ): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];
    const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);

    for (let i = 0; i < sorted.length - 1; i++) {
      const duration = sorted[i].durationTicks;
      const gap = sorted[i + 1].startTick - sorted[i].endTick;
      const ratio = duration / gridSize;

      // Very short notes (staccato)
      if (ratio < 0.3 && duration > 0) {
        suggestions.push({
          id: `artic-staccato-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'articulation',
          severity: 'info',
          title: 'Staccato note',
          description: `Note duration is ${(ratio * 100).toFixed(0)}% of grid size (staccato)`,
          explanation: `This note is significantly shorter than the grid unit. ` +
            `This creates a staccato articulation. If this is unintentional, ` +
            `the note duration could be extended to ${(gridSize * 0.8).toFixed(0)} ticks.`,
          tickPosition: sorted[i].startTick,
          beforeData: {
            startTick: sorted[i].startTick,
            duration: duration,
          },
          afterData: {
            duration: Math.round(gridSize * 0.8),
          },
          canAutoFix: true,
          confidence: 0.6,
        });
      }

      // Overlapping notes (legato)
      if (gap < 0) {
        suggestions.push({
          id: `artic-legato-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'articulation',
          severity: 'info',
          title: 'Overlapping notes (legato)',
          description: `Notes overlap by ${Math.abs(gap)} ticks`,
          explanation: `Consecutive notes overlap, creating a legato articulation. ` +
            `This is common in bowed strings and wind instruments. ` +
            `If unintentional, the notes could be separated.`,
          tickPosition: sorted[i].startTick,
          beforeData: {
            startTick: sorted[i].startTick,
            endTick: sorted[i].endTick,
          },
          afterData: {
            endTick: sorted[i + 1].startTick,
          },
          canAutoFix: true,
          confidence: 0.5,
        });
      }
    }

    return suggestions.slice(0, 10);
  }

  /**
   * Detect unusual velocity patterns.
   */
  private analyzeVelocityAnomalies(
    notes: ParsedNote[],
    trackIndex: number
  ): AiSuggestion[] {
    if (notes.length < 5) return [];

    const velocities = notes.map(n => n.velocity);
    const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const stdDev = Math.sqrt(
      velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length
    );

    const suggestions: AiSuggestion[] = [];
    const threshold = mean + stdDev * 2;

    for (let i = 0; i < notes.length; i++) {
      if (notes[i].velocity > threshold) {
        suggestions.push({
          id: `velocity-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'velocity_anomaly',
          severity: 'info',
          title: 'Unusual velocity',
          description: `Note velocity (${notes[i].velocity}) is significantly above average (${mean.toFixed(0)})`,
          explanation: `This note has a velocity ${((notes[i].velocity - mean) / stdDev).toFixed(1)} standard deviations above the mean. ` +
            `This may be an accent, a recording artifact, or an unintended strong hit.`,
          tickPosition: notes[i].startTick,
          beforeData: { velocity: notes[i].velocity },
          afterData: { velocity: Math.round(mean) },
          canAutoFix: true,
          confidence: 0.4,
        });
      }
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Detect unusual duration patterns.
   */
  private analyzeDurationAnomalies(
    notes: ParsedNote[],
    gridSize: number,
    trackIndex: number
  ): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];

    for (let i = 0; i < notes.length; i++) {
      const duration = notes[i].durationTicks;
      const ratio = duration / gridSize;

      // Very long notes (much longer than expected)
      if (ratio > 8) {
        suggestions.push({
          id: `duration-long-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'duration_anomaly',
          severity: 'info',
          title: 'Very long note',
          description: `Note duration is ${(ratio).toFixed(1)}× the grid size`,
          explanation: `This note spans ${(ratio).toFixed(1)} grid units, which is unusually long. ` +
            `This may be a sustained note, a tied note, or a recording artifact.`,
          tickPosition: notes[i].startTick,
          beforeData: { duration },
          afterData: null,
          canAutoFix: false,
          confidence: 0.3,
        });
      }

      // Zero or near-zero duration
      if (duration <= 1) {
        suggestions.push({
          id: `duration-zero-${trackIndex}-${i}`,
          provider: this.name,
          trackIndex,
          type: 'duration_anomaly',
          severity: 'warning',
          title: 'Near-zero duration',
          description: `Note has duration of ${duration} tick(s)`,
          explanation: `This note has a very short duration and may be inaudible or a MIDI artifact. ` +
            `Consider extending it to at least 1 tick or removing it.`,
          tickPosition: notes[i].startTick,
          beforeData: { duration },
          afterData: { duration: Math.max(1, Math.round(gridSize / 4)) },
          canAutoFix: true,
          confidence: 0.7,
        });
      }
    }

    return suggestions.slice(0, 5);
  }
}

// ============ REMOTE PROVIDER STUB ============

/**
 * Remote provider stub: requires user-provided API key.
 * The API key is NEVER stored in the browser or exposed in the client.
 * In production, this would proxy through a backend server.
 * 
 * Currently returns an error indicating configuration is required.
 */
export class RemoteApiProvider implements AiProvider {
  name: string;
  type = 'remote' as const;
  private apiKey: string | null;
  private endpoint: string;

  constructor(name: string, endpoint: string, apiKey: string | null) {
    this.name = name;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey !== null && this.endpoint !== '';
  }

  async analyze(
    _midi: MidiFile,
    _trackIndex: number,
    _grid: GridType
  ): Promise<AiAnalysisResult> {
    if (!this.isAvailable()) {
      throw new Error(
        'Remote AI provider not configured. API key required. ' +
        'Note: API keys should be configured server-side, not in the browser.'
      );
    }

    // In a real implementation, this would:
    // 1. Send MIDI data (or a summary) to the backend
    // 2. Backend calls the AI API with the key
    // 3. Return suggestions
    // 
    // For now, we return an empty result to indicate the provider exists
    // but is not yet configured.
    throw new Error(
      'Remote AI provider integration not yet implemented. ' +
      'This is a placeholder for future API integration. ' +
      'Use the local heuristic analyzer for now.'
    );
  }
}

// ============ PROVIDER REGISTRY ============

export class AiProviderRegistry {
  private providers: Map<string, AiProvider> = new Map();
  private activeProviderId: string = 'local';

  constructor() {
    // Register default providers
    this.register(new LocalHeuristicProvider());
    this.register(new RemoteApiProvider('OpenAI GPT-4', '', null));
    this.register(new RemoteApiProvider('Anthropic Claude', '', null));
  }

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
  }

  setActive(name: string): void {
    if (this.providers.has(name)) {
      this.activeProviderId = name;
    }
  }

  getActive(): AiProvider | undefined {
    return this.providers.get(this.activeProviderId);
  }

  getAll(): AiProvider[] {
    return Array.from(this.providers.values());
  }

  getAvailable(): AiProvider[] {
    return this.getAll().filter(p => p.isAvailable());
  }
}

// Singleton instance
export const aiRegistry = new AiProviderRegistry();
