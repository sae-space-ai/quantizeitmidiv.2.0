/**
 * QUANTIZE.IT - Spectral Analysis Panel
 * 
 * Integrates spectral analysis with the 4 musical stages:
 * - Visual spectrogram with note overlay
 * - Timbre analysis for instrument identification
 * - Tessitura analysis for range validation
 * - Suggestions for each musical stage
 * - Full traceability of spectral evidence
 * 
 * IMPORTANT: This provides EVIDENCE to support musical decisions.
 * It does NOT make automatic corrections.
 */

import { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, Info, Music } from 'lucide-react';
import type { TranscribedNote } from '../utils/transcription-enhanced';
import { generateSpectrogram, type SpectrogramData } from '../utils/spectral-analysis';
import { SpectrogramView } from './SpectrogramView';
import {
  analyzeTimbre,
  analyzeTessitura,
  generateSpectralSuggestions,
  type TimbreAnalysis,
  type TessituraAnalysis,
  type SpectralSuggestion,
} from '../utils/timbre-analysis';

interface SpectralAnalysisPanelProps {
  audioBuffer: AudioBuffer | null;
  notes: TranscribedNote[] | null;
  trackIndex?: number;
  trackName?: string;
  onStatusChange?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function SpectralAnalysisPanel({
  audioBuffer,
  notes,
  trackIndex = 0,
  trackName = 'Track',
  onStatusChange,
}: SpectralAnalysisPanelProps) {
  const [spectrogram, setSpectrogram] = useState<SpectrogramData | null>(null);
  const [timbreAnalyses, setTimbreAnalyses] = useState<TimbreAnalysis[]>([]);
  const [tessituraAnalysis, setTessituraAnalysis] = useState<TessituraAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<SpectralSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectionStart, setSelectionStart] = useState<number | undefined>();
  const [selectionEnd, setSelectionEnd] = useState<number | undefined>();

