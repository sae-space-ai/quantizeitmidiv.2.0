/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Binary MIDI verification tests.
 * 
 * These tests inspect the raw binary events of exported MIDI files
 * to verify correctness of quantization and tempo handling.
 */

import type { MidiFile, ParsedNote, TempoEvent, TimeSignatureEvent } from './midi-types';
import {
  parseMidiBinary,
  extractNotes,
  getAllTempoEvents,
  getAllTimeSignatureEvents,
} from './binary-midi';
import { getGridSizeTicks, getBarDurationTicks, getGridPositionsPerBar } from './tick-quantizer';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface TestSuite {
  name: string;
  results: TestResult[];
  passed: number;
  failed: number;
}

/**
 * Run all verification tests on a quantized MIDI file.
 */
export async function runBinaryTests(
  blob: Blob,
  expectedPPQ: number,
  expectedOutputTempo: number,
  expectedTimeSignature: [number, number],
  expectedGrid: string
): Promise<TestSuite> {
  const results: TestResult[] = [];
  const arrayBuffer = await blob.arrayBuffer();
  const midi = parseMidiBinary(arrayBuffer);

  // Test 1: PPQ matches
  results.push(testPPQ(midi, expectedPPQ));

  // Test 2: Single tempo event
  results.push(testSingleTempo(midi, expectedOutputTempo));

  // Test 3: Tempo at tick 0
  results.push(testTempoAtTick0(midi, expectedOutputTempo));

  // Test 4: Time signatures preserved
  results.push(testTimeSignatures(midi, expectedTimeSignature));

  // Test 5: Grid size calculation
  results.push(testGridSize(midi, expectedGrid as any));

  // Test 6: Grid positions per bar
  results.push(testGridPositionsPerBar(midi, expectedGrid as any, expectedTimeSignature));

  // Test 7: Note ordering
  results.push(testNoteOrdering(midi));

  // Test 8: Valid durations
  results.push(testValidDurations(midi));

  // Test 9: No negative ticks
  results.push(testNoNegativeTicks(midi));

  // Test 10: Notes quantized to grid
  results.push(testNotesOnGrid(midi, expectedGrid as any));

  // Test 11: Re-read verification
  results.push(await testReReadable(blob));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    name: 'Binary MIDI Verification',
    results,
    passed,
    failed,
  };
}

/**
 * Test 1: PPQ matches expected value.
 */
function testPPQ(midi: MidiFile, expectedPPQ: number): TestResult {
  const actual = midi.header.ticksPerBeat;
  return {
    name: 'PPQ matches expected value',
    passed: actual === expectedPPQ,
    message: actual === expectedPPQ
      ? `PPQ = ${actual} ✓`
      : `Expected PPQ ${expectedPPQ}, got ${actual}`,
  };
}

/**
 * Test 2: Single tempo event in the entire file.
 */
function testSingleTempo(midi: MidiFile, expectedBPM: number): TestResult {
  const tempos = getAllTempoEvents(midi);
  return {
    name: 'Single tempo event',
    passed: tempos.length === 1 && Math.abs(tempos[0].bpm - expectedBPM) < 0.1,
    message: tempos.length === 1
      ? `Single tempo: ${tempos[0].bpm.toFixed(1)} BPM ✓`
      : `Found ${tempos.length} tempo events (expected 1)`,
    details: tempos.map(t => `Tick ${t.tick}: ${t.bpm.toFixed(1)} BPM`).join('\n'),
  };
}

/**
 * Test 3: Tempo event is at tick 0.
 */
function testTempoAtTick0(midi: MidiFile, expectedBPM: number): TestResult {
  const tempos = getAllTempoEvents(midi);
  if (tempos.length === 0) {
    return {
      name: 'Tempo at tick 0',
      passed: false,
      message: 'No tempo events found',
    };
  }
  const firstTempo = tempos[0];
  return {
    name: 'Tempo event at tick 0',
    passed: firstTempo.tick === 0,
    message: firstTempo.tick === 0
      ? `Tempo at tick 0: ${firstTempo.bpm.toFixed(1)} BPM ✓`
      : `First tempo at tick ${firstTempo.tick} (expected 0)`,
  };
}

