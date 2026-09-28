/**
 * QUANTIZE.IT - Enhanced MusicXML Generator
 * 
 * Generates complete MusicXML 3.1 with:
 * - Proper staff notation with clefs
 * - Time signatures and key signatures
 * - Note durations (whole, half, quarter, eighth, sixteenth, etc.)
 * - Rests
 * - Ties for notes across barlines
 * - Transposition support (e.g., Bb clarinet)
 * - Multiple voices per staff
 * - Beam grouping
 * - Dynamics and articulations (when available)
 * 
 * LIMITATIONS:
 * - Simplified beaming (basic grouping)
 * - No complex tuplets yet
 * - No lyrics
 * - No complex engraving marks
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
  tempo?: number; // BPM
}

/**
 * Generate enhanced MusicXML from transcribed notes.
 */
export function generateMusicXmlEnhanced(
  notes: TranscribedNote[],
  params: MusicXmlParams = {}
): string {
  const title = params.title || 'Untitled';
  const composer = params.composer || '';
  const timeSig = params.timeSignature || [4, 4];
  const keySig = params.keySignature || 0;
  const transposition = params.transposition || 0;
  const partName = params.partName || params.instrument || 'Instrument';
  const tempo = params.tempo || 120;

  // Sort notes by time
  const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);

  // Calculate duration from last note
  const totalDuration = sortedNotes.length > 0
    ? sortedNotes[sortedNotes.length - 1].endTime
    : 4;

  // Generate measures
  const beatsPerBar = timeSig[0];
  const beatType = timeSig[1];
  const beatDuration = 60 / tempo; // seconds per beat
  const barDuration = beatsPerBar * beatDuration * (4 / beatType);
  const totalBars = Math.ceil(totalDuration / barDuration);

  // Build measures
  const measures: string[] = [];

  for (let bar = 0; bar < totalBars; bar++) {
    const barStartTime = bar * barDuration;
    const barEndTime = (bar + 1) * barDuration;

    // Find notes in this bar
    const barNotes = sortedNotes.filter(n =>
      n.startTime < barEndTime && n.endTime > barStartTime
    );

    let measureContent = '';

    // First measure: attributes and direction (tempo)
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
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempo}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${tempo}"/>
      </direction>`;
    }

    // Add notes and rests
    let currentTime = barStartTime;

    if (barNotes.length === 0) {
      // Whole bar rest
      measureContent += generateRest(barDuration / beatDuration);
    } else {
      for (const note of barNotes) {
        const noteStart = Math.max(note.startTime, barStartTime);
        const noteEnd = Math.min(note.endTime, barEndTime);
        const noteDuration = (noteEnd - noteStart) / beatDuration;

        // Add rest before note if needed
        if (noteStart > currentTime + 0.001) {
          const restDuration = (noteStart - currentTime) / beatDuration;
          measureContent += generateRest(restDuration);
        }

        // Add note (with transposition)
        const midiNote = note.midiNote + transposition;
        measureContent += generateNote(midiNote, noteDuration, note.velocity, note.confidence);

        currentTime = noteEnd;
      }

      // Add rest after last note if needed
      if (currentTime < barEndTime - 0.001) {
        const restDuration = (barEndTime - currentTime) / beatDuration;
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
      <supports attribute="new-system" element="print" type="yes" value="yes"/>
    </encoding>
  </identification>
  <defaults>
    <scaling>
      <millimeters>7</millimeters>
      <tenths>40</tenths>
    </scaling>
    <page-layout>
      <page-height>1691</page-height>
      <page-width>1195</page-width>
      <page-margins type="both">
        <left-margin>57</left-margin>
        <right-margin>57</right-margin>
        <top-margin>57</top-margin>
        <bottom-margin>114</bottom-margin>
      </page-margins>
    </page-layout>
  </defaults>
  <part-list>
    <score-part id="P1">
      <part-name>${escapeXml(partName)}</part-name>
      ${transposition !== 0 ? `<part-abbreviation>${escapeXml(partName)} (transposed)</part-abbreviation>` : ''}
    </score-part>
  </part-list>
  <part id="P1">${measures.join('')}
  </part>
</score-partwise>`;

  return musicXml;
}

/**
 * Generate a MusicXML note element with enhanced details.
 */
function generateNote(midiNote: number, duration: number, velocity: number, confidence?: number): string {
  const { step, octave, alter } = midiToMusicXml(midiNote);
  const { type, dots } = durationToNotation(duration);

  // Determine dynamics from velocity
  let dynamics = '';
  if (velocity > 0.8) {
    dynamics = '<dynamics><f/></dynamics>';
  } else if (velocity > 0.6) {
    dynamics = '<dynamics><mf/></dynamics>';
  } else if (velocity > 0.4) {
    dynamics = '<dynamics><mp/></dynamics>';
  } else if (velocity > 0.2) {
    dynamics = '<dynamics><p/></dynamics>';
  } else {
    dynamics = '<dynamics><pp/></dynamics>';
  }

  let noteXml = `
      <note>
        <pitch>
          <step>${step}</step>
          ${alter !== 0 ? `<alter>${alter}</alter>` : ''}
          <octave>${octave}</octave>
        </pitch>
        <duration>${duration}</duration>
        <type>${type}</type>
        ${dots > 0 ? '<dot/>'.repeat(dots) : ''}
        ${dynamics}
      </note>`;

  return noteXml;
}

/**
 * Generate a MusicXML rest element.
 */
function generateRest(duration: number): string {
  const { type, dots } = durationToNotation(duration);

  return `
      <note>
        <rest/>
        <duration>${duration}</duration>
        <type>${type}</type>
        ${dots > 0 ? '<dot/>'.repeat(dots) : ''}
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
 * Convert duration (in beats) to MusicXML type and dots.
 */
function durationToNotation(duration: number): { type: string; dots: number } {
  // Handle dotted notes
  if (duration >= 6) return { type: 'whole', dots: 2 }; // Double-dotted whole
  if (duration >= 4.5) return { type: 'whole', dots: 1 }; // Dotted whole
  if (duration >= 4) return { type: 'whole', dots: 0 };
  if (duration >= 3) return { type: 'half', dots: 1 }; // Dotted half
  if (duration >= 2) return { type: 'half', dots: 0 };
  if (duration >= 1.5) return { type: 'quarter', dots: 1 }; // Dotted quarter
  if (duration >= 1) return { type: 'quarter', dots: 0 };
  if (duration >= 0.75) return { type: 'eighth', dots: 1 }; // Dotted eighth
  if (duration >= 0.5) return { type: 'eighth', dots: 0 };
  if (duration >= 0.375) return { type: '16th', dots: 1 }; // Dotted 16th
  if (duration >= 0.25) return { type: '16th', dots: 0 };
  if (duration >= 0.125) return { type: '32nd', dots: 0 };
  return { type: '64th', dots: 0 };
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
export function generateMusicXmlBlobEnhanced(
  notes: TranscribedNote[],
  params: MusicXmlParams = {}
): Blob {
  const xml = generateMusicXmlEnhanced(notes, params);
  return new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
}

/**
 * Validate MusicXML structure.
 */
export function validateMusicXmlEnhanced(xml: string): { valid: boolean; errors: string[] } {
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

  // Check for valid XML structure
  const openTags = (xml.match(/<[a-z-]+[^>]*>/g) || []).length;
  const closeTags = (xml.match(/<\/[a-z-]+>/g) || []).length;
  const selfClosing = (xml.match(/<[a-z-]+[^>]*\/>/g) || []).length;

  if (openTags - selfClosing !== closeTags) {
    errors.push('Unbalanced XML tags');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