  // Generate spectrogram when audio loads
  useEffect(() => {
    if (!audioBuffer) {
      setSpectrogram(null);
      return;
    }

    setIsAnalyzing(true);
    try {
      const spec = generateSpectrogram(audioBuffer, {
        fftSize: 2048,
        hopSize: 512,
      });
      setSpectrogram(spec);
      onStatusChange?.('Spectrogram generated', 'success');
    } catch (error) {
      onStatusChange?.(`Failed to generate spectrogram: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [audioBuffer, onStatusChange]);

  // Analyze timbre and tessitura when notes change
  useEffect(() => {
    if (!audioBuffer || !notes || !spectrogram) {
      setTimbreAnalyses([]);
      setTessituraAnalysis(null);
      setSuggestions([]);
      return;
    }

    setIsAnalyzing(true);
    try {
      // Timbre analysis
      const timbre = analyzeTimbre(audioBuffer, notes, spectrogram);
      setTimbreAnalyses(timbre);

      // Determine most common proposed family
      const familyCounts = new Map<string, number>();
      for (const analysis of timbre) {
        if (analysis.proposedFamily) {
          familyCounts.set(analysis.proposedFamily, (familyCounts.get(analysis.proposedFamily) || 0) + 1);
        }
      }
      
      let mostCommonFamily: string | undefined;
      let maxCount = 0;
      for (const [family, count] of familyCounts) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonFamily = family;
        }
      }

      // Tessitura analysis
      const tessitura = analyzeTessitura(notes, trackIndex, trackName, mostCommonFamily);
      setTessituraAnalysis(tessitura);

      // Generate suggestions for all stages
      const allSuggestions = [
        ...generateSpectralSuggestions(timbre, tessitura, 'rhythmic-base'),
        ...generateSpectralSuggestions(timbre, tessitura, 'harmonic-base'),
        ...generateSpectralSuggestions(timbre, tessitura, 'strings-woodwinds'),
        ...generateSpectralSuggestions(timbre, tessitura, 'brass'),
      ];
      setSuggestions(allSuggestions);

      onStatusChange?.(`Spectral analysis complete: ${timbre.length} notes analyzed`, 'success');
    } catch (error) {
      onStatusChange?.(`Spectral analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [audioBuffer, notes, spectrogram, trackIndex, trackName, onStatusChange]);

  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSelectionChange = useCallback((start: number, end: number) => {
    setSelectionStart(start);
    setSelectionEnd(end);
  }, []);

  if (!audioBuffer) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 text-center">
        <Activity className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">Load audio to enable spectral analysis</p>
      </div>
    );
  }

  const warningCount = suggestions.filter(s => s.severity === 'warning').length;
  const infoCount = suggestions.filter(s => s.severity === 'info').length;

  return (
    <div className="bg-gray-800/30 rounded-xl border border-cyan-500/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Spectral Analysis</h2>
        </div>
        {isAnalyzing && (
          <div className="text-sm text-cyan-400">Analyzing...</div>
        )}
      </div>

      {/* Spectrogram visualization */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">Spectrogram</h3>
        <SpectrogramView
          spectrogram={spectrogram}
          notes={notes || []}
          currentTime={currentTime}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          onTimeChange={handleTimeChange}
          onSelectionChange={handleSelectionChange}
          height={250}
        />
      </div>

      {/* Summary statistics */}
      {tessituraAnalysis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-gray-700/30 rounded p-2 text-center">
            <div className="text-lg font-bold text-white">{notes?.length || 0}</div>
            <div className="text-xs text-gray-400">Notes</div>
          </div>
          <div className="bg-gray-700/30 rounded p-2 text-center">
            <div className="text-lg font-bold text-cyan-400">
              {tessituraAnalysis.detectedMin > 0 ? tessituraAnalysis.detectedMin : '-'}
            </div>
            <div className="text-xs text-gray-400">Min MIDI</div>
          </div>
          <div className="bg-gray-700/30 rounded p-2 text-center">
            <div className="text-lg font-bold text-cyan-400">
              {tessituraAnalysis.detectedMax > 0 ? tessituraAnalysis.detectedMax : '-'}
            </div>
            <div className="text-xs text-gray-400">Max MIDI</div>
          </div>
          <div className="bg-gray-700/30 rounded p-2 text-center">
            <div className="text-lg font-bold text-yellow-400">{warningCount}</div>
            <div className="text-xs text-gray-400">Warnings</div>
          </div>
        </div>
      )}

      {/* Tessitura warnings */}
      {tessituraAnalysis && tessituraAnalysis.warnings.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-yellow-300">Tessitura Warnings</span>
          </div>
          <ul className="text-xs text-gray-300 space-y-1">
            {tessituraAnalysis.warnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Spectral suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Spectral Suggestions ({suggestions.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {suggestions.slice(0, 10).map((suggestion) => (
              <SpectralSuggestionItem key={suggestion.id} suggestion={suggestion} />
            ))}
            {suggestions.length > 10 && (
              <div className="text-xs text-gray-500 text-center">
                +{suggestions.length - 10} more suggestions
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timbre analysis summary */}
      {timbreAnalyses.length > 0 && (
        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Music className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-white">Timbre Analysis</span>
          </div>
          <div className="text-xs text-gray-400">
            {timbreAnalyses.filter(a => a.proposedFamily).length} / {timbreAnalyses.length} notes have proposed instrument family
          </div>
          <div className="text-xs text-gray-400">
            {timbreAnalyses.filter(a => a.isDoubtful).length} notes marked as doubtful
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-gray-500 italic">
        Spectral analysis provides evidence to support musical decisions. Different instruments can produce similar spectra.
        Always review suggestions and mark uncertain cases as "instrument to be confirmed".
      </div>
    </div>
  );
}

function SpectralSuggestionItem({ suggestion }: { suggestion: SpectralSuggestion }) {
  const severityColors = {
    info: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  const severityIcons = {
    info: <Info className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
    critical: <AlertTriangle className="w-3.5 h-3.5" />,
  };

  return (
    <div className={`p-2 rounded border text-xs ${severityColors[suggestion.severity]}`}>
      <div className="flex items-start gap-2">
        {severityIcons[suggestion.severity]}
        <div className="flex-1">
          <div className="font-medium">{suggestion.title}</div>
          <div className="text-gray-400 mt-0.5">{suggestion.description}</div>
          <div className="text-gray-500 mt-1 italic">{suggestion.explanation}</div>
          <div className="text-gray-600 mt-1 text-[10px]">
            Evidence: {suggestion.evidence} • Confidence: {(suggestion.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}
