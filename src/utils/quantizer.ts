/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Core quantization engine - time-domain quantization.
 * 
 * Works in seconds (not ticks) to properly handle tempo changes.
 * Grid positions are calculated in seconds based on current tempo.
 */

import type { GridType, QuantizeParams, GrooveTemplate } from '../types';

/**
 * Calculate grid interval in seconds for a given tempo and grid type.
 * 
 * For binary grids: interval = (60 / bpm) * (4 / denominator)
 * For triplet grids: interval = (60 / bpm) * (4 / denominator) * (2/3)
 */
export function getGridIntervalSeconds(bpm: number, grid: GridType): number {
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

  // One whole note = 4/beats in 4/4 = 60/bpm * 4 seconds
  // Grid interval = whole note / denominator
  const wholeNoteSeconds = (60 / bpm) * 4;
  const baseInterval = wholeNoteSeconds / config.denominator;

  if (config.isTriplet) {
    // Triplet: 3 notes in the space of 2
    return baseInterval * (2 / 3);
  }

  return baseInterval;
}

/**
 * Quantize a time value to the nearest grid position.
 * Uses Math.round for proper rounding.
 */
export function quantizeTime(time: number, gridInterval: number): number {
  if (gridInterval <= 0) {
    throw new Error('Grid interval must be greater than 0');
  }
  return Math.round(time / gridInterval) * gridInterval;
}

/**
 * Apply strength to the quantization.
 * strength=0: no quantization (original time)
 * strength=100: full quantization
 * Formula: final = time + (quantized - time) * (strength / 100)
 */
export function applyStrength(original: number, quantized: number, strength: number): number {
  const clampedStrength = Math.max(0, Math.min(100, strength));
  return original + (quantized - original) * (clampedStrength / 100);
}

/**
 * Apply swing to odd subdivisions.
 * Swing delays every other grid position.
 */
export function applySwing(time: number, gridInterval: number, swing: number): number {
  if (swing === 0) return time;

  const clampedSwing = Math.max(0, Math.min(100, swing));
  const position = Math.round(time / gridInterval);
  const isOdd = position % 2 !== 0;

  if (isOdd) {
    // Swing offset: delays the odd position by a fraction of the grid interval
    const swingOffset = (clampedSwing / 100) * (gridInterval / 3);
    return time + swingOffset;
  }

  return time;
}

/**
 * Apply humanization - random offset within range.
 * Ensures time doesn't go negative.
 */
export function applyHumanize(time: number, humanizeMs: number): number {
  if (humanizeMs <= 0) return time;

  const offsetMs = (Math.random() * 2 - 1) * humanizeMs;
  const offsetSec = offsetMs / 1000; // Convert ms to seconds
  return Math.max(0, time + offsetSec);
}

/**
 * Apply groove template offsets.
 */
export function applyGroove(time: number, gridInterval: number, groove: GrooveTemplate): number {
  if (!groove.offsets || groove.offsets.length === 0) return time;

  const position = Math.round(time / gridInterval);
  const grooveIndex = ((position % groove.offsets.length) + groove.offsets.length) % groove.offsets.length;
  const offsetMs = groove.offsets[grooveIndex];
  const offsetSec = offsetMs / 1000;

  return Math.max(0, time + offsetSec);
}

/**
 * Extract groove template from note times.
 * Analyzes timing offsets from the grid.
 */
export function extractGrooveTemplate(
  noteTimes: number[],
  bpm: number,
  grid: GridType,
  name: string = 'Extracted Groove'
): GrooveTemplate {
  const gridInterval = getGridIntervalSeconds(bpm, grid);
  const offsets: number[] = new Array(16).fill(0);
  const counts: number[] = new Array(16).fill(0);

  for (const time of noteTimes) {
    const quantized = quantizeTime(time, gridInterval);
    const offsetMs = (time - quantized) * 1000; // Store in ms
    const position = Math.round(quantized / gridInterval);
    const index = ((position % 16) + 16) % 16;

    offsets[index] += offsetMs;
    counts[index]++;
  }

  // Average offsets
  for (let i = 0; i < 16; i++) {
    if (counts[i] > 0) {
      offsets[i] = Math.round(offsets[i] / counts[i]);
    }
  }

  return { offsets, name };
}

/**
 * Full quantization pipeline for a single time value.
 */
export function quantizeSingleTime(
  time: number,
  gridInterval: number,
  params: QuantizeParams,
  groove: GrooveTemplate | null
): number {
  // Step 1: Quantize to grid
  let result = quantizeTime(time, gridInterval);

  // Step 2: Apply strength
  result = applyStrength(time, result, params.strength);

  // Step 3: Apply groove template
  if (groove) {
    result = applyGroove(result, gridInterval, groove);
  }

  // Step 4: Apply swing
  result = applySwing(result, gridInterval, params.swing);

  // Step 5: Apply humanize
  if (params.humanizeTicks > 0) {
    // Convert ticks to approximate ms (assuming 480 PPQ at 120 BPM)
    const humanizeMs = params.humanizeTicks * (1000 / 480);
    result = applyHumanize(result, humanizeMs);
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
