/**
 * QUANTIZE.IT - Test MIDI Generator
 * Creates a test MIDI file with multiple tempo changes for testing.
 */

import { Midi } from '@tonejs/midi';

/**
 * Generate a test MIDI with tempo changes.
 * Structure:
 * - Bars 1-2: 120 BPM (quarter = 0.5s)
 * - Bars 3-4: 90 BPM (quarter = 0.667s)
 * - Bars 5-6: 140 BPM (quarter = 0.429s)
 * - Bars 7-8: 56 BPM (quarter = 1.071s)
 * 
 * Notes are placed slightly off-grid to test quantization.
 */
export function generateTestMidiWithTempoChanges(): Blob {
  const midi = new Midi();
  
  // Set initial tempo to 120 BPM
  midi.header.tempos.push({
    bpm: 120,
    time: 0,
  } as any);

  // Add a track
  const track = midi.addTrack();
  track.name = 'Test Track';
  track.channel = 0;

  // Helper: quarter note duration at given BPM
  const quarterAt = (bpm: number) => 60 / bpm;

  // Bars 1-2: 120 BPM (quarter = 0.5s, bar = 2s)
  // Place some notes slightly off-grid
  const bpm1 = 120;
  const q1 = quarterAt(bpm1);
  
  // Bar 1: notes on beats with slight offsets
  track.addNote({ midi: 60, time: 0.01, duration: q1 * 0.9 }); // Slightly early
  track.addNote({ midi: 64, time: q1 + 0.02, duration: q1 * 0.8 }); // Slightly late
  track.addNote({ midi: 67, time: q1 * 2 - 0.01, duration: q1 * 0.9 }); // Slightly early
  track.addNote({ midi: 72, time: q1 * 3 + 0.03, duration: q1 * 0.85 }); // Slightly late

  // Bar 2: more off-grid notes
  track.addNote({ midi: 60, time: q1 * 4 + 0.02, duration: q1 * 0.9 });
  track.addNote({ midi: 65, time: q1 * 5 - 0.02, duration: q1 * 0.8 });
  track.addNote({ midi: 67, time: q1 * 6 + 0.01, duration: q1 * 0.9 });
  track.addNote({ midi: 72, time: q1 * 7 - 0.03, duration: q1 * 0.85 });

  // Bars 3-4: 90 BPM (quarter = 0.667s, bar = 2.667s)
  const tempoChange1Time = q1 * 8; // End of bar 2
  midi.header.tempos.push({
    bpm: 90,
    time: tempoChange1Time,
  } as any);

  const bpm2 = 90;
  const q2 = quarterAt(bpm2);
  const bar2Start = tempoChange1Time;

  // Bar 3
  track.addNote({ midi: 60, time: bar2Start + 0.02, duration: q2 * 0.9 });
  track.addNote({ midi: 64, time: bar2Start + q2 - 0.01, duration: q2 * 0.8 });
  track.addNote({ midi: 67, time: bar2Start + q2 * 2 + 0.03, duration: q2 * 0.9 });
  track.addNote({ midi: 72, time: bar2Start + q2 * 3 - 0.02, duration: q2 * 0.85 });

  // Bar 4
  track.addNote({ midi: 60, time: bar2Start + q2 * 4 + 0.01, duration: q2 * 0.9 });
  track.addNote({ midi: 65, time: bar2Start + q2 * 5 - 0.03, duration: q2 * 0.8 });
  track.addNote({ midi: 67, time: bar2Start + q2 * 6 + 0.02, duration: q2 * 0.9 });
  track.addNote({ midi: 72, time: bar2Start + q2 * 7 - 0.01, duration: q2 * 0.85 });

  // Bars 5-6: 140 BPM (quarter = 0.429s, bar = 1.714s)
  const tempoChange2Time = bar2Start + q2 * 8;
  midi.header.tempos.push({
    bpm: 140,
    time: tempoChange2Time,
  } as any);

  const bpm3 = 140;
  const q3 = quarterAt(bpm3);
  const bar4Start = tempoChange2Time;

  // Bar 5
  track.addNote({ midi: 60, time: bar4Start + 0.01, duration: q3 * 0.9 });
  track.addNote({ midi: 64, time: bar4Start + q3 + 0.02, duration: q3 * 0.8 });
  track.addNote({ midi: 67, time: bar4Start + q3 * 2 - 0.01, duration: q3 * 0.9 });
  track.addNote({ midi: 72, time: bar4Start + q3 * 3 + 0.03, duration: q3 * 0.85 });

  // Bar 6
  track.addNote({ midi: 60, time: bar4Start + q3 * 4 - 0.02, duration: q3 * 0.9 });
  track.addNote({ midi: 65, time: bar4Start + q3 * 5 + 0.01, duration: q3 * 0.8 });
  track.addNote({ midi: 67, time: bar4Start + q3 * 6 - 0.03, duration: q3 * 0.9 });
  track.addNote({ midi: 72, time: bar4Start + q3 * 7 + 0.02, duration: q3 * 0.85 });

  // Bars 7-8: 56 BPM (quarter = 1.071s, bar = 4.286s)
  const tempoChange3Time = bar4Start + q3 * 8;
  midi.header.tempos.push({
    bpm: 56,
    time: tempoChange3Time,
  } as any);

  const bpm4 = 56;
  const q4 = quarterAt(bpm4);
  const bar6Start = tempoChange3Time;

  // Bar 7
  track.addNote({ midi: 60, time: bar6Start + 0.05, duration: q4 * 0.9 });
  track.addNote({ midi: 64, time: bar6Start + q4 - 0.04, duration: q4 * 0.8 });
  track.addNote({ midi: 67, time: bar6Start + q4 * 2 + 0.03, duration: q4 * 0.9 });
  track.addNote({ midi: 72, time: bar6Start + q4 * 3 - 0.05, duration: q4 * 0.85 });

  // Bar 8
  track.addNote({ midi: 60, time: bar6Start + q4 * 4 + 0.02, duration: q4 * 0.9 });
  track.addNote({ midi: 65, time: bar6Start + q4 * 5 - 0.03, duration: q4 * 0.8 });
  track.addNote({ midi: 67, time: bar6Start + q4 * 6 + 0.04, duration: q4 * 0.9 });
  track.addNote({ midi: 72, time: bar6Start + q4 * 7 - 0.02, duration: q4 * 0.85 });

  // Export as blob
  const midiData = midi.toArray();
  const buffer = new ArrayBuffer(midiData.length);
  const view = new Uint8Array(buffer);
  view.set(midiData);
  return new Blob([buffer], { type: 'audio/midi' });
}

/**
 * Download the test MIDI file.
 */
export function downloadTestMidi() {
  const blob = generateTestMidiWithTempoChanges();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'test_tempo_changes.mid';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
}
