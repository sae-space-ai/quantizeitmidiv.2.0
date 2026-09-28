/**
 * QUANTIZE.IT - Spectral Analysis Engine
 * 
 * Provides FFT-based spectral analysis for:
 * - Spectrogram generation (multiple resolutions)
 * - Harmonic analysis
 * - Timbre characterization
 * - Attack detection enhancement
 * - Noise vs signal separation
 * 
 * LIMITATIONS:
 * - Browser-based FFT (limited precision vs professional tools)
 * - No real-time analysis (batch processing)
 * - Spectral resolution depends on FFT size
 */

export interface SpectralFrame {
  time: number;           // seconds
  magnitudes: Float32Array; // frequency magnitudes
  phases: Float32Array;     // frequency phases
  peakFrequency: number;    // Hz
  peakMagnitude: number;
  spectralCentroid: number; // Hz (brightness)
  spectralRolloff: number;  // Hz
  spectralFlatness: number; // 0-1 (noisiness)
  rms: number;             // energy
}

export interface SpectrogramData {
  frames: SpectralFrame[];
  sampleRate: number;
  fftSize: number;
  hopSize: number;
  duration: number;
  maxFrequency: number;
}

export interface HarmonicAnalysis {
  fundamental: number;      // Hz
  harmonics: number[];      // Hz of detected harmonics
  harmonicStrengths: number[]; // relative strength 0-1
  inharmonicity: number;    // 0-1 (how inharmonic)
  brightness: number;       // 0-1 (spectral centroid normalized)
}

export interface TimbreFeatures {
  spectralCentroid: number;     // Hz (brightness)
  spectralRolloff: number;      // Hz
  spectralFlatness: number;     // 0-1 (noisiness)
  spectralCrest: number;        // 0-1 (peakedness)
  zeroCrossingRate: number;     // 0-1
  rms: number;                  // energy
  attackTime: number;           // seconds
  decayTime: number;            // seconds
  sustainLevel: number;         // 0-1
  releaseTime: number;          // seconds
}

export interface SpectralAnalysisParams {
  fftSize?: number;        // default: 2048
  hopSize?: number;        // default: 512
  windowType?: 'hann' | 'hamming' | 'blackman'; // default: 'hann'
  maxFrequency?: number;   // Hz, default: 20000
}

/**
 * Generate spectrogram from AudioBuffer.
 */
export function generateSpectrogram(
  audioBuffer: AudioBuffer,
  params: SpectralAnalysisParams = {}
): SpectrogramData {
  const config = {
    fftSize: params.fftSize || 2048,
    hopSize: params.hopSize || 512,
    windowType: params.windowType || 'hann',
    maxFrequency: params.maxFrequency || 20000,
  };

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0); // Use first channel
  const frames: SpectralFrame[] = [];

  // Generate window function
  const window = generateWindow(config.fftSize, config.windowType);

  // Process frames
  for (let i = 0; i + config.fftSize < channelData.length; i += config.hopSize) {
    const frameData = channelData.slice(i, i + config.fftSize);
    const time = i / sampleRate;

    // Apply window
    const windowedData = new Float32Array(config.fftSize);
    for (let j = 0; j < config.fftSize; j++) {
      windowedData[j] = frameData[j] * window[j];
    }

    // FFT (simplified - in production would use optimized FFT library)
    const { magnitudes, phases } = computeFFT(windowedData);

    // Calculate spectral features
    const peakFrequency = findPeakFrequency(magnitudes, sampleRate, config.fftSize);
    const peakMagnitude = Math.max(...magnitudes);
    const spectralCentroid = calculateSpectralCentroid(magnitudes, sampleRate, config.fftSize);
    const spectralRolloff = calculateSpectralRolloff(magnitudes, sampleRate, config.fftSize);
    const spectralFlatness = calculateSpectralFlatness(magnitudes);
    const rms = calculateRMS(frameData);

    frames.push({
      time,
      magnitudes,
      phases,
      peakFrequency,
      peakMagnitude,
      spectralCentroid,
      spectralRolloff,
      spectralFlatness,
      rms,
    });
  }

  return {
    frames,
    sampleRate,
    fftSize: config.fftSize,
    hopSize: config.hopSize,
    duration: channelData.length / sampleRate,
    maxFrequency: config.maxFrequency,
  };
}

/**
 * Generate window function.
 */
function generateWindow(size: number, type: string): Float32Array {
  const window = new Float32Array(size);
  
  for (let i = 0; i < size; i++) {
    switch (type) {
      case 'hann':
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        break;
      case 'hamming':
        window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
        break;
      case 'blackman':
        window[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)) 
                    + 0.08 * Math.cos((4 * Math.PI * i) / (size - 1));
        break;
      default:
        window[i] = 1;
    }
  }
  
  return window;
}

