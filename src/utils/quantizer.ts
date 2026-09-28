/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Core quantization engine - grid position-based quantization.
 * 
 * Strategy:
 * 1. Convert note times to grid positions using local BPM
 * 2. Quantize grid positions (round, strength, swing, humanize)
 * 3. Convert quantized positions back to time using outputTempo
 * 4. Output file has constant outputTempo (default 56 BPM)
 */

import type { GridType, QuantizeParams, GrooveTemplate } from '../types';

/**
 * Calculate grid interval in seconds for a given tempo and grid type.
 */
export function getGridIntervalSeconds(
  bpm: number,
  grid: GridType,
  _timeSignature?: [number, number]
): number {
  if (bpm <= 0) {
    throw new Error('BPM must be greater than 0');
  }

  const gridConfig: Record<GridType, { denominator: number; isTriplet: boolean }> = {
    '1/4':  { denominator: 4,  isTriplet: false },
    '1/8':  { denominator: 8,  isTriplet: false },
    '1/16': { denominator: 16, isTriplet: false },
    '1/32': { denominator: 32, isTriplet: false },
    '1/4T': { denominator: 4,  isTriplet: true },
    '1/8T': { denominator: 8,  isTriplet: true },
    '1/16T': { denominator: 16, isTriplet: true },
  };

  const config = gridConfig[grid];
  if (!config) {
    throw new Error(`Invalid grid type: ${grid}`);
  }

  const beatDuration = 60 / bpm;
  const beatsPerGrid = 4 / config.denominator;
  let interval = beatDuration * beatsPerGrid;

  if (config.isTriplet) {
    interval = interval * (2 / 3);
  }

  return interval;
}

/**
 * Convert a time (in seconds) to a grid position (number of grid intervals from start).
 * Uses the BPM at that time to calculate the correct grid interval.
 */
export function timeToGridPosition(
  time: number,
  bpm: number,
  grid: GridType
): number {
  const gridInterval = getGridIntervalSeconds(bpm, grid);
  return time / gridInterval;
}

/**
 * Convert a grid position back to time (in seconds) using the output tempo.
 */
export function gridPositionToTime(
  position: number,
  outputBpm: number,
  grid: GridType
): number {
  const gridInterval = getGridIntervalSeconds(outputBpm, grid);
  return position * gridInterval;
}

/**
 * Quantize a grid position to the nearest integer.
 */
export function quantizeGridPosition(position: number): number {
  return Math.round(position);
}

/**
 * Apply strength to a grid position.
 * strength=0: no quantization (original position)
 * strength=100: full quantization (integer position)
 */
export function applyStrengthToPosition(
  originalPos: number,
  quantizedPos: number,
  strength: number
): number {
  const clampedStrength = Math.max(0, Math.min(100, strength));
  return originalPos + (quantizedPos - originalPos) * (clampedStrength / 100);
}

/**
 * Apply swing to a grid position.
 * Swing delays odd positions.
 */
export function applySwingToPosition(position: number, swing: number): number {
  if (swing === 0) return position;

  const clampedSwing = Math.max(0, Math.min(100, swing));
  const intPos = Math.round(position);
  const isOdd = intPos % 2 !== 0;

  if (isOdd) {
    // Swing offset: delays the odd position by 1/3 of a grid interval
    const swingOffset = (clampedSwing / 100) * (1 / 3);
    return position + swingOffset;
  }

  return position;
}

/**
 * Apply humanization to a grid position.
 * Adds random offset within range (in grid units).
 */
export function applyHumanizeToPosition(position: number, humanizeTicks: number): number {
  if (humanizeTicks <= 0) return position;

  // Convert ticks to grid units (assuming 480 PPQ, 1/16 grid = 120 ticks)
  const ticksPerGrid = 120;
  const humanizeGridUnits = humanizeTicks / ticksPerGrid;
  
  const offset = (Math.random() * 2 - 1) * humanizeGridUnits;
  return Math.max(0, position + offset);
}

/**
 * Apply groove template to a grid position.
 */
export function applyGrooveToPosition(
  position: number,
  groove: GrooveTemplate
): number {
  if (!groove.offsets || groove.offsets.length === 0) return position;

  const intPos = Math.round(position);
  const grooveIndex = ((intPos % groove.offsets.length) + groove.offsets.length) % groove.offsets.length;
  const offsetMs = groove.offsets[grooveIndex];
  
  // Convert ms offset to grid units (assuming 120 BPM, 1/16 grid)
  const gridIntervalMs = (60 / 120) * (4 / 16) * 1000; // 125ms at 120 BPM
  const offsetGridUnits = offsetMs / gridIntervalMs;
  
  return Math.max(0, position + offsetGridUnits);
}

/**
 * Full quantization pipeline for a grid position.
 */
export function quantizeGridPositionFull(
  originalPos: number,
  params: QuantizeParams,
  groove: GrooveTemplate | null
): number {
  // Step 1: Quantize to nearest integer position
  let result = quantizeGridPosition(originalPos);

  // Step 2: Apply strength
  result = applyStrengthToPosition(originalPos, result, params.strength);

  // Step 3: Apply groove template
  if (groove) {
    result = applyGrooveToPosition(result, groove);
  }

  // Step 4: Apply swing
  result = applySwingToPosition(result, params.swing);

  // Step 5: Apply humanize
  if (params.humanizeTicks > 0) {
    result = applyHumanizeToPosition(result, params.humanizeTicks);
  }

  // Ensure non-negative
  return Math.max(0, result);
}

/**
 * Get all available grid options with descriptions.
 */
export function getGridOptions(): { value: GridType; label: string; description: string }[] {
  return [
    { value: '1/4', label: '1/4', description: 'Quarter notes' },
    { value: '1/8', label: '1/8', description: 'Eighth notes' },
    { value: '1/16', label: '1/16', description: 'Sixteenth notes' },
    { value: '1/32', label: '1/32', description: 'Thirty-second notes' },
    { value: '1/4T', label: '1/4T', description: 'Quarter triplets' },
    { value: '1/8T', label: '1/8T', description: 'Eighth triplets' },
    { value: '1/16T', label: '1/16T', description: 'Sixteenth triplets' },
  ];
}