/**
 * Test 4: Time signatures are correct.
 */
function testTimeSignatures(midi: MidiFile, expected: [number, number]): TestResult {
  const sigs = getAllTimeSignatureEvents(midi);
  if (sigs.length === 0) {
    // Default is 4/4
    const isDefault44 = expected[0] === 4 && expected[1] === 4;
    return {
      name: 'Time signature',
      passed: isDefault44,
      message: isDefault44
        ? 'No time signature events (default 4/4) ✓'
        : `Expected ${expected[0]}/${expected[1]}, no events found`,
    };
  }
  const first = sigs[0];
  const matches = first.numerator === expected[0] && first.denominator === expected[1];
  return {
    name: 'Time signature',
    passed: matches,
    message: matches
      ? `Time signature ${first.numerator}/${first.denominator} ✓`
      : `Expected ${expected[0]}/${expected[1]}, got ${first.numerator}/${first.denominator}`,
  };
}

/**
 * Test 5: Grid size calculation is correct.
 */
function testGridSize(midi: MidiFile, grid: any): TestResult {
  const ppq = midi.header.ticksPerBeat;
  const gridSize = getGridSizeTicks(ppq, grid);
  
  // For 1/16 grid: gridSize should be PPQ / 4
  const expectedSizes: Record<string, number> = {
    '1/4': ppq,
    '1/8': ppq / 2,
    '1/16': ppq / 4,
    '1/32': ppq / 8,
    '1/4T': (ppq * 2) / 3,
    '1/8T': ppq / 3,
    '1/16T': ppq / 6,
  };
  
  const expected = expectedSizes[grid];
  const matches = Math.abs(gridSize - expected) < 0.01;
  
  return {
    name: `Grid size for ${grid}`,
    passed: matches,
    message: matches
      ? `Grid size = ${gridSize.toFixed(2)} ticks ✓`
      : `Expected ${expected.toFixed(2)} ticks, got ${gridSize.toFixed(2)}`,
  };
}

/**
 * Test 6: Grid positions per bar calculation.
 */
function testGridPositionsPerBar(midi: MidiFile, grid: any, timeSig: [number, number]): TestResult {
  const positions = getGridPositionsPerBar(timeSig, grid);
  
  // For 4/4 with 1/16: should be 16 positions
  // For 3/4 with 1/16: should be 12 positions
  let expected: number;
  if (grid === '1/16') {
    expected = timeSig[0] * 4; // beats per bar × 4 sixteenths per beat
  } else if (grid === '1/8') {
    expected = timeSig[0] * 2;
  } else if (grid === '1/4') {
    expected = timeSig[0];
  } else {
    expected = positions; // For other grids, just verify it's positive
  }
  
  const matches = Math.abs(positions - expected) < 0.01;
  
  return {
    name: `Grid positions per bar (${timeSig[0]}/${timeSig[1]} with ${grid})`,
    passed: matches && positions > 0,
    message: matches
      ? `${positions} positions per bar ✓`
      : `Expected ${expected} positions, got ${positions}`,
  };
}

/**
 * Test 7: Notes are in chronological order within each track.
 */
function testNoteOrdering(midi: MidiFile): TestResult {
  let allOrdered = true;
  let issues: string[] = [];
  
  for (let t = 0; t < midi.tracks.length; t++) {
    const notes = extractNotes(midi.tracks[t]);
    for (let i = 0; i < notes.length - 1; i++) {
      if (notes[i].startTick > notes[i + 1].startTick) {
        allOrdered = false;
        issues.push(`Track ${t}: note at tick ${notes[i].startTick} before note at ${notes[i + 1].startTick}`);
      }
    }
  }
  
  return {
    name: 'Note ordering',
    passed: allOrdered,
    message: allOrdered
      ? 'All notes in chronological order ✓'
      : `Found ${issues.length} ordering issues`,
    details: issues.slice(0, 5).join('\n'),
  };
}

/**
 * Test 8: All notes have valid positive durations.
 */
