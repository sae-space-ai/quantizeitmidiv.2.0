/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Tick-based quantization engine.
 * 
 * Works directly with MIDI ticks (pulses) and the musical clock.
 * Grid is calculated from PPQ and time signature.
 */

import type { GridType, QuantizeParams, GrooveTemplate } from '../types';
import type { ParsedNote, TimeSignatureEvent } from './midi-types';

/**
 * Calculate the grid size in ticks for a given grid type and time signature.
 * 
 * For 4/4 with 1/16 grid:
 * - PPQ = ticks per quarter note
 * - 1/16 = quarter / 4 = PPQ / 4 ticks
 * - 16 positions per bar (4 beats × 4 sixteenths)
 * 
 * For 3/4 with 1/16 grid:
 * - 12 positions per bar (3 beats × 4 sixteenths)
 * 
 * For triplets:
 * - 1/8T = (PPQ / 4) × (2/3) = PPQ / 6 ticks
 */
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
  if (!config) {
    throw new Error(`Invalid grid type: ${grid}`);
  }

  // Base grid size: PPQ / division
  // 1/4 = PPQ / 1 = PPQ ticks (one quarter note)
  // 1/8 = PPQ / 2 ticks
  // 1/16 = PPQ / 4 ticks
  // 1/32 = PPQ / 8 ticks
  let gridSize = ppq / config.division;

  if (config.isTriplet) {
    // Triplet: 3 notes in the space of 2
    gridSize = (gridSize * 2) / 3;
  }

  return gridSize;
}

/**
 * Get the number of grid positions per bar for a given time signature and grid.
 * 
 * 4/4 with 1/16: 4 beats × 4 sixteenths = 16 positions
 * 3/4 with 1/16: 3 beats × 4 sixteenths = 12 positions
 * 6/8 with 1/8:  6 beats × 1 eighth = 6 positions
 * 6/8 with 1/8T: 6 beats × 1.5 eighth = 4 positions (triplet feel)
 */
export function getGridPositionsPerBar(
  timeSignature: [number, number],
  grid: GridType
): number {
  const [numerator, denominator] = timeSignature;
  
  // How many grid units fit in one beat?
  // Beat = quarter note = PPQ ticks
  // 1/4 grid = 1 per beat
  // 1/8 grid = 2 per beat
  // 1/16 grid = 4 per beat
  // 1/32 grid = 8 per beat
  const gridPerBeat: Record<GridType, number> = {
    '1/4': 1,
    '1/8': 2,
    '1/16': 4,
    '1/32': 8,
    '1/4T': 1.5,   // triplet: 3 in space of 2
    '1/8T': 3,     // triplet: 3 in space of 2 eighths
    '1/16T': 6,    // triplet: 6 in space of 4 sixteenths
  };

  // For compound time signatures (6/8, 9/8, 12/8), the beat is a dotted quarter
  // But we'll treat each denominator unit as a beat for simplicity
  // Actually, in MIDI, the time signature denominator defines the beat unit
  // So in 6/8, each eighth note is a beat (denominator = 8)
  // But traditionally, 6/8 has 2 beats per bar (dotted quarters)
  
  // For this implementation, we'll use the simple approach:
  // positions per bar = numerator × (grid units per denominator unit)
  
  // Grid units per denominator unit:
  // If denominator = 4 (quarter note), grid units per beat = gridPerBeat[grid]
  // If denominator = 8 (eighth note), we need to adjust
  
  const denominatorRatio = 4 / denominator; // How many quarter notes per beat unit
  const gridPerDenominatorUnit = gridPerBeat[grid] * denominatorRatio;
  
  return numerator * gridPerDenominatorUnit;
}

/**
 * Get the bar duration in ticks for a given time signature.
 */
export function getBarDurationTicks(ppq: number, timeSignature: [number, number]): number {
  const [numerator, denominator] = timeSignature;
  // Bar duration = numerator × (PPQ × 4 / denominator)
  // For 4/4: 4 × (PPQ × 4 / 4) = 4 × PPQ
  // For 3/4: 3 × PPQ
  // For 6/8: 6 × (PPQ × 4 / 8) = 6 × PPQ/2 = 3 × PPQ
  return numerator * (ppq * 4 / denominator);
}

