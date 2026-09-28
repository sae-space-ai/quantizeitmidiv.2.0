/**
 * QUANTIZE.IT - Monophonic Transcription Engine
 * 
 * Uses autocorrelation (YIN-inspired algorithm) for pitch detection.
 * Designed for monophonic instruments (clarinet, flute, voice).
 * 
 * LIMITATIONS (be honest about these):
 * - Works best with clear monophonic signals
 * - Struggles with polyphony, dense harmonics, heavy reverb
 * - May confuse vibrato with pitch changes
 * - Key noise (clarinet) may be detected as notes
 * - NOT a definitive transcription - requires human review
 * 
 * Algorithm reference:
 * - YIN: De Cheveigné, A., & Kawahara, H. (2002). YIN, a fundamental frequency estimator for speech and music.
 * - This is a simplified implementation for educational/demonstration purposes.
 */

export interface TranscribedNote {
  startTime: number;      // seconds
  endTime: number;        // seconds
  midiNote: number;       // MIDI note number (0-127)
  frequency: number;      // Hz
  confidence: number;     // 0-1
  velocity: number;       // estimated 0-1
  isDoubtful: boolean;    // low confidence region
  source: 'model' | 'user'; // origin of the note
}

export interface TranscriptionResult {
  notes: TranscribedNote[];
  sampleRate: number;
  duration: number;
  processingTimeMs: number;
  warnings: string[];
  targetInstrument: string;
}

export interface TranscriptionParams {
  minFrequency?: number;   // Hz (default: 100)
  maxFrequency?: number;   // Hz (default: 2000)
  minDuration?: number;    // seconds (default: 0.05)
  confidenceThreshold?: number; // 0-1 (default: 0.7)
  targetInstrument?: string;    // 'clarinet' | 'flute' | 'voice' | 'generic'
}

// A4 = 440 Hz, MIDI note 69
const A4_FREQ = 440;
const A4_MIDI = 69;

interface FrameResult {
  time: number;
  frequency: number;
  confidence: number;
  rms: number;
}

/**
 * Convert frequency to MIDI note number.
 */
export function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) return 0;
  return Math.round(12 * Math.log2(frequency / A4_FREQ) + A4_MIDI);
}

/**
 * Convert MIDI note to frequency.
 */
export function midiToFrequency(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * Transcribe monophonic audio to notes.
 * Uses autocorrelation-based pitch detection.
 */
export function transcribeMonophonic(
  audioBuffer: AudioBuffer,
  params: TranscriptionParams = {},
  startTime: number = 0,
  endTime?: number
): TranscriptionResult {
  const start = performance.now();
  const warnings: string[] = [];

  const config = {
    minFrequency: params.minFrequency || 100,
    maxFrequency: params.maxFrequency || 2000,
    minDuration: params.minDuration || 0.05,
    confidenceThreshold: params.confidenceThreshold || 0.7,
    targetInstrument: params.targetInstrument || 'generic',
  };

  // Get mono data (mix channels if stereo)
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const data = new Float32Array(length);

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] += channelData[i] / audioBuffer.numberOfChannels;
    }
  }

  // Apply time range
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = endTime !== undefined
    ? Math.floor(endTime * sampleRate)
    : length;
  const segmentData = data.slice(startSample, endSample);
  const segmentDuration = segmentData.length / sampleRate;

  // Frame-based pitch detection
  const frameSize = Math.floor(sampleRate * 0.05); // 50ms frames
  const hopSize = Math.floor(frameSize / 2); // 50% overlap
  const minLag = Math.floor(sampleRate / config.maxFrequency);
  const maxLag = Math.floor(sampleRate / config.minFrequency);

    const frames: FrameResult[] = [];

  for (let i = 0; i + frameSize < segmentData.length; i += hopSize) {
    const frame = segmentData.slice(i, i + frameSize);
    const frameTime = startTime + i / sampleRate;

    // Calculate RMS for amplitude
    let sumSquares = 0;
    for (let j = 0; j < frame.length; j++) {
      sumSquares += frame[j] * frame[j];
    }
    const rms = Math.sqrt(sumSquares / frame.length);

    // Skip silent frames
    if (rms < 0.01) {
      frames.push({ time: frameTime, frequency: 0, confidence: 0, rms });
      continue;
    }

    // Autocorrelation-based pitch detection (simplified YIN)
    const { frequency, confidence } = detectPitch(frame, sampleRate, minLag, maxLag);

    frames.push({ time: frameTime, frequency, confidence, rms });
  }

  // Convert frames to notes
  const notes = framesToNotes(frames, config, sampleRate);

  // Add warnings based on instrument type
  if (config.targetInstrument === 'clarinet') {
    warnings.push('Clarinet key noise may be detected as spurious notes');
    warnings.push('Register breaks may cause octave errors');
  }

  if (notes.length === 0) {
    warnings.push('No notes detected. Check audio levels and frequency range.');
  }

  const processingTimeMs = performance.now() - start;

  return {
    notes,
    sampleRate,
    duration: segmentDuration,
    processingTimeMs,
    warnings,
    targetInstrument: config.targetInstrument,
  };
}

