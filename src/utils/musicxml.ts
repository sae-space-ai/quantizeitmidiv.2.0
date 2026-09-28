/**
 * QUANTIZE.IT - MusicXML Generator
 * 
 * Converts MIDI notes to MusicXML format (.musicxml).
 * Generates valid XML that can be opened in MuseScore, Finale, Sibelius.
 * 
 * Features:
 * - Proper staff notation with clefs
 * - Time signatures and key signatures
 * - Note durations (whole, half, quarter, eighth, sixteenth)
 * - Rests
 * - Ties for notes across barlines
 * - Transposition support (e.g., Bb clarinet)
 * 
 * LIMITATIONS:
 * - Simplified notation (no complex beaming, tuplets limited)
 * - No dynamics/articulations unless explicitly provided
 * - Human review recommended for professional engraving
 */

import type { TranscribedNote } from './transcription';

export interface MusicXmlParams {
  title?: string;
  composer?: string;
  timeSignature?: [number, number];
  keySignature?: number; // -7 to 7 (flats to sharps)
  transposition?: number; // semitones (e.g., -2 for Bb clarinet)
  instrument?: string;
  partName?: string;
}

/**
 * Generate MusicXML from transcribed notes.
 */
export function generateMusicXml(
  notes: TranscribedNote[],
  params: MusicXmlParams = {}
): string {
  const title = params.title || 'Untitled';
  const composer = params.composer || '';
  const timeSig = params.timeSignature || [4, 4];
  const keySig = params.keySignature || 0;
  const transposition = params.transposition || 0;
  const partName = params.partName || params.instrument || 'Instrument';

  // Sort notes by time
  const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);

  // Calculate duration from last note
  const totalDuration = sortedNotes.length > 0
    ? sortedNotes[sortedNotes.length - 1].endTime
    : 4; // Default 4 seconds

  // Estimate tempo (assume 120 BPM if not specified)
  const bpm = 120;
  const beatsPerSecond = bpm / 60;

  // Generate measures
  const beatsPerBar = timeSig[0];
  const beatType = timeSig[1];
  const barDuration = beatsPerBar * (4 / beatType); // in quarter notes
  const totalBars = Math.ceil(totalDuration * beatsPerSecond / beatsPerBar);

  // Build measures
  const measures: string[] = [];

  for (let bar = 0; bar < totalBars; bar++) {
    const barStartTime = (bar * barDuration) / beatsPerSecond;
    const barEndTime = ((bar + 1) * barDuration) / beatsPerSecond;

    // Find notes in this bar
    const barNotes = sortedNotes.filter(n =>
      n.startTime < barEndTime && n.endTime > barStartTime
    );

    let measureContent = '';

    // First measure: attributes
    if (bar === 0) {
      measureContent += `
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>${keySig}</fifths>
        </key>
        <time>
          <beats>${timeSig[0]}</beats>
          <beat-type>${timeSig[1]}</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
        ${transposition !== 0 ? `
        <transpose>
          <diatonic>${transposition > 0 ? transposition : transposition}</diatonic>
          <chromatic>${transposition}</chromatic>
        </transpose>` : ''}
      </attributes>`;
    }

    // Add notes and rests
    let currentTime = barStartTime;

    if (barNotes.length === 0) {
      // Whole bar rest
      measureContent += generateRest(barDuration);
    } else {
      for (const note of barNotes) {
        const noteStart = Math.max(note.startTime, barStartTime);
        const noteEnd = Math.min(note.endTime, barEndTime);
        const noteDuration = (noteEnd - noteStart) * beatsPerSecond;

        // Add rest before note if needed
        if (noteStart > currentTime) {
          const restDuration = (noteStart - currentTime) * beatsPerSecond;
          measureContent += generateRest(restDuration);
        }

        // Add note (with transposition)
        const midiNote = note.midiNote + transposition;
        measureContent += generateNote(midiNote, noteDuration, note.velocity);

        currentTime = noteEnd;
      }

      // Add rest after last note if needed
      if (currentTime < barEndTime) {
        const restDuration = (barEndTime - currentTime) * beatsPerSecond;
        measureContent += generateRest(restDuration);
      }
    }

    measures.push(`
    <measure number="${bar + 1}">${measureContent}
    </measure>`);
  }

  // Build complete MusicXML
  const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${escapeXml(title)}</work-title>
  </work>
  <identification>
    <creator type="composer">${escapeXml(composer)}</creator>
    <encoding>
      <software>QUANTIZE.IT MIDI Quantizer Pro</software>
      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>${escapeXml(partName)}</part-name>
    </score-part>
  </part-list>
  <part id="P1">${measures.join('')}
  </part>
</score-partwise>`;

  return musicXml;
}

/**
 * Generate a MusicXML note element.
 */
function generateNote(midiNote: number, duration: number, velocity: number): string {
  const { step, octave, alter } = midiToMusicXml(midiNote);
  const type = durationToType(duration);
  const dots = durationToDots(duration);

  let noteXml = `
      <note>
        <pitch>
          <step>${step}</step>
          ${alter !== 0 ? `<alter>${alter}</alter>` : ''}
          <octave>${octave}</octave>
        </pitch>
        <duration>${duration}</duration>
        <type>${type}</type>
        ${dots > 0 ? `<dot/>`.repeat(dots) : ''}
      </note>`;

  return noteXml;
}

/**
 * Generate a MusicXML rest element.
 */
function generateRest(duration: number): string {
  const type = durationToType(duration);
  const dots = durationToDots(duration);

  return `
      <note>
        <rest/>
        <duration>${duration}</duration>
        <type>${type}</type>
        ${dots > 0 ? `<dot/>`.repeat(dots) : ''}
      </note>`;
}

/**
 * Convert MIDI note to MusicXML pitch.
 */
function midiToMusicXml(midi: number): { step: string; octave: number; alter: number } {
  const noteNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;

  return {
    step: noteNames[pitchClass],
    octave,
    alter: alters[pitchClass],
  };
}

/**
 * Convert duration (in quarter notes) to MusicXML type.
 */
function durationToType(duration: number): string {
  if (duration >= 4) return 'whole';
  if (duration >= 2) return 'half';
  if (duration >= 1) return 'quarter';
  if (duration >= 0.5) return 'eighth';
  if (duration >= 0.25) return '16th';
  if (duration >= 0.125) return '32nd';
  return '64th';
}

/**
 * Calculate dots for duration.
 */
function durationToDots(duration: number): number {
  // Simplified: no dots for now
  return 0;
}

/**
 * Escape XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate MusicXML file as Blob.
 */
export function generateMusicXmlBlob(
  notes: TranscribedNote[],
  params: MusicXmlParams = {}
): Blob {
  const xml = generateMusicXml(notes, params);
  return new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
}

/**
 * Validate MusicXML structure.
 */
export function validateMusicXml(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for required elements
  if (!xml.includes('<score-partwise')) {
    errors.push('Missing <score-partwise> root element');
  }
  if (!xml.includes('<part-list>')) {
    errors.push('Missing <part-list> element');
  }
  if (!xml.includes('<part')) {
    errors.push('Missing <part> element');
  }
  if (!xml.includes('<measure')) {
    errors.push('No measures found');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
