/**
 * QUANTIZE.IT - MIDI Playback Engine
 * 
 * Reproductor MIDI basado en Tone.js
 * Permite reproducción, pausa, stop, seek, solo/mute, loop
 * Sincroniza cursor visual y gestiona notas sostenidas
 */

import * as Tone from 'tone';
import type { MidiFile, ParsedNote } from './midi-types';
import { extractNotes } from './binary-midi';

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number; // segundos
  duration: number; // segundos
  bpm: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  mutedTracks: Set<number>;
  soloTracks: Set<number>;
}

export interface PlaybackCallbacks {
  onTimeUpdate?: (time: number) => void;
  onStateChange?: (state: PlaybackState) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

interface NoteWithTrack extends ParsedNote {
  trackIndex: number;
}

export class MidiPlayer {
  private synth: Tone.PolySynth | null = null;
  private midi: MidiFile | null = null;
  private notes: NoteWithTrack[] = [];
  private scheduledEvents: number[] = [];
  private state: PlaybackState;
  private callbacks: PlaybackCallbacks;
  private animationFrame: number | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;

  constructor(callbacks: PlaybackCallbacks = {}) {
    this.callbacks = callbacks;
    this.state = {
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      duration: 0,
      bpm: 120,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      mutedTracks: new Set(),
      soloTracks: new Set(),
    };
  }

  /**
   * Carga un archivo MIDI para reproducción
   */
  async loadMidi(midi: MidiFile): Promise<void> {
    try {
      // Limpiar estado anterior
      this.stop();
      this.notes = [];
      this.scheduledEvents = [];

      this.midi = midi;

      // Extraer todas las notas de todas las pistas
      for (let i = 0; i < midi.tracks.length; i++) {
        const trackNotes = extractNotes(midi.tracks[i]);
        // Marcar cada nota con su trackIndex
        trackNotes.forEach(note => {
          this.notes.push({ ...note, trackIndex: i });
        });
      }

      // Calcular duración total
      if (this.notes.length > 0) {
        const lastNote = this.notes.reduce((max, note) => 
          note.endTick > max.endTick ? note : max
        );
        
        // Convertir ticks a segundos usando tempo
        const ticksPerBeat = midi.header.ticksPerBeat;
        const tempo = 120; // TODO: extraer del MIDI
        const secondsPerTick = 60 / (tempo * ticksPerBeat);
        
        this.state.duration = lastNote.endTick * secondsPerTick;
        this.state.bpm = tempo;
      }

      // Inicializar sintetizador si no existe
      if (!this.synth) {
        await this.initSynth();
      }

      this.updateState();
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Error loading MIDI'));
    }
  }

  /**
   * Inicializa el sintetizador
   */
  private async initSynth(): Promise<void> {
    try {
      // Usar PolySynth para múltiples notas simultáneas
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: 'triangle'
        },
        envelope: {
          attack: 0.02,
          decay: 0.1,
          sustain: 0.3,
          release: 0.5
        }
      }).toDestination();

      // Limitar volumen para evitar clipping
      this.synth.volume.value = -6;