/**
 * Compute FFT (simplified DFT for demonstration).
 * In production, use a proper FFT library for performance.
 */
function computeFFT(data: Float32Array): { magnitudes: Float32Array; phases: Float32Array } {
  const N = data.length;
  const halfN = Math.floor(N / 2);
  const magnitudes = new Float32Array(halfN);
  const phases = new Float32Array(halfN);

  // Simplified DFT (not optimized - for demonstration)
  for (let k = 0; k < halfN; k++) {
    let real = 0;
    let imag = 0;
    
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += data[n] * Math.cos(angle);
      imag -= data[n] * Math.sin(angle);
    }
    
    magnitudes[k] = Math.sqrt(real * real + imag * imag) / N;
    phases[k] = Math.atan2(imag, real);
  }

  return { magnitudes, phases };
}

/**
 * Find peak frequency in spectrum.
 */
function findPeakFrequency(magnitudes: Float32Array, sampleRate: number, fftSize: number): number {
  let maxIndex = 0;
  let maxValue = 0;
  
  for (let i = 1; i < magnitudes.length; i++) {
    if (magnitudes[i] > maxValue) {
      maxValue = magnitudes[i];
      maxIndex = i;
    }
  }
  
  return (maxIndex * sampleRate) / fftSize;
}

/**
 * Calculate spectral centroid (brightness).
 */
function calculateSpectralCentroid(magnitudes: Float32Array, sampleRate: number, fftSize: number): number {
  let weightedSum = 0;
  let totalMagnitude = 0;
  
  for (let i = 0; i < magnitudes.length; i++) {
    const frequency = (i * sampleRate) / fftSize;
    weightedSum += frequency * magnitudes[i];
    totalMagnitude += magnitudes[i];
  }
  
  return totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
}

/**
 * Calculate spectral rolloff (frequency below which 85% of energy is contained).
 */
function calculateSpectralRolloff(magnitudes: Float32Array, sampleRate: number, fftSize: number): number {
  const totalEnergy = magnitudes.reduce((sum, mag) => sum + mag * mag, 0);
  const threshold = totalEnergy * 0.85;
  
  let cumulativeEnergy = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    cumulativeEnergy += magnitudes[i] * magnitudes[i];
    if (cumulativeEnergy >= threshold) {
      return (i * sampleRate) / fftSize;
    }
  }
  
  return sampleRate / 2;
}

/**
 * Calculate spectral flatness (noisiness measure).
 */
function calculateSpectralFlatness(magnitudes: Float32Array): number {
  const geometricMean = Math.exp(
    magnitudes.reduce((sum, mag) => sum + Math.log(Math.max(mag, 1e-10)), 0) / magnitudes.length
  );
  const arithmeticMean = magnitudes.reduce((sum, mag) => sum + mag, 0) / magnitudes.length;
  
  return arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
}

/**
 * Calculate RMS energy.
 */
function calculateRMS(data: Float32Array): number {
  const sumSquares = data.reduce((sum, sample) => sum + sample * sample, 0);
  return Math.sqrt(sumSquares / data.length);
}

/**
 * Analyze harmonics in a spectral frame.
 */
export function analyzeHarmonics(
  frame: SpectralFrame,
  sampleRate: number,
  fftSize: number,
  fundamental?: number
): HarmonicAnalysis {
  const fundamentalFreq = fundamental || frame.peakFrequency;
  const harmonics: number[] = [];
  const harmonicStrengths: number[] = [];
  
  // Search for harmonics (up to 8th harmonic)
  for (let h = 1; h <= 8; h++) {
    const expectedFreq = fundamentalFreq * h;
    const expectedBin = Math.round((expectedFreq * fftSize) / sampleRate);
    
    if (expectedBin >= frame.magnitudes.length) break;
    
    // Search around expected bin (±2 bins)
    let maxMagnitude = 0;
    let maxBin = expectedBin;
    
    for (let i = Math.max(0, expectedBin - 2); i < Math.min(frame.magnitudes.length, expectedBin + 3); i++) {
      if (frame.magnitudes[i] > maxMagnitude) {
        maxMagnitude = frame.magnitudes[i];
        maxBin = i;
      }
    }
    
    if (maxMagnitude > frame.peakMagnitude * 0.1) { // At least 10% of fundamental
      harmonics.push((maxBin * sampleRate) / fftSize);
      harmonicStrengths.push(maxMagnitude / frame.peakMagnitude);
    }
  }
  
  // Calculate inharmonicity (deviation from perfect harmonics)
  let inharmonicity = 0;
  if (harmonics.length > 1) {
    for (let i = 1; i < harmonics.length; i++) {
      const expected = fundamentalFreq * (i + 1);
      const actual = harmonics[i];
      inharmonicity += Math.abs(actual - expected) / expected;
    }
    inharmonicity /= (harmonics.length - 1);
  }
  
  // Brightness (normalized spectral centroid)
  const nyquist = sampleRate / 2;
  const brightness = Math.min(1, frame.spectralCentroid / (nyquist * 0.5));
  
  return {
    fundamental: fundamentalFreq,
    harmonics,
    harmonicStrengths,
    inharmonicity,
    brightness,
  };
}

