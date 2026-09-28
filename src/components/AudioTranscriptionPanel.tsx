/**
 * QUANTIZE.IT - Audio Transcription Panel
 * 
 * Integrates CAPA 1-5:
 * - Audio import (WAV/MP3/FLAC)
 * - Monophonic transcription
 * - Piano roll editor (basic)
 * - MIDI export from transcription
 * - MusicXML export
 * 
 * CAPA 6 (MuseScore/PDF) is explicitly disabled with explanation.
 */

import { useState, useCallback, useRef } from 'react';
import { Music, FileAudio, Download, AlertTriangle, Info, Wand2, FileCode } from 'lucide-react';
import { AudioLoader } from './AudioLoader';
import {
  type AudioFileInfo,
  type WaveformData,
} from '../utils/audio-import';
import {
  transcribeMonophonic,
  validateTranscription,
  type TranscribedNote,
  type TranscriptionResult,
  type TranscriptionParams,
} from '../utils/transcription';
import {
  generateMusicXmlBlob,
  validateMusicXml,
  type MusicXmlParams,
} from '../utils/musicxml';
import { Midi } from '@tonejs/midi';

interface AudioTranscriptionPanelProps {
  onStatusChange?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function AudioTranscriptionPanel({ onStatusChange }: AudioTranscriptionPanelProps) {
  // Audio state
  const [audioInfo, setAudioInfo] = useState<AudioFileInfo | null>(null);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [selectionStart, setSelectionStart] = useState<number | undefined>(undefined);
  const [selectionEnd, setSelectionEnd] = useState<number | undefined>(undefined);

  // Transcription state
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [editedNotes, setEditedNotes] = useState<TranscribedNote[] | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Transcription params
  const [transcriptionParams, setTranscriptionParams] = useState<TranscriptionParams>({
    minFrequency: 150,
    maxFrequency: 1500,
    minDuration: 0.08,
    confidenceThreshold: 0.65,
    targetInstrument: 'clarinet',
  });

  // MusicXML params
  const [musicXmlParams, setMusicXmlParams] = useState<MusicXmlParams>({
    title: '',
    timeSignature: [4, 4],
    keySignature: 0,
    transposition: 0,
    instrument: 'Clarinet',
  });

  // Piano roll state (basic)
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);

  const handleAudioLoad = useCallback((info: AudioFileInfo, waveform: WaveformData, buffer: AudioBuffer) => {
    setAudioInfo(info);
    setWaveformData(waveform);
    setAudioBuffer(buffer);
    setTranscription(null);
    setEditedNotes(null);
    setSelectionStart(undefined);
    setSelectionEnd(undefined);
    onStatusChange?.(`Audio loaded: ${info.format.toUpperCase()}, ${info.duration.toFixed(1)}s`, 'success');
  }, [onStatusChange]);

  const handleAudioClear = useCallback(() => {
    setAudioInfo(null);
    setWaveformData(null);
    setAudioBuffer(null);
    setTranscription(null);
    setEditedNotes(null);
    setSelectedNoteIndex(null);
  }, []);

  const handleSelectionChange = useCallback((start: number, end: number) => {
    setSelectionStart(start);
    setSelectionEnd(end);
  }, []);

