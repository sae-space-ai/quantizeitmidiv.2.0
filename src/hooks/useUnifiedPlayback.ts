/**
 * QUANTIZE.IT - Unified Playback Hook
 * 
 * Provides synchronized playback across 7 contexts:
 * 1. Audio original (WAV/MP3/FLAC)
 * 2. MIDI original (antes de cuantizar)
 * 3. Transcripción estimada
 * 4. Edición (cambios en fragmento/pista)
 * 5. Etapas musicales (4 etapas)
 * 6. Resultado cuantizado (56 BPM)
 * 7. Partitura (MusicXML)
 * 
 * Features:
 * - Synchronized cursor across all views
 * - Play/Pause/Stop with proper cleanup
 * - Solo/Mute per track
 * - Loop regions
 * - No hanging notes on Stop
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { MidiPlayer, type PlaybackState } from '../utils/midi-player';
import type { MidiFile } from '../utils/midi-types';
import type { TranscribedNote } from '../utils/transcription-enhanced';
import { Midi } from '@tonejs/midi';
import { parseMidiBinary } from '../utils/binary-midi';

export type PlaybackContext = 
  | 'audio-original'
  | 'midi-original'
  | 'transcription'
  | 'edition'
  | 'stage-rhythmic'
  | 'stage-harmonic'
  | 'stage-strings-woodwinds'
  | 'stage-brass'
  | 'quantized'
  | 'score';

export interface UnifiedPlaybackState {
  context: PlaybackContext | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  mutedTracks: Set<number>;
  soloTracks: Set<number>;
}

export interface UnifiedPlaybackControls {
  play: (context: PlaybackContext, startTime?: number) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setLoop: (enabled: boolean, start?: number, end?: number) => void;
  muteTrack: (trackIndex: number, muted: boolean) => void;
  soloTrack: (trackIndex: number, solo: boolean) => void;
  getState: () => UnifiedPlaybackState;
}

interface UseUnifiedPlaybackProps {
  audioBuffer?: AudioBuffer | null;
  originalMidi?: MidiFile | null;
  quantizedMidi?: MidiFile | null;
  transcribedNotes?: TranscribedNote[] | null;
  editedNotes?: TranscribedNote[] | null;
  stageNotes?: { [key: string]: TranscribedNote[] };
  onTimeUpdate?: (time: number) => void;
  onStateChange?: (state: UnifiedPlaybackState) => void;
}

export function useUnifiedPlayback({
  audioBuffer,
  originalMidi,
  quantizedMidi,
  transcribedNotes,
  editedNotes,
  stageNotes,
  onTimeUpdate,
  onStateChange,
}: UseUnifiedPlaybackProps): UnifiedPlaybackControls {
  const midiPlayerRef = useRef<MidiPlayer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioStartTimeRef = useRef<number>(0);
  const audioPauseTimeRef = useRef<number>(0);
  
  const [state, setState] = useState<UnifiedPlaybackState>({
    context: null,
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
    mutedTracks: new Set(),
    soloTracks: new Set(),
  });

  const animationFrameRef = useRef<number | null>(null);

  // Initialize MIDI player
  useEffect(() => {
    midiPlayerRef.current = new MidiPlayer({
      onTimeUpdate: (time) => {
        setState(prev => ({ ...prev, currentTime: time }));
        onTimeUpdate?.(time);
      },
      onStateChange: (midiState) => {
        setState(prev => ({
          ...prev,
          isPlaying: midiState.isPlaying,
          isPaused: midiState.isPaused,
          duration: midiState.duration,
        }));
      },
      onEnd: () => {
        setState(prev => ({ ...prev, currentTime: 0, isPlaying: false }));
      },
      onError: (error) => {
        console.error('MIDI player error:', error);
      },
    });

    return () => {
      midiPlayerRef.current?.dispose();
      stopAudio();
    };
  }, []);

  // Notify state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Audio playback functions
  const playAudio = useCallback((startTime: number = 0) => {
    if (!audioBuffer) return;

    stopAudio();

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0, startTime);

    audioSourceRef.current = source;
    audioStartTimeRef.current = ctx.currentTime - startTime;

    source.onended = () => {
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    };

    // Start animation loop for time updates
    const updateTime = () => {
      if (audioContextRef.current && state.isPlaying) {
        const currentTime = audioContextRef.current.currentTime - audioStartTimeRef.current;
        setState(prev => ({ ...prev, currentTime }));
        onTimeUpdate?.(currentTime);
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };
    animationFrameRef.current = requestAnimationFrame(updateTime);

    setState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      duration: audioBuffer.duration,
    }));
  }, [audioBuffer, state.isPlaying, onTimeUpdate]);

  const pauseAudio = useCallback(() => {
    if (!audioContextRef.current || !audioSourceRef.current) return;

    audioPauseTimeRef.current = audioContextRef.current.currentTime - audioStartTimeRef.current;
    audioSourceRef.current.stop();
    audioSourceRef.current = null;
    audioContextRef.current.close();
    audioContextRef.current = null;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }));
  }, []);

  const stopAudio = useCallback(() => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    audioStartTimeRef.current = 0;
    audioPauseTimeRef.current = 0;

    setState(prev => ({
      ...prev,
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
    }));
  }, []);

  // Unified playback controls
  const stop = useCallback(() => {
    if (state.context === 'audio-original') {
      stopAudio();
    } else {
      midiPlayerRef.current?.stop();
    }
    setState(prev => ({ ...prev, context: null }));
  }, [state.context, stopAudio]);

  const play = useCallback(async (context: PlaybackContext, startTime: number = 0) => {
    // Stop any current playback
    stop();

    setState(prev => ({ ...prev, context }));

    switch (context) {
      case 'audio-original':
        if (audioBuffer) {
          playAudio(startTime);
        }
        break;

      case 'midi-original':
        if (originalMidi && midiPlayerRef.current) {
          await midiPlayerRef.current.loadMidi(originalMidi);
          await midiPlayerRef.current.play(startTime);
        }
        break;

      case 'transcription':
        if (transcribedNotes && transcribedNotes.length > 0) {
          // Convert transcribed notes to MIDI for playback
          const tempMidi = createMidiFromNotes(transcribedNotes);
          if (midiPlayerRef.current) {
            await midiPlayerRef.current.loadMidi(tempMidi);
            await midiPlayerRef.current.play(startTime);
          }
        }
        break;

      case 'edition':
        if (editedNotes && editedNotes.length > 0) {
          const tempMidi = createMidiFromNotes(editedNotes);
          if (midiPlayerRef.current) {
            await midiPlayerRef.current.loadMidi(tempMidi);
            await midiPlayerRef.current.play(startTime);
          }
        }
        break;

      case 'quantized':
        if (quantizedMidi && midiPlayerRef.current) {
          await midiPlayerRef.current.loadMidi(quantizedMidi);
          await midiPlayerRef.current.play(startTime);
        }
        break;

      case 'score':
        // Score playback is same as quantized or transcription
        if (quantizedMidi && midiPlayerRef.current) {
          await midiPlayerRef.current.loadMidi(quantizedMidi);
          await midiPlayerRef.current.play(startTime);
        }
        break;

      default:
        // Stage playback
        if (stageNotes && stageNotes[context] && midiPlayerRef.current) {
          const tempMidi = createMidiFromNotes(stageNotes[context]);
          await midiPlayerRef.current.loadMidi(tempMidi);
          await midiPlayerRef.current.play(startTime);
        }
        break;
    }
  }, [audioBuffer, originalMidi, quantizedMidi, transcribedNotes, editedNotes, stageNotes, playAudio, stop]);

  const pause = useCallback(() => {
    if (state.context === 'audio-original') {
      pauseAudio();
    } else {
      midiPlayerRef.current?.pause();
    }
  }, [state.context, pauseAudio]);

  const seek = useCallback((time: number) => {
    if (state.context === 'audio-original') {
      stopAudio();
      playAudio(time);
    } else {
      midiPlayerRef.current?.seek(time);
    }
  }, [state.context, playAudio, stopAudio]);

  const setLoop = useCallback((enabled: boolean, start?: number, end?: number) => {
    setState(prev => ({
      ...prev,
      loopEnabled: enabled,
      loopStart: start ?? prev.loopStart,
      loopEnd: end ?? prev.loopEnd,
    }));
    midiPlayerRef.current?.setLoop(enabled, start, end);
  }, []);

  const muteTrack = useCallback((trackIndex: number, muted: boolean) => {
    setState(prev => {
      const newMuted = new Set(prev.mutedTracks);
      if (muted) {
        newMuted.add(trackIndex);
      } else {
        newMuted.delete(trackIndex);
      }
      return { ...prev, mutedTracks: newMuted };
    });
    midiPlayerRef.current?.muteTrack(trackIndex, muted);
  }, []);

  const soloTrack = useCallback((trackIndex: number, solo: boolean) => {
    setState(prev => {
      const newSolo = new Set(prev.soloTracks);
      if (solo) {
        newSolo.add(trackIndex);
      } else {
        newSolo.delete(trackIndex);
      }
      return { ...prev, soloTracks: newSolo };
    });
    midiPlayerRef.current?.soloTrack(trackIndex, solo);
  }, []);

  const getState = useCallback(() => state, [state]);

  return {
    play,
    pause,
    stop,
    seek,
    setLoop,
    muteTrack,
    soloTrack,
    getState,
  };
}

// Helper function to create MIDI from transcribed notes
function createMidiFromNotes(notes: TranscribedNote[]): MidiFile {
  const midi = new Midi();
  const track = midi.addTrack();
  track.name = 'Transcription';

  for (const note of notes) {
    track.addNote({
      midi: note.midiNote,
      time: note.startTime,
      duration: Math.max(0.01, note.endTime - note.startTime),
      velocity: note.velocity,
    });
  }

  // Convert to binary format
  const binaryData = midi.toArray();
  const buffer = new ArrayBuffer(binaryData.length);
  const view = new Uint8Array(buffer);
  view.set(binaryData);
  return parseMidiBinary(buffer);
}