/**
 * Detect pitch in a frame using autocorrelation.
 */
function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  minLag: number,
  maxLag: number
): { frequency: number; confidence: number } {
  const N = frame.length;
  
  // Calculate autocorrelation
  const correlations = new Float32Array(maxLag + 1);
  
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < N - lag; i++) {
      sum += frame[i] * frame[i + lag];
      norm1 += frame[i] * frame[i];
      norm2 += frame[i + lag] * frame[i + lag];
    }
    
    // Normalized autocorrelation
    const norm = Math.sqrt(norm1 * norm2);
    correlations[lag] = norm > 0 ? sum / norm : 0;
  }

  // Find peak in autocorrelation
  let bestLag = minLag;
  let bestCorr = correlations[minLag];
  
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (correlations[lag] > bestCorr) {
      bestCorr = correlations[lag];
      bestLag = lag;
    }
  }

  // Parabolic interpolation for sub-sample accuracy
  if (bestLag > minLag && bestLag < maxLag) {
    const a = correlations[bestLag - 1];
    const b = correlations[bestLag];
    const c = correlations[bestLag + 1];
    
    if (a < b && c < b) {
      const shift = (a - c) / (2 * (a - 2 * b + c));
      if (Math.abs(shift) < 1) {
        bestLag += shift;
      }
    }
  }

  const frequency = sampleRate / bestLag;
  const confidence = Math.max(0, Math.min(1, bestCorr));

  return { frequency, confidence };
}

/**
 * Convert pitch frames to discrete notes.
 */
function framesToNotes(
  frames: FrameResult[],
  config: Required<TranscriptionParams>,
  sampleRate: number
): TranscribedNote[] {
  const notes: TranscribedNote[] = [];
  let currentNote: Partial<TranscribedNote> | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const midi = frame.frequency > 0 ? frequencyToMidi(frame.frequency) : 0;
    const isOnset = frame.confidence >= config.confidenceThreshold && frame.rms > 0.02;

    if (isOnset) {
      if (!currentNote) {
        // Start new note
        currentNote = {
          startTime: frame.time,
          midiNote: midi,
          frequency: frame.frequency,
          velocity: Math.min(1, frame.rms * 5),
          confidence: frame.confidence,
          isDoubtful: frame.confidence < 0.85,
          source: 'model',
        };
      } else if (Math.abs(midi - (currentNote.midiNote || 0)) > 1) {
        // Pitch changed significantly - end current note, start new
        currentNote.endTime = frame.time;
        if ((currentNote.endTime! - currentNote.startTime!) >= config.minDuration) {
          notes.push(currentNote as TranscribedNote);
        }
        currentNote = {
          startTime: frame.time,
          midiNote: midi,
          frequency: frame.frequency,
          velocity: Math.min(1, frame.rms * 5),
          confidence: frame.confidence,
          isDoubtful: frame.confidence < 0.85,
          source: 'model',
        };
      } else {
        // Continue current note, update confidence
        currentNote.confidence = (currentNote.confidence! + frame.confidence) / 2;
        currentNote.isDoubtful = currentNote.confidence! < 0.85;
      }
    } else {
      // Silence or low confidence - end current note
      if (currentNote) {
        currentNote.endTime = frame.time;
        if ((currentNote.endTime! - currentNote.startTime!) >= config.minDuration) {
          notes.push(currentNote as TranscribedNote);
        }
        currentNote = null;
      }
    }
  }

  // Close any remaining note
  if (currentNote && frames.length > 0) {
    currentNote.endTime = frames[frames.length - 1].time + 0.05;
    if ((currentNote.endTime! - currentNote.startTime!) >= config.minDuration) {
      notes.push(currentNote as TranscribedNote);
    }
  }

  return notes;
}

/**
 * Validate transcription result.
 */
export function validateTranscription(result: TranscriptionResult): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [...result.warnings];

  if (result.notes.length === 0) {
    warnings.push('No notes detected');
  }

  // Check for very short notes
  const shortNotes = result.notes.filter(n => (n.endTime - n.startTime) < 0.05);
  if (shortNotes.length > 0) {
    warnings.push(`${shortNotes.length} notes shorter than 50ms may be artifacts`);
  }

  // Check for low confidence notes
  const lowConfidence = result.notes.filter(n => n.confidence < 0.7);
  if (lowConfidence.length > result.notes.length * 0.3) {
    warnings.push('More than 30% of notes have low confidence - review recommended');
  }

  // Check for extreme MIDI values
  const extremeNotes = result.notes.filter(n => n.midiNote < 36 || n.midiNote > 96);
  if (extremeNotes.length > 0) {
    warnings.push(`${extremeNotes.length} notes outside typical range (MIDI 36-96)`);
  }

  return {
    valid: result.notes.length > 0,
    warnings,
  };
}