/**
 * Extract timbre features from a segment of audio.
 */
export function extractTimbreFeatures(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): TimbreFeatures {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const segmentData = channelData.slice(startSample, endSample);
  
  // Generate spectrogram for this segment
  const segmentBuffer = new AudioBuffer({
    numberOfChannels: 1,
    length: segmentData.length,
    sampleRate,
  });
  segmentBuffer.copyToChannel(segmentData, 0);
  
  const spectrogram = generateSpectrogram(segmentBuffer, {
    fftSize: 1024,
    hopSize: 256,
  });
  
  // Average spectral features across frames
  let avgCentroid = 0;
  let avgRolloff = 0;
  let avgFlatness = 0;
  let avgRMS = 0;
  
  for (const frame of spectrogram.frames) {
    avgCentroid += frame.spectralCentroid;
    avgRolloff += frame.spectralRolloff;
    avgFlatness += frame.spectralFlatness;
    avgRMS += frame.rms;
  }
  
  const numFrames = spectrogram.frames.length || 1;
  avgCentroid /= numFrames;
  avgRolloff /= numFrames;
  avgFlatness /= numFrames;
  avgRMS /= numFrames;
  
  // Spectral crest (peakedness)
  const avgMagnitudes = new Float32Array(spectrogram.fftSize / 2);
  for (const frame of spectrogram.frames) {
    for (let i = 0; i < avgMagnitudes.length; i++) {
      avgMagnitudes[i] += frame.magnitudes[i];
    }
  }
  for (let i = 0; i < avgMagnitudes.length; i++) {
    avgMagnitudes[i] /= numFrames;
  }
  
  const maxMagnitude = Math.max(...avgMagnitudes);
  const avgMagnitude = avgMagnitudes.reduce((sum, mag) => sum + mag, 0) / avgMagnitudes.length;
  const spectralCrest = avgMagnitude > 0 ? maxMagnitude / avgMagnitude : 0;
  
  // Zero crossing rate
  let zeroCrossings = 0;
  for (let i = 1; i < segmentData.length; i++) {
    if ((segmentData[i] >= 0 && segmentData[i - 1] < 0) ||
        (segmentData[i] < 0 && segmentData[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  const zeroCrossingRate = zeroCrossings / segmentData.length;
  
  // Envelope analysis (simplified)
  const envelope = calculateEnvelope(segmentData, sampleRate);
  
  return {
    spectralCentroid: avgCentroid,
    spectralRolloff: avgRolloff,
    spectralFlatness: avgFlatness,
    spectralCrest,
    zeroCrossingRate,
    rms: avgRMS,
    attackTime: envelope.attackTime,
    decayTime: envelope.decayTime,
    sustainLevel: envelope.sustainLevel,
    releaseTime: envelope.releaseTime,
  };
}

/**
 * Calculate amplitude envelope (ADSR).
 */
function calculateEnvelope(data: Float32Array, sampleRate: number): {
  attackTime: number;
  decayTime: number;
  sustainLevel: number;
  releaseTime: number;
} {
  // Calculate RMS in windows
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
  const envelope: number[] = [];
  
  for (let i = 0; i < data.length; i += windowSize) {
    const window = data.slice(i, Math.min(i + windowSize, data.length));
    const rms = Math.sqrt(window.reduce((sum, sample) => sum + sample * sample, 0) / window.length);
    envelope.push(rms);
  }
  
  // Find peak
  const peakIndex = envelope.indexOf(Math.max(...envelope));
  const peakTime = peakIndex * 0.01;
  
  // Attack time (time to peak)
  const attackTime = peakTime;
  
  // Find sustain level (average after peak)
  const sustainStart = Math.floor(envelope.length * 0.3);
  const sustainEnd = Math.floor(envelope.length * 0.7);
  const sustainSamples = envelope.slice(sustainStart, sustainEnd);
  const sustainLevel = sustainSamples.length > 0
    ? sustainSamples.reduce((sum, val) => sum + val, 0) / sustainSamples.length
    : 0;
  
  // Decay time (peak to sustain)
  const decayTime = Math.max(0, peakTime - 0.05); // Simplified
  
  // Release time (end of signal)
  const releaseStart = Math.floor(envelope.length * 0.8);
  const releaseSamples = envelope.slice(releaseStart);
  const releaseTime = releaseSamples.length * 0.01;
  
  return {
    attackTime,
    decayTime,
    sustainLevel,
    releaseTime,
  };
}
