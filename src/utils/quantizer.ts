/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Core quantization engine - pure functions for MIDI event quantization.
 */

import type { GridType, QuantizeParams, GrooveTemplate } from '../types';

export type { GridType, QuantizeParams, GrooveTemplate };

/**
 * Calculate grid tick size based on PPQ and grid type.
 * Binary grids: grid_ticks = ppq * 4 / denominator
 * Triplet grids: grid_ticks = (ppq * 4 / denominator) * 2 / 3
 */
export function getGridTicks(ppq: number, grid: GridType): number {
  if (ppq <= 0) {
    throw new Error('PPQ must be greater than 0');
  }

  const gridMap: Record<GridType, { denominator: number; isTriplet: boolean }> = {
    '1/4':  { denominator: 4,  isTriplet: false },
    '1/8':  { denominator: 8,  isTriplet: false },
    '1/16': { denominator: 16, isTriplet: false },
    '1/32': { denominator: 32, isTriplet: false },
    '1/4T': { denominator: 4,  isTriplet: true },
    '1/8T': { denominator: 8,  isTriplet: true },
    '1/16T': { denominator: 16, isTriplet: true },
  };

  const config = gridMap[grid];
  if (!config) {
    throw new Error(`Invalid grid type: ${grid}`);
  }

  const baseTicks = (ppq * 4) / config.denominator;
  
  if (config.isTriplet) {
    return (baseTicks * 2) / 3;
  }

  return baseTicks;
}

/**
 * Quantize a single tick value to the nearest grid position.
 * Uses Math.round for proper rounding (not Math.floor/trunc).
 */
export function quantizeTick(tick: number, gridTicks: number): number {
  if (gridTicks <= 0) {
    throw new Error('Grid ticks must be greater than 0');
  }
  return Math.round(tick / gridTicks) * gridTicks;
}

/**
 * Apply strength to the quantization.
 * strength=0: no quantization (original tick)
 * strength=100: full quantization
 * Formula: final = tick + (quantized - tick) * (strength / 100)
 */
export function applyStrength(tick: number, quantized: number, strength: number): number {
  const clampedStrength = Math.max(0, Math.min(100, strength));
  return Math.round(tick + (quantized - tick) * (clampedStrength / 100));
}

/**
 * Apply swing to odd subdivisions.
 * Swing adds a delay to every other grid position.
 * Formula: offset += (swing / 100) * (gridTicks / 3)
 */
export function applySwing(tick: number, gridTicks: number, swing: number, ppq: number): number {
  if (swing === 0) return tick;
  
  const clampedSwing = Math.max(0, Math.min(100, swing));
  const position = tick / gridTicks;
  const isOdd = Math.round(position) % 2 !== 0;
  
  if (isOdd) {
    const swingOffset = (clampedSwing / 100) * (gridTicks / 3);
    return Math.round(tick + swingOffset);
  }
  
  return tick;
}

/**
 * Apply humanization - random offset within range.
 * Ensures tick doesn't go negative.
 */
export function applyHumanize(tick: number, humanizeTicks: number): number {
  if (humanizeTicks <= 0) return tick;
  
  const offset = Math.floor(Math.random() * (2 * humanizeTicks + 1)) - humanizeTicks;
  return Math.max(0, tick + offset);
}

/**
 * Apply groove template offsets.
 */
export function applyGroove(tick: number, gridTicks: number, groove: GrooveTemplate): number {
  if (!groove.offsets || groove.offsets.length === 0) return tick;
  
  const position = Math.round(tick / gridTicks);
  const grooveIndex = ((position % groove.offsets.length) + groove.offsets.length) % groove.offsets.length;
  const offset = groove.offsets[grooveIndex];
  
  return Math.max(0, Math.round(tick + offset));
}

/**
 * Extract groove template from a MIDI file's note positions.
 * Analyzes the timing offsets from the grid.
 */
export function extractGrooveTemplate(
  noteTicks: number[],
  ppq: number,
  grid: GridType,
  name: string = 'Extracted Groove'
): GrooveTemplate {
  const gridTicks = getGridTicks(ppq, grid);
  const offsets: number[] = new Array(16).fill(0);
  const counts: number[] = new Array(16).fill(0);

  for (const tick of noteTicks) {
    const quantized = quantizeTick(tick, gridTicks);
    const offset = tick - quantized;
    const position = Math.round(quantized / gridTicks);
    const index = ((position % 16) + 16) % 16;
    
    offsets[index] += offset;
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
 * Full quantization pipeline for a single tick value.
 */
export function quantizeSingle(
  tick: number,
  params: QuantizeParams,
  groove: GrooveTemplate | null
): number {
  const gridTicks = getGridTicks(params.ppq, params.grid);
  
  // Step 1: Quantize to grid
  let result = quantizeTick(tick, gridTicks);
  
  // Step 2: Apply strength
  result = applyStrength(tick, result, params.strength);
  
  // Step 3: Apply groove template
  if (groove) {
    result = applyGroove(result, gridTicks, groove);
  }
  
  // Step 4: Apply swing
  result = applySwing(result, gridTicks, params.swing, params.ppq);
  
  // Step 5: Apply humanize
  if (params.humanizeTicks > 0) {
    result = applyHumanize(result, params.humanizeTicks);
  }
  
  // Ensure non-negative
  return Math.max(0, result);
}

/**
 * Get all available grid options with descriptions.
 */
export function getGridOptions(): { value: GridType; label: string; description: string }[] {
  return [
    { value: '1/4',  label: '1/4',  description: 'Quarter notes' },
    { value: '1/8',  label: '1/8',  description: 'Eighth notes' },
    { value: '1/16', label: '1/16', description: 'Sixteenth notes' },
    { value: '1/32', label: '1/32', description: 'Thirty-second notes' },
    { value: '1/4T', label: '1/4T', description: 'Quarter triplets' },
    { value: '1/8T', label: '1/8T', description: 'Eighth triplets' },
    { value: '1/16T', label: '1/16T', description: 'Sixteenth triplets' },
  ];
}
