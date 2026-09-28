/**
 * QUANTIZE.IT - Enhanced Monophonic Transcription
 * 
 * Improved pitch detection with:
 * - Autocorrelation (YIN-inspired) with parabolic interpolation
 * - Onset detection for better note segmentation
 * - Confidence scoring based on signal clarity
 * - Doubtful region marking
 * - Harmonic series validation
 * 
 * LIMITATIONS (honest documentation):
 * - Works best with clear monophonic signals
 * - Struggles with polyphony, dense harmonics, heavy reverb
 * - May confuse vibrato with pitch changes
 * - Key noise (clarinet) may be detected as notes
 * - NOT a definitive transcription - requires human review
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
  harmonicStrength?: number; // how well it fits harmonic series
}

export interface TranscriptionResult {
  notes: TranscribedNote[];
  sampleRate: number;
  duration: number;
  processingTimeMs: number;
  warnings: string[];
  targetInstrument: string;
  overallConfidence: number;
}

export interface TranscriptionParams {
  minFrequency?: number;   // Hz (default: 100)
  maxFrequency?: number;   // Hz (default: 2000)
  minDuration?: number;    // seconds (default: 0.05)
  confidenceThreshold?: number; // 0-1 (default: 0.7)
  targetInstrument?: string;    // 'clarinet' | 'flute' | 'voice' | 'generic'
  onsetSensitivity?: number;    // 0-1 (default: 0.5)
}

// A4 = 440 Hz, MIDI note 69
const A4_FREQ = 440;
const A4_MIDI = 69;

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
 * Enhanced monophonic transcription with onset detection.
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
    onsetSensitivity: params.onsetSensitivity || 0.5,
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

  // Step 1: Detect onsets (note attacks)
  const onsets = detectOnsets(segmentData, sampleRate, config.onsetSensitivity);

  // Step 2: Extract pitch for each onset region
  const notes: TranscribedNote[] = [];
  
  for (let i = 0; i < onsets.length; i++) {
    const onsetTime = onsets[i];
    const nextOnset = i < onsets.length - 1 ? onsets[i + 1] : segmentDuration;
    
    // Extract pitch in this region
    const regionStart = Math.floor(onsetTime * sampleRate);
    const regionEnd = Math.floor(Math.min(onsetTime + 0.1, nextOnset) * sampleRate);
    const regionData = segmentData.slice(regionStart, regionEnd);
    
    if (regionData.length < sampleRate * 0.02) continue; // Skip very short regions
    
    const { frequency, confidence, harmonicStrength } = detectPitchEnhanced(
      regionData,
      sampleRate,
      config.minFrequency,
      config.maxFrequency
    );
    
    if (frequency > 0 && confidence >= config.confidenceThreshold) {
      // Find note end (where amplitude drops or next onset)
      let noteEnd = nextOnset;
      
      // Try to find natural end by amplitude drop
      const searchStart = Math.floor((onsetTime + 0.05) * sampleRate);
      const searchEnd = Math.floor(nextOnset * sampleRate);
      
      for (let j = searchStart; j < searchEnd; j += 100) {
        const rms = calculateRMS(segmentData, j, Math.min(j + 100, segmentData.length));
        if (rms < 0.01) {
          noteEnd = j / sampleRate;
          break;
        }
      }
      
      const midiNote = frequencyToMidi(frequency);
      const isDoubtful = confidence < 0.85 || harmonicStrength < 0.5;
      
      notes.push({
        startTime: onsetTime + startTime,
        endTime: noteEnd + startTime,
        midiNote,
        frequency,
        confidence,
        velocity: Math.min(1, calculateRMS(segmentData, regionStart, regionEnd) * 5),
        isDoubtful,
        source: 'model',
        harmonicStrength,
      });
    }
  }

  // Filter out very short notes
  const filteredNotes = notes.filter(n => (n.endTime - n.startTime) >= config.minDuration);

  // Calculate overall confidence
  const overallConfidence = filteredNotes.length > 0
    ? filteredNotes.reduce((sum, n) => sum + n.confidence, 0) / filteredNotes.length
    : 0;

  // Add warnings based on instrument type
  if (config.targetInstrument === 'clarinet') {
    warnings.push('Clarinet key noise may be detected as spurious notes');
    warnings.push('Register breaks may cause octave errors');
  }

  if (filteredNotes.length === 0) {
    warnings.push('No notes detected. Check audio levels and frequency range.');
  }

  if (overallConfidence < 0.7) {
    warnings.push(`Low overall confidence (${(overallConfidence * 100).toFixed(0)}%). Review recommended.`);
  }

  const processingTimeMs = performance.now() - start;

  return {
    notes: filteredNotes,
    sampleRate,
    duration: segmentDuration,
    processingTimeMs,
    warnings,
    targetInstrument: config.targetInstrument,
    overallConfidence,
  };
}

/**
 * Detect onsets (note attacks) using energy flux.
 */
function detectOnsets(data: Float32Array, sampleRate: number, sensitivity: number): number[] {
  const onsets: number[] = [];
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
  const hopSize = Math.floor(frameSize / 2);
  
  let prevEnergy = 0;
  const threshold = sensitivity * 0.1;
  
  for (let i = 0; i + frameSize < data.length; i += hopSize) {
    const energy = calculateRMS(data, i, i + frameSize);
    const flux = energy - prevEnergy;
    
    if (flux > threshold && energy > 0.02) {
      onsets.push(i / sampleRate);
    }
    
    prevEnergy = energy;
  }
  
  return onsets;
}

/**
 * Enhanced pitch detection with harmonic validation.
 */
function detectPitchEnhanced(
  frame: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number
): { frequency: number; confidence: number; harmonicStrength: number } {
  const N = frame.length;
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.floor(sampleRate / minFreq);
  
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

  // Validate with harmonic series
  const harmonicStrength = validateHarmonics(frame, sampleRate, frequency);

  return { frequency, confidence, harmonicStrength };
}

/**
 * Validate pitch by checking harmonic series.
 */
function validateHarmonics(frame: Float32Array, sampleRate: number, fundamental: number): number {
  if (fundamental <= 0) return 0;

  // Simple FFT-like check for harmonics
  const N = frame.length;
  const fundamentalLag = Math.floor(sampleRate / fundamental);
  
  let harmonicSum = 0;
  let harmonicCount = 0;
  
  // Check first 4 harmonics
  for (let h = 1; h <= 4; h++) {
    const harmonicLag = Math.floor(fundamentalLag / h);
    if (harmonicLag < N / 2) {
      let sum = 0;
      for (let i = 0; i < N - harmonicLag; i++) {
        sum += frame[i] * frame[i + harmonicLag];
      }
      harmonicSum += Math.abs(sum);
      harmonicCount++;
    }
  }
  
  return harmonicCount > 0 ? harmonicSum / (harmonicCount * N) : 0;
}

/**
 * Calculate RMS of a segment.
 */
function calculateRMS(data: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / (end - start));
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
