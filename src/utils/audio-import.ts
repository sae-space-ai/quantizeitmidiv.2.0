/**
 * QUANTIZE.IT - Audio Import Module
 * 
 * Uses Web Audio API for native browser decoding.
 * Supports: WAV, MP3, FLAC, OGG, AAC
 * 
 * Features:
 * - Decode audio files to AudioBuffer
 * - Extract metadata (duration, channels, sample rate)
 * - Generate waveform data for visualization
 * - Create work copies for processing
 * - Preserve original file intact
 */

export interface AudioFileInfo {
  name: string;
  type: string;
  size: number;
  duration: number;
  numberOfChannels: number;
  sampleRate: number;
  bitDepth?: number;
  format: string;
}

export interface AudioWorkCopy {
  id: string;
  originalFile: File;
  audioBuffer: AudioBuffer;
  processedBuffer?: AudioBuffer;
  processingParams: Record<string, any>;
  createdAt: number;
}

export interface WaveformData {
  channels: Float32Array[];
  peak: number;
  rms: number;
  duration: number;
  sampleRate: number;
}

/**
 * Decode an audio file using Web Audio API.
 * Returns AudioBuffer and metadata.
 */
export async function decodeAudioFile(file: File): Promise<{
  audioBuffer: AudioBuffer;
  info: AudioFileInfo;
}> {
  // Validate file
  if (file.size === 0) {
    throw new Error('Audio file is empty');
  }
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('Audio file too large (max 100MB)');
  }

  // Detect format from MIME type and extension
  const format = detectAudioFormat(file);
  if (!format) {
    throw new Error(`Unsupported audio format: ${file.type || 'unknown'}`);
  }

  // Create AudioContext
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API not supported in this browser');
  }

  const audioContext = new AudioContextClass();

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    // Extract metadata
    const info: AudioFileInfo = {
      name: file.name,
      type: file.type,
      size: file.size,
      duration: audioBuffer.duration,
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      format: format,
    };

    return { audioBuffer, info };
  } catch (error) {
    throw new Error(`Failed to decode audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Close context to free resources
    await audioContext.close();
  }
}

/**
 * Detect audio format from file.
 */
function detectAudioFormat(file: File): string | null {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();

  const formatMap: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/mp4': 'aac',
    'audio/x-m4a': 'aac',
  };

  if (mimeType && formatMap[mimeType]) {
    return formatMap[mimeType];
  }

  // Fallback to extension
  if (extension) {
    const extMap: Record<string, string> = {
      'wav': 'wav',
      'wave': 'wav',
      'mp3': 'mp3',
      'flac': 'flac',
      'ogg': 'ogg',
      'aac': 'aac',
      'm4a': 'aac',
    };
    if (extMap[extension]) {
      return extMap[extension];
    }
  }

  return null;
}

/**
 * Generate waveform data from AudioBuffer.
 * Downsamples for visualization efficiency.
 */
export function generateWaveform(
  audioBuffer: AudioBuffer,
  targetSamples: number = 1000
): WaveformData {
  const channels: Float32Array[] = [];
  let peak = 0;
  let sumSquares = 0;
  let totalSamples = 0;

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    const downsampled = downsampleForVisualization(channelData, targetSamples);
    channels.push(downsampled);

    // Calculate peak and RMS
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.abs(channelData[i]);
      if (sample > peak) peak = sample;
      sumSquares += channelData[i] * channelData[i];
      totalSamples++;
    }
  }

  const rms = Math.sqrt(sumSquares / totalSamples);

  return {
    channels,
    peak,
    rms,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
  };
}

/**
 * Downsample audio data for visualization.
 */
function downsampleForVisualization(data: Float32Array, targetSamples: number): Float32Array {
  const ratio = Math.floor(data.length / targetSamples);
  if (ratio <= 1) return data;

  const result = new Float32Array(targetSamples);
  for (let i = 0; i < targetSamples; i++) {
    const start = i * ratio;
    const end = Math.min(start + ratio, data.length);
    
    // Use min/max for better visualization
    let min = 0, max = 0;
    for (let j = start; j < end; j++) {
      if (data[j] < min) min = data[j];
      if (data[j] > max) max = data[j];
    }
    result[i] = (min + max) / 2;
  }

  return result;
}

/**
 * Create a work copy of audio for processing.
 * Original file is preserved intact.
 */
export function createWorkCopy(
  file: File,
  audioBuffer: AudioBuffer
): AudioWorkCopy {
  return {
    id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    originalFile: file,
    audioBuffer: audioBuffer,
    processingParams: {},
    createdAt: Date.now(),
  };
}

/**
 * Extract a segment from AudioBuffer.
 */
export function extractSegment(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();

  const startSample = Math.floor(startTime * audioBuffer.sampleRate);
  const endSample = Math.floor(endTime * audioBuffer.sampleRate);
  const length = endSample - startSample;

  if (length <= 0) {
    throw new Error('Invalid segment range');
  }

  const segment = ctx.createBuffer(
    audioBuffer.numberOfChannels,
    length,
    audioBuffer.sampleRate
  );

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const sourceData = audioBuffer.getChannelData(ch);
    const targetData = segment.getChannelData(ch);
    
    for (let i = 0; i < length; i++) {
      targetData[i] = sourceData[startSample + i];
    }
  }

  ctx.close();
  return segment;
}

/**
 * Apply basic preprocessing (normalization, fade in/out).
 * Returns new AudioBuffer, original is not modified.
 */
export function preprocessAudio(
  audioBuffer: AudioBuffer,
  params: {
    normalize?: boolean;
    fadeIn?: number; // seconds
    fadeOut?: number; // seconds
  }
): AudioBuffer {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();

  const processed = ctx.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const sourceData = audioBuffer.getChannelData(ch);
    const targetData = processed.getChannelData(ch);

    // Copy data
    for (let i = 0; i < sourceData.length; i++) {
      targetData[i] = sourceData[i];
    }

    // Normalize
    if (params.normalize) {
      let peak = 0;
      for (let i = 0; i < targetData.length; i++) {
        const abs = Math.abs(targetData[i]);
        if (abs > peak) peak = abs;
      }
      if (peak > 0) {
        const gain = 0.99 / peak; // Leave headroom
        for (let i = 0; i < targetData.length; i++) {
          targetData[i] *= gain;
        }
      }
    }

    // Fade in
    if (params.fadeIn && params.fadeIn > 0) {
      const fadeSamples = Math.floor(params.fadeIn * audioBuffer.sampleRate);
      for (let i = 0; i < fadeSamples && i < targetData.length; i++) {
        targetData[i] *= i / fadeSamples;
      }
    }

    // Fade out
    if (params.fadeOut && params.fadeOut > 0) {
      const fadeSamples = Math.floor(params.fadeOut * audioBuffer.sampleRate);
      for (let i = 0; i < fadeSamples; i++) {
        const idx = targetData.length - 1 - i;
        if (idx >= 0) {
          targetData[idx] *= i / fadeSamples;
        }
      }
    }
  }

  ctx.close();
  return processed;
}

/**
 * Verify audio file integrity.
 */
export function verifyAudioFile(audioBuffer: AudioBuffer): {
  valid: boolean;
  message: string;
} {
  if (audioBuffer.duration <= 0) {
    return { valid: false, message: 'Audio duration is zero or negative' };
  }

  if (audioBuffer.numberOfChannels === 0) {
    return { valid: false, message: 'Audio has no channels' };
  }

  if (audioBuffer.sampleRate <= 0) {
    return { valid: false, message: 'Invalid sample rate' };
  }

  // Check for silence
  let hasSignal = false;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      if (Math.abs(data[i]) > 0.001) {
        hasSignal = true;
        break;
      }
    }
    if (hasSignal) break;
  }

  if (!hasSignal) {
    return { valid: true, message: 'Audio appears to be silent' };
  }

  return {
    valid: true,
    message: `Valid audio: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} ch, ${audioBuffer.sampleRate} Hz`,
  };
}
