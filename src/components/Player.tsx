/**
 * QUANTIZE.IT - MIDI Player Component
 * 
 * Reproductor completo con:
 * - Play/Pause/Stop/Seek
 * - A/B original vs cuantizado
 * - Solo/Mute por pista
 * - Loop de fragmentos
 * - Indicadores de tiempo/compás
 * - Sincronización visual
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Repeat, Volume2, VolumeX } from 'lucide-react';
import { MidiPlayer, type PlaybackState } from '../utils/midi-player';
import type { MidiFile } from '../utils/midi-types';

interface PlayerProps {
  originalMidi: MidiFile | null;
  quantizedMidi: MidiFile | null;
  audioBuffer?: AudioBuffer | null;
  trackNames?: string[];
}

export function Player({ originalMidi, quantizedMidi, audioBuffer, trackNames = [] }: PlayerProps) {
  const [player, setPlayer] = useState<MidiPlayer | null>(null);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [mode, setMode] = useState<'original' | 'quantized' | 'audio'>('original');
  const [currentTime, setCurrentTime] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [mutedTracks, setMutedTracks] = useState<Set<number>>(new Set());
  const [soloTracks, setSoloTracks] = useState<Set<number>>(new Set());
  
  const progressRef = useRef<HTMLDivElement>(null);

  // Inicializar reproductor
  useEffect(() => {
    const newPlayer = new MidiPlayer({
      onTimeUpdate: (time) => {
        setCurrentTime(time);
      },
      onStateChange: (newState) => {
        setState(newState);
      },
      onEnd: () => {
        setCurrentTime(0);
      },
      onError: (error) => {
        console.error('Player error:', error);
      }
    });

    setPlayer(newPlayer);

    return () => {
      newPlayer.dispose();
    };
  }, []);

  // Cargar MIDI cuando cambie el modo
  useEffect(() => {
    if (!player) return;

    if (mode === 'original' && originalMidi) {
      player.loadMidi(originalMidi);
    } else if (mode === 'quantized' && quantizedMidi) {
      player.loadMidi(quantizedMidi);
    }
  }, [player, mode, originalMidi, quantizedMidi]);

  // Controles de reproducción
  const handlePlay = useCallback(async () => {
    if (!player) return;
    
    if (state?.isPaused) {
      await player.play();
    } else {
      await player.play(currentTime);
    }
  }, [player, state, currentTime]);

  const handlePause = useCallback(() => {
    player?.pause();
  }, [player]);

  const handleStop = useCallback(() => {
    player?.stop();
    setCurrentTime(0);
  }, [player]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !state) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * state.duration;

    player?.seek(time);
    setCurrentTime(time);
  }, [player, state]);

  const handleLoopToggle = useCallback(() => {
    const newLoopState = !isLooping;
    setIsLooping(newLoopState);
    
    if (newLoopState && state) {
      // Loop de un compás (4 segundos por defecto)
      const barDuration = 60 / state.bpm * 4; // 4/4 time
      const currentBar = Math.floor(currentTime / barDuration);
      const start = currentBar * barDuration;
      const end = start + barDuration;
      
      setLoopStart(start);
      setLoopEnd(end);
      player?.setLoop(true, start, end);
    } else {
      player?.setLoop(false);
    }
  }, [player, isLooping, currentTime, state]);

  const handleMuteTrack = useCallback((trackIndex: number) => {
    if (!player) return;

    const newMuted = new Set(mutedTracks);
    if (newMuted.has(trackIndex)) {
      newMuted.delete(trackIndex);
    } else {
      newMuted.add(trackIndex);
    }

    setMutedTracks(newMuted);
    player.muteTrack(trackIndex, newMuted.has(trackIndex));
  }, [player, mutedTracks]);

  const handleSoloTrack = useCallback((trackIndex: number) => {
    if (!player) return;

    const newSolo = new Set(soloTracks);
    if (newSolo.has(trackIndex)) {
      newSolo.delete(trackIndex);
    } else {
      newSolo.add(trackIndex);
    }

    setSoloTracks(newSolo);
    player.soloTrack(trackIndex, newSolo.has(trackIndex));
  }, [player, soloTracks]);

  // Formatear tiempo
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Calcular compás actual
  const getCurrentBar = (): number => {
    if (!state) return 1;
    const barDuration = 60 / state.bpm * 4; // 4/4 time
    return Math.floor(currentTime / barDuration) + 1;
  };

  // Calcular pulso actual
  const getCurrentBeat = (): number => {
    if (!state) return 1;
    const barDuration = 60 / state.bpm * 4;
    const timeInBar = currentTime % barDuration;
    const beatDuration = barDuration / 4;
    return Math.floor(timeInBar / beatDuration) + 1;
  };

  if (!originalMidi && !quantizedMidi && !audioBuffer) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-6 text-center text-gray-400">
        No hay archivo para reproducir
      </div>
    );
  }

  const progress = state ? (currentTime / state.duration) * 100 : 0;

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
      {/* Selector de modo A/B */}
      <div className="flex gap-2">
        {originalMidi && (
          <button
            onClick={() => setMode('original')}
            className={`px-4 py-2 rounded ${
              mode === 'original'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Original
          </button>
        )}
        {quantizedMidi && (
          <button
            onClick={() => setMode('quantized')}
            className={`px-4 py-2 rounded ${
              mode === 'quantized'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Cuantizado
          </button>
        )}
        {audioBuffer && (
          <button
            onClick={() => setMode('audio')}
            className={`px-4 py-2 rounded ${
              mode === 'audio'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Audio
          </button>
        )}
      </div>

      {/* Controles principales */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleStop}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
          title="Stop"
        >
          <Square className="w-5 h-5" />
        </button>

        {state?.isPlaying ? (
          <button
            onClick={handlePause}
            className="p-2 bg-blue-600 hover:bg-blue-500 rounded"
            title="Pause"
          >
            <Pause className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="p-2 bg-blue-600 hover:bg-blue-500 rounded"
            title="Play"
          >
            <Play className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={handleLoopToggle}
          className={`p-2 rounded ${
            isLooping ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title="Loop current bar"
        >
          <Repeat className="w-5 h-5" />
        </button>

        {/* Barra de progreso */}
        <div
          ref={progressRef}
          className="flex-1 h-2 bg-gray-700 rounded cursor-pointer relative"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-blue-500 rounded"
            style={{ width: `${progress}%` }}
          />
          {isLooping && (
            <div
              className="absolute h-full bg-yellow-500/30 rounded"
              style={{
                left: `${(loopStart / (state?.duration || 1)) * 100}%`,
                width: `${((loopEnd - loopStart) / (state?.duration || 1)) * 100}%`
              }}
            />
          )}
        </div>

        {/* Tiempo */}
        <div className="text-sm font-mono text-gray-300 min-w-[100px]">
          {formatTime(currentTime)} / {state ? formatTime(state.duration) : '0:00.00'}
        </div>
      </div>

      {/* Información de compás y pulso */}
      {state && (
        <div className="flex gap-4 text-sm text-gray-400">
          <div>
            Compás: <span className="text-white font-mono">{getCurrentBar()}</span>
          </div>
          <div>
            Pulso: <span className="text-white font-mono">{getCurrentBeat()}</span>
          </div>
          <div>
            BPM: <span className="text-white font-mono">{state.bpm}</span>
          </div>
        </div>
      )}

      {/* Controles de pistas */}
      {trackNames.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-400">Pistas:</div>
          <div className="grid grid-cols-2 gap-2">
            {trackNames.map((name, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-gray-700/50 rounded p-2"
              >
                <span className="flex-1 text-sm truncate">{name}</span>
                <button
                  onClick={() => handleMuteTrack(index)}
                  className={`p-1 rounded ${
                    mutedTracks.has(index)
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                  title={mutedTracks.has(index) ? 'Unmute' : 'Mute'}
                >
                  {mutedTracks.has(index) ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleSoloTrack(index)}
                  className={`px-2 py-1 rounded text-xs ${
                    soloTracks.has(index)
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                  title={soloTracks.has(index) ? 'Unsolo' : 'Solo'}
                >
                  S
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advertencia sobre limitaciones sonoras */}
      <div className="text-xs text-gray-500 italic">
        Nota: La reproducción usa un sintetizador básico. El sonido puede diferir del instrumento original.
        Para evaluación acústica definitiva, exporta el MIDI y ábrelo en un DAW o notación musical.
      </div>
    </div>
  );
}