      await Tone.start();
    } catch (error) {
      throw new Error('No se pudo inicializar el sintetizador. Verifica que el navegador soporta Web Audio API.');
    }
  }

  /**
   * Inicia la reproducción
   */
  async play(fromTime?: number): Promise<void> {
    if (!this.midi || !this.synth) {
      throw new Error('No hay MIDI cargado');
    }

    try {
      await Tone.start();

      const startFrom = fromTime ?? (this.state.isPaused ? this.pauseTime : 0);
      
      this.state.isPlaying = true;
      this.state.isPaused = false;
      this.state.currentTime = startFrom;
      this.startTime = Tone.now() - startFrom;

      // Programar todas las notas
      this.scheduleNotes(startFrom);

      // Iniciar actualización de tiempo
      this.startAnimationLoop();

      this.updateState();
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Error starting playback'));
    }
  }

  /**
   * Programa las notas para reproducción
   */
  private scheduleNotes(fromTime: number): void {
    if (!this.synth) return;

    // Limpiar eventos anteriores
    this.scheduledEvents.forEach(id => Tone.getTransport().clear(id));
    this.scheduledEvents = [];

    const ticksPerBeat = this.midi!.header.ticksPerBeat;
    const secondsPerTick = 60 / (this.state.bpm * ticksPerBeat);

    // Filtrar notas según mute/solo
    const filteredNotes = this.notes.filter(note => {
      const trackIndex = note.trackIndex;
      
      // Si hay pistas en solo, solo reproducir esas
      if (this.state.soloTracks.size > 0) {
        return this.state.soloTracks.has(trackIndex);
      }
      
      // Si no, reproducir todas excepto las muteadas
      return !this.state.mutedTracks.has(trackIndex);
    });

    // Programar cada nota
    filteredNotes.forEach(note => {
      const noteStartTime = note.startTick * secondsPerTick;
      const noteDuration = (note.endTick - note.startTick) * secondsPerTick;

      // Solo programar notas después del tiempo de inicio
      if (noteStartTime >= fromTime) {
        const relativeTime = noteStartTime - fromTime;

        const eventId = Tone.getTransport().schedule((time: number) => {
          if (this.synth && this.state.isPlaying) {
            const midiNote = note.noteNumber;
            const frequency = Tone.Frequency(midiNote, 'midi').toFrequency();
            
            this.synth!.triggerAttackRelease(
              frequency,
              noteDuration,
              time,
              note.velocity / 127 // Normalizar velocidad a 0-1
            );
          }
        }, relativeTime);

        this.scheduledEvents.push(eventId);
      }
    });

    // Programar fin de reproducción
    const endEventId = Tone.getTransport().schedule(() => {
      if (this.state.loop && this.state.loopEnd > 0) {
        this.play(this.state.loopStart);
      } else {
        this.stop();
        this.callbacks.onEnd?.();
      }
    }, this.state.duration - fromTime);

    this.scheduledEvents.push(endEventId);

    Tone.getTransport().start();
  }

  /**
   * Pausa la reproducción
   */
  pause(): void {
    if (!this.state.isPlaying) return;

    this.pauseTime = this.state.currentTime;
    this.state.isPlaying = false;
    this.state.isPaused = true;

    // Detener transporte
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    // Silenciar notas activas
    this.synth?.releaseAll();

    // Detener animación
    this.stopAnimationLoop();

    this.updateState();
  }

  /**
   * Detiene la reproducción completamente
   */
  stop(): void {
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.currentTime = 0;
    this.pauseTime = 0;

    // Detener transporte
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    // Silenciar todas las notas
    this.synth?.releaseAll();

    // Limpiar eventos
    this.scheduledEvents.forEach(id => Tone.getTransport().clear(id));
    this.scheduledEvents = [];

    // Detener animación
    this.stopAnimationLoop();

    this.updateState();
  }

  /**
   * Salta a un tiempo específico
   */
  seek(time: number): void {
    const wasPlaying = this.state.isPlaying;
    
    if (wasPlaying) {
      this.stop();
    }

    this.state.currentTime = Math.max(0, Math.min(time, this.state.duration));
    this.pauseTime = this.state.currentTime;

    if (wasPlaying) {
      this.play(this.state.currentTime);
    } else {
      this.updateState();
    }
  }

  /**
   * Activa/desactiva loop
   */
  setLoop(enabled: boolean, start?: number, end?: number): void {
    this.state.loop = enabled;
    if (start !== undefined) this.state.loopStart = start;
    if (end !== undefined) this.state.loopEnd = end;
    this.updateState();
  }

  /**
   * Silencia una pista
   */
  muteTrack(trackIndex: number, muted: boolean): void {
    if (muted) {
      this.state.mutedTracks.add(trackIndex);
    } else {
      this.state.mutedTracks.delete(trackIndex);
    }

    // Si está reproduciendo, reprogramar notas
    if (this.state.isPlaying) {
      const currentTime = this.state.currentTime;
      this.stop();
      this.play(currentTime);
    } else {
      this.updateState();
    }
  }

  /**
   * Activa/desactiva solo para una pista
   */
  soloTrack(trackIndex: number, solo: boolean): void {
    if (solo) {
      this.state.soloTracks.add(trackIndex);
    } else {
      this.state.soloTracks.delete(trackIndex);
    }

    // Si está reproduciendo, reprogramar notas
    if (this.state.isPlaying) {
      const currentTime = this.state.currentTime;
      this.stop();
      this.play(currentTime);
    } else {
      this.updateState();
    }
  }

  /**
   * Obtiene el estado actual
   */
  getState(): PlaybackState {
    return { ...this.state };
  }

  /**
   * Loop de actualización de tiempo
   */
  private startAnimationLoop(): void {
    const update = () => {
      if (this.state.isPlaying) {
        this.state.currentTime = Tone.now() - this.startTime;
        
        // Verificar si llegamos al final del loop
        if (this.state.loop && this.state.loopEnd > 0 && this.state.currentTime >= this.state.loopEnd) {
          this.seek(this.state.loopStart);
        }

        this.callbacks.onTimeUpdate?.(this.state.currentTime);
        this.animationFrame = requestAnimationFrame(update);
      }
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  /**
   * Detiene el loop de actualización
   */
  private stopAnimationLoop(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Actualiza el estado y notifica callbacks
   */
  private updateState(): void {
    this.callbacks.onStateChange?.({ ...this.state });
  }

  /**
   * Limpia recursos
   */
  dispose(): void {
    this.stop();
    this.synth?.dispose();
    this.synth = null;
    this.midi = null;
    this.notes = [];
  }
}