/**
 * Get the time signature at a given tick position.
 */
export function getTimeSignatureAtTick(
  tick: number,
  timeSignatures: TimeSignatureEvent[]
): [number, number] {
  if (timeSignatures.length === 0) return [4, 4];
  
  let current: [number, number] = [timeSignatures[0].numerator, timeSignatures[0].denominator];
  for (const ts of timeSignatures) {
    if (ts.tick <= tick) {
      current = [ts.numerator, ts.denominator];
    } else {
      break;
    }
  }
  return current;
}

/**
 * Quantize a tick position to the nearest grid position.
 */
export function quantizeTickToGrid(tick: number, gridSize: number): number {
  if (gridSize <= 0) {
    throw new Error('Grid size must be greater than 0');
  }
  return Math.round(tick / gridSize) * gridSize;
}

/**
 * Apply strength to a quantized tick.
 */
export function applyStrengthToTick(original: number, quantized: number, strength: number): number {
  const clampedStrength = Math.max(0, Math.min(100, strength));
  return Math.round(original + (quantized - original) * (clampedStrength / 100));
}

/**
 * Apply swing to a tick position.
 * Swing delays odd grid positions.
 */
export function applySwingToTick(tick: number, gridSize: number, swing: number): number {
  if (swing === 0) return tick;
  
  const clampedSwing = Math.max(0, Math.min(100, swing));
  const gridPosition = Math.round(tick / gridSize);
  const isOdd = gridPosition % 2 !== 0;
  
  if (isOdd) {
    // Swing offset: delays by 1/3 of grid size
    const swingOffset = Math.round((clampedSwing / 100) * (gridSize / 3));
    return tick + swingOffset;
  }
  
  return tick;
}

/**
 * Apply humanization to a tick position.
 */
export function applyHumanizeToTick(tick: number, humanizeTicks: number): number {
  if (humanizeTicks <= 0) return tick;
  
  const offset = Math.floor(Math.random() * (2 * humanizeTicks + 1)) - humanizeTicks;
  return Math.max(0, tick + offset);
}

/**
 * Apply groove template to a tick position.
 */
export function applyGrooveToTick(tick: number, gridSize: number, groove: GrooveTemplate): number {
  if (!groove.offsets || groove.offsets.length === 0) return tick;
  
  const gridPosition = Math.round(tick / gridSize);
  const grooveIndex = ((gridPosition % groove.offsets.length) + groove.offsets.length) % groove.offsets.length;
  const offsetTicks = groove.offsets[grooveIndex];
  
  return Math.max(0, Math.round(tick + offsetTicks));
}

/**
 * Full quantization pipeline for a single tick position.
 */
export function quantizeTickFull(
  originalTick: number,
  gridSize: number,
  params: QuantizeParams,
  groove: GrooveTemplate | null
): number {
  // Step 1: Quantize to grid
  let result = quantizeTickToGrid(originalTick, gridSize);
  
  // Step 2: Apply strength
  result = applyStrengthToTick(originalTick, result, params.strength);
  
  // Step 3: Apply groove template
  if (groove) {
    result = applyGrooveToTick(result, gridSize, groove);
  }
  
  // Step 4: Apply swing
  result = applySwingToTick(result, gridSize, params.swing);
  
  // Step 5: Apply humanize
  if (params.humanizeTicks > 0) {
    result = applyHumanizeToTick(result, params.humanizeTicks);
  }
  
  // Ensure non-negative
  return Math.max(0, result);
}

/**
 * Quantize a note's start and end ticks.
 */
export function quantizeNote(
  note: ParsedNote,
  gridSize: number,
  params: QuantizeParams,
  groove: GrooveTemplate | null
): { startTick: number; endTick: number; durationTicks: number } {
  let startTick = note.startTick;
  let endTick = note.endTick;
  
  // Quantize start
  if (params.quantizeStarts) {
    startTick = quantizeTickFull(note.startTick, gridSize, params, groove);
  }
  
  // Quantize end
  if (params.quantizeEnds) {
    endTick = quantizeTickFull(note.endTick, gridSize, params, groove);
  }
  
  // Ensure positive duration
  const durationTicks = Math.max(1, endTick - startTick);
  endTick = startTick + durationTicks;
  
  return { startTick, endTick, durationTicks };
}