  const handleTranscribe = useCallback(() => {
    if (!audioBuffer) return;

    setIsTranscribing(true);
    try {
      const result = transcribeMonophonic(
        audioBuffer,
        transcriptionParams,
        selectionStart || 0,
        selectionEnd
      );

      setTranscription(result);
      setEditedNotes([...result.notes]);

      const validation = validateTranscription(result);
      
      if (validation.warnings.length > 0) {
        onStatusChange?.(
          `Transcription complete: ${result.notes.length} notes (${result.processingTimeMs.toFixed(0)}ms). ${validation.warnings.length} warnings.`,
          validation.warnings.length > 2 ? 'info' : 'success'
        );
      } else {
        onStatusChange?.(
          `Transcription complete: ${result.notes.length} notes in ${result.processingTimeMs.toFixed(0)}ms`,
          'success'
        );
      }
    } catch (error) {
      onStatusChange?.(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsTranscribing(false);
    }
  }, [audioBuffer, transcriptionParams, selectionStart, selectionEnd, onStatusChange]);

  const handleNoteEdit = useCallback((index: number, field: keyof TranscribedNote, value: any) => {
    if (!editedNotes) return;
    const updated = [...editedNotes];
    updated[index] = { ...updated[index], [field]: value, source: 'user' };
    setEditedNotes(updated);
  }, [editedNotes]);

  const handleDeleteNote = useCallback((index: number) => {
    if (!editedNotes) return;
    const updated = editedNotes.filter((_, i) => i !== index);
    setEditedNotes(updated);
  }, [editedNotes]);

  const handleExportTranscriptionMidi = useCallback(() => {
    if (!editedNotes || editedNotes.length === 0) {
      onStatusChange?.('No notes to export', 'error');
      return;
    }

    try {
      const midi = new Midi();
      const track = midi.addTrack();
      track.name = musicXmlParams.instrument || 'Transcription';

      for (const note of editedNotes) {
        track.addNote({
          midi: note.midiNote,
          time: note.startTime,
          duration: Math.max(0.01, note.endTime - note.startTime),
          velocity: note.velocity,
        });
      }

      const blob = new Blob([new Uint8Array(midi.toArray())], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transcription_${audioInfo?.name || 'audio'}.mid`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);

      onStatusChange?.('Transcription MIDI downloaded', 'success');
    } catch (error) {
      onStatusChange?.(`MIDI export failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [editedNotes, audioInfo, musicXmlParams, onStatusChange]);

  const handleExportMusicXml = useCallback(() => {
    if (!editedNotes || editedNotes.length === 0) {
      onStatusChange?.('No notes to export', 'error');
      return;
    }

    try {
      const blob = generateMusicXmlBlob(editedNotes, {
        ...musicXmlParams,
        title: musicXmlParams.title || audioInfo?.name || 'Transcription',
      });

      const xml = blob.text ? blob.text() : Promise.resolve('');
      xml.then(text => {
        const validation = validateMusicXml(text);
        if (!validation.valid) {
          onStatusChange?.(`MusicXML validation issues: ${validation.errors.join(', ')}`, 'info');
        }
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transcription_${audioInfo?.name || 'audio'}.musicxml`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);

      onStatusChange?.('MusicXML downloaded (open in MuseScore)', 'success');
    } catch (error) {
      onStatusChange?.(`MusicXML export failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [editedNotes, audioInfo, musicXmlParams, onStatusChange]);

  return (
    <div className="bg-gray-800/30 rounded-xl border border-purple-500/20 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Music className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-white">Audio → MIDI Transcription</h2>
        <span className="ml-auto text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
          CAPA 1-5
        </span>
      </div>

      {/* Step 1: Audio Import */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">1. Load Audio</h3>
        <AudioLoader
          audioInfo={audioInfo}
          waveformData={waveformData}
          onAudioLoad={handleAudioLoad}
          onAudioClear={handleAudioClear}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          onSelectionChange={handleSelectionChange}
        />
      </div>

      {audioInfo && (
        <>
          {/* Step 2: Transcription Parameters */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">2. Transcription Settings</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <label className="text-xs text-gray-400">Instrument</label>
                <select
                  value={transcriptionParams.targetInstrument}
                  onChange={(e) => setTranscriptionParams(p => ({ ...p, targetInstrument: e.target.value }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                >
                  <option value="clarinet">Clarinet</option>
                  <option value="flute">Flute</option>
                  <option value="voice">Voice</option>
                  <option value="generic">Generic</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Min Freq (Hz)</label>
                <input
                  type="number"
                  value={transcriptionParams.minFrequency}
                  onChange={(e) => setTranscriptionParams(p => ({ ...p, minFrequency: Number(e.target.value) }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Max Freq (Hz)</label>
                <input
                  type="number"
                  value={transcriptionParams.maxFrequency}
                  onChange={(e) => setTranscriptionParams(p => ({ ...p, maxFrequency: Number(e.target.value) }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Min Duration (s)</label>
                <input
                  type="number"
                  step="0.01"
                  value={transcriptionParams.minDuration}
                  onChange={(e) => setTranscriptionParams(p => ({ ...p, minDuration: Number(e.target.value) }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Confidence</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={transcriptionParams.confidenceThreshold}
                  onChange={(e) => setTranscriptionParams(p => ({ ...p, confidenceThreshold: Number(e.target.value) }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
            </div>
            <button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="mt-3 w-full py-2 px-4 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Wand2 className="w-4 h-4" />
              {isTranscribing ? 'Transcribing...' : 'Transcribe to Notes'}
            </button>
          </div>

          {/* Step 3: Editor */}
          {editedNotes && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                3. Edit Notes ({editedNotes.length} notes)
                <span className="ml-2 text-xs text-gray-500">
                  {editedNotes.filter(n => n.source === 'user').length} edited by user
                </span>
              </h3>

              {transcription?.warnings && transcription.warnings.length > 0 && (
                <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-300">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  {transcription.warnings.slice(0, 3).join(' • ')}
                </div>
              )}

              <div className="max-h-48 overflow-y-auto bg-gray-800/50 rounded-lg border border-gray-700/50">
                {editedNotes.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No notes detected. Adjust parameters and try again.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-700/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left text-gray-400">#</th>
                        <th className="px-2 py-1 text-left text-gray-400">Pitch</th>
                        <th className="px-2 py-1 text-left text-gray-400">Start</th>
                        <th className="px-2 py-1 text-left text-gray-400">End</th>
                        <th className="px-2 py-1 text-left text-gray-400">Conf.</th>
                        <th className="px-2 py-1 text-left text-gray-400">Source</th>
                        <th className="px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedNotes.map((note, i) => (
                        <tr
                          key={i}
                          className={`border-t border-gray-700/30 ${
                            note.source === 'user' ? 'bg-blue-500/5' : ''
                          } ${note.isDoubtful ? 'bg-yellow-500/5' : ''}`}
                        >
                          <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={note.midiNote}
                              onChange={(e) => handleNoteEdit(i, 'midiNote', Number(e.target.value))}
                              className="w-14 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-white"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={note.startTime.toFixed(2)}
                              onChange={(e) => handleNoteEdit(i, 'startTime', Number(e.target.value))}
                              className="w-16 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-white"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={note.endTime.toFixed(2)}
                              onChange={(e) => handleNoteEdit(i, 'endTime', Number(e.target.value))}
                              className="w-16 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-white"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <span className={`${note.confidence < 0.7 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {(note.confidence * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              note.source === 'user'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-gray-700 text-gray-400'
                            }`}>
                              {note.source === 'user' ? 'edited' : 'model'}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => handleDeleteNote(i)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Export */}
          {editedNotes && editedNotes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">4. Export</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={handleExportTranscriptionMidi}
                  className="flex items-center justify-center gap-2 py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  MIDI (transcription)
                </button>

                <button
                  onClick={handleExportMusicXml}
                  className="flex items-center justify-center gap-2 py-2 px-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 rounded-lg text-sm transition-colors"
                >
                  <FileCode className="w-4 h-4" />
                  MusicXML (.musicxml)
                </button>

                {/* CAPA 6: MuseScore/PDF - Disabled with explanation */}
                <button
                  disabled
                  className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-700/30 border border-gray-600/30 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                  title="Requires server-side MuseScore/PDF generation infrastructure"
                >
                  <FileAudio className="w-4 h-4" />
                  MSCZ / PDF
                  <Info className="w-3 h-3 ml-1" />
                </button>
              </div>

              <div className="mt-2 text-xs text-gray-500 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>MSCZ/PDF:</strong> Native MuseScore and PDF generation requires server-side infrastructure not available in this browser environment. 
                  Open the MusicXML file in MuseScore to generate these formats locally.
                </span>
              </div>

              {/* MusicXML params */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-xs text-gray-400">Title</label>
                  <input
                    type="text"
                    value={musicXmlParams.title}
                    onChange={(e) => setMusicXmlParams(p => ({ ...p, title: e.target.value }))}
                    placeholder="Untitled"
                    className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Time Sig</label>
                  <select
                    value={`${musicXmlParams.timeSignature?.[0]}/${musicXmlParams.timeSignature?.[1]}`}
                    onChange={(e) => {
                      const [n, d] = e.target.value.split('/').map(Number);
                      setMusicXmlParams(p => ({ ...p, timeSignature: [n, d] }));
                    }}
                    className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="2/4">2/4</option>
                    <option value="6/8">6/8</option>
                    <option value="3/8">3/8</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Transposition</label>
                  <select
                    value={musicXmlParams.transposition}
                    onChange={(e) => setMusicXmlParams(p => ({ ...p, transposition: Number(e.target.value) }))}
                    className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  >
                    <option value="0">Concert pitch (C)</option>
                    <option value="-2">Bb (clarinet, trumpet)</option>
                    <option value="-3">A (clarinet)</option>
                    <option value="-7">F (cor anglais)</option>
                    <option value="2">D (trumpet)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Instrument</label>
                  <input
                    type="text"
                    value={musicXmlParams.instrument}
                    onChange={(e) => setMusicXmlParams(p => ({ ...p, instrument: e.target.value }))}
                    className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