function testValidDurations(midi: MidiFile): TestResult {
  let allValid = true;
  let issues: string[] = [];
  
  for (let t = 0; t < midi.tracks.length; t++) {
    const notes = extractNotes(midi.tracks[t]);
    for (const note of notes) {
      if (note.durationTicks <= 0) {
        allValid = false;
        issues.push(`Track ${t}: note ${note.noteNumber} at tick ${note.startTick} has duration ${note.durationTicks}`);
      }
    }
  }
  
  return {
    name: 'Valid note durations',
    passed: allValid,
    message: allValid
      ? 'All notes have positive durations ✓'
      : `Found ${issues.length} invalid durations`,
    details: issues.slice(0, 5).join('\n'),
  };
}

/**
 * Test 9: No negative tick values.
 */
function testNoNegativeTicks(midi: MidiFile): TestResult {
  let allPositive = true;
  let issues: string[] = [];
  
  for (let t = 0; t < midi.tracks.length; t++) {
    const notes = extractNotes(midi.tracks[t]);
    for (const note of notes) {
      if (note.startTick < 0 || note.endTick < 0) {
        allPositive = false;
        issues.push(`Track ${t}: note ${note.noteNumber} has negative tick`);
      }
    }
  }
  
  return {
    name: 'No negative ticks',
    passed: allPositive,
    message: allPositive
      ? 'All tick values are non-negative ✓'
      : `Found ${issues.length} negative tick values`,
    details: issues.slice(0, 5).join('\n'),
  };
}

/**
 * Test 10: Notes are quantized to the grid (within tolerance).
 */
function testNotesOnGrid(midi: MidiFile, grid: any): TestResult {
  const ppq = midi.header.ticksPerBeat;
  const gridSize = getGridSizeTicks(ppq, grid);
  const tolerance = Math.max(1, Math.floor(gridSize * 0.05)); // 5% tolerance
  
  let onGrid = 0;
  let offGrid = 0;
  let issues: string[] = [];
  
  for (let t = 0; t < midi.tracks.length; t++) {
    const notes = extractNotes(midi.tracks[t]);
    for (const note of notes) {
      const remainder = note.startTick % gridSize;
      const distance = Math.min(remainder, gridSize - remainder);
      
      if (distance <= tolerance) {
        onGrid++;
      } else {
        offGrid++;
        if (issues.length < 5) {
          issues.push(`Track ${t}: note ${note.noteNumber} at tick ${note.startTick} is ${distance} ticks off grid`);
        }
      }
    }
  }
  
  const total = onGrid + offGrid;
  const percentage = total > 0 ? (onGrid / total) * 100 : 100;
  
  return {
    name: 'Notes on grid',
    passed: percentage >= 95,
    message: percentage >= 95
      ? `${onGrid}/${total} notes on grid (${percentage.toFixed(1)}%) ✓`
      : `Only ${onGrid}/${total} notes on grid (${percentage.toFixed(1)}%)`,
    details: issues.join('\n'),
  };
}

/**
 * Test 11: MIDI can be re-read successfully.
 */
async function testReReadable(blob: Blob): Promise<TestResult> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const midi = parseMidiBinary(arrayBuffer);
    
    // Verify basic structure
    if (!midi.header || !midi.tracks) {
      return {
        name: 'Re-readable',
        passed: false,
        message: 'MIDI structure invalid after re-read',
      };
    }
    
    // Count notes
    let totalNotes = 0;
    for (const track of midi.tracks) {
      totalNotes += extractNotes(track).length;
    }
    
    return {
      name: 'Re-readable',
      passed: true,
      message: `MIDI re-read successfully: ${midi.tracks.length} tracks, ${totalNotes} notes ✓`,
    };
  } catch (error) {
    return {
      name: 'Re-readable',
      passed: false,
      message: `Failed to re-read MIDI: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Format test suite results as text.
 */
export function formatTestResults(suite: TestSuite): string {
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push(`Test Suite: ${suite.name}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Results: ${suite.passed} passed, ${suite.failed} failed`);
  lines.push('');
  
  for (const result of suite.results) {
    const icon = result.passed ? '✓' : '✗';
    lines.push(`${icon} ${result.name}`);
    lines.push(`  ${result.message}`);
    if (result.details) {
      lines.push(`  Details: ${result.details}`);
    }
    lines.push('');
  }
  
  lines.push('='.repeat(60));
  return lines.join('\n');
}
