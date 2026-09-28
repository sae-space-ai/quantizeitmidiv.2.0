/**
 * QUANTIZE.IT - Musical Stages Panel
 * 
 * Displays the 4-stage musical processing workflow.
 * Allows review and validation at each stage.
 * Preserves original and allows undo.
 */

import { useState, useEffect } from 'react';
import { 
  Music2, 
  GitBranch, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ChevronRight,
  ChevronDown,
  RotateCcw
} from 'lucide-react';
import type { MidiFile } from '../utils/midi-types';
import type { GridType } from '../types';
import {
  runAllStages,
  getStagesSummary,
  type StageAnalysis,
  type ProcessingStage,
  type StageSuggestion,
} from '../utils/musical-stages';

interface MusicalStagesPanelProps {
  midi: MidiFile | null;
  grid: GridType;
  ppq: number;
  onStatusChange?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function MusicalStagesPanel({ 
  midi, 
  grid, 
  ppq, 
  onStatusChange 
}: MusicalStagesPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stages, setStages] = useState<{
    rhythmicBase: StageAnalysis | null;
    harmonicBase: StageAnalysis | null;
    stringsWoodwinds: StageAnalysis | null;
    brass: StageAnalysis | null;
  }>({
    rhythmicBase: null,
    harmonicBase: null,
    stringsWoodwinds: null,
    brass: null,
  });
  
  const [currentStage, setCurrentStage] = useState<ProcessingStage>('idle');
  const [expandedStage, setExpandedStage] = useState<ProcessingStage | null>(null);
  const [validatedStages, setValidatedStages] = useState<Set<ProcessingStage>>(new Set());

  const handleAnalyze = () => {
    if (!midi) return;
    
    setIsProcessing(true);
    setCurrentStage('analyzing');
    
    try {
      const result = runAllStages(midi, grid, ppq);
      setStages(result);
      
      const summary = getStagesSummary(result);
      
      if (summary.requiresReview) {
        onStatusChange?.(
          `Analysis complete: ${summary.totalSuggestions} suggestions (${summary.warningsCount} warnings, ${summary.infoCount} info). Review required.`,
          'info'
        );
        setCurrentStage('requires-review');
      } else {
        onStatusChange?.(
          `Analysis complete: ${summary.totalSuggestions} suggestions. No critical issues.`,
          'success'
        );
        setCurrentStage('validated');
      }
    } catch (error) {
      onStatusChange?.(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      setCurrentStage('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleValidateStage = (stage: ProcessingStage) => {
    setValidatedStages(prev => new Set([...prev, stage]));
    onStatusChange?.(`Stage "${stage}" validated`, 'success');
  };

  const handleReset = () => {
    setStages({
      rhythmicBase: null,
      harmonicBase: null,
      stringsWoodwinds: null,
      brass: null,
    });
    setCurrentStage('idle');
    setValidatedStages(new Set());
    setExpandedStage(null);
    onStatusChange?.('Stages reset', 'info');
  };

  const renderStageCard = (
    stageName: ProcessingStage,
    title: string,
    description: string,
    analysis: StageAnalysis | null,
    order: number
  ) => {
    const isValidated = validatedStages.has(stageName);
    const isExpanded = expandedStage === stageName;
    
    return (
      <div 
        key={stageName}
        className={`border rounded-lg transition-all ${
          isValidated 
            ? 'border-green-500/50 bg-green-500/5' 
            : analysis 
              ? 'border-yellow-500/50 bg-yellow-500/5'
              : 'border-gray-700/50 bg-gray-800/30'
        }`}
      >
        <div 
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/20"
          onClick={() => setExpandedStage(isExpanded ? null : stageName)}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isValidated 
                ? 'bg-green-500/20 text-green-400'
                : analysis 
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-gray-700/50 text-gray-500'
            }`}>
              {order}
            </div>
            <div>
              <div className="text-sm font-medium text-white">{title}</div>
              <div className="text-xs text-gray-400">{description}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isValidated && <CheckCircle2 className="w-5 h-5 text-green-400" />}
            {analysis && !isValidated && analysis.requiresHumanReview && (
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            )}
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>

        {isExpanded && analysis && (
          <div className="px-3 pb-3 space-y-2">
            {/* Track summary */}
            <div className="text-xs text-gray-400 mb-2">
              {analysis.tracks.length} tracks analyzed
            </div>
            
            {/* Suggestions */}
            {analysis.suggestions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-gray-300">
                  Suggestions ({analysis.suggestions.length}):
                </div>
                {analysis.suggestions.slice(0, 5).map((suggestion) => (
                  <SuggestionItem key={suggestion.id} suggestion={suggestion} />
                ))}
                {analysis.suggestions.length > 5 && (
                  <div className="text-xs text-gray-500">
                    +{analysis.suggestions.length - 5} more suggestions
                  </div>
                )}
              </div>
            )}

            {/* Validate button */}
            {!isValidated && (
              <button
                onClick={() => handleValidateStage(stageName)}
                className="w-full mt-2 py-1.5 px-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 rounded text-xs transition-colors"
              >
                Validate this stage
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!midi) {
    return (
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 text-center">
        <Music2 className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">Load a MIDI file to analyze musical stages</p>
      </div>
    );
  }

  const summary = stages.rhythmicBase ? getStagesSummary(stages as any) : null;

  return (
    <div className="bg-gray-800/30 rounded-xl border border-indigo-500/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Musical Processing Stages</h2>
        </div>
        <div className="flex gap-2">
          {stages.rhythmicBase && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          <button
            onClick={handleAnalyze}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {isProcessing ? 'Analyzing...' : 'Analyze All Stages'}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Process the musical work in 4 stages: rhythmic base, harmonic base, strings/woodwinds, and brass. 
        Each stage analyzes and suggests without imposing changes. The musician decides.
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-gray-700/30 rounded p-2">
            <div className="text-lg font-bold text-white">{summary.totalSuggestions}</div>
            <div className="text-xs text-gray-400">Suggestions</div>
          </div>
          <div className="bg-gray-700/30 rounded p-2">
            <div className="text-lg font-bold text-red-400">{summary.criticalIssues}</div>
            <div className="text-xs text-gray-400">Critical</div>
          </div>
          <div className="bg-gray-700/30 rounded p-2">
            <div className="text-lg font-bold text-yellow-400">{summary.warningsCount}</div>
            <div className="text-xs text-gray-400">Warnings</div>
          </div>
          <div className="bg-gray-700/30 rounded p-2">
            <div className="text-lg font-bold text-blue-400">{summary.infoCount}</div>
            <div className="text-xs text-gray-400">Info</div>
          </div>
        </div>
      )}

      {/* Stage cards */}
      <div className="space-y-2">
        {renderStageCard(
          'rhythmic-base',
          'Perfect Rhythmic Base',
          'Pulse, meter, subdivisions, accents',
          stages.rhythmicBase,
          1
        )}
        {renderStageCard(
          'harmonic-base',
          'Harmonic Base and Bass',
          'Fundamentals, chords, inversions',
          stages.harmonicBase,
          2
        )}
        {renderStageCard(
          'strings-woodwinds',
          'Strings and Woodwinds',
          'Melodies, counterpoint, phrasing',
          stages.stringsWoodwinds,
          3
        )}
        {renderStageCard(
          'brass',
          'Brass (Trumpets)',
          'Attacks, entries, coordination',
          stages.brass,
          4
        )}
      </div>

      {/* Status */}
      {currentStage !== 'idle' && (
        <div className={`p-3 rounded-lg text-sm ${
          currentStage === 'validated' 
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : currentStage === 'requires-review'
              ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
              : currentStage === 'error'
                ? 'bg-red-500/10 border border-red-500/30 text-red-300'
                : 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
        }`}>
          {currentStage === 'analyzing' && 'Analyzing musical structure...'}
          {currentStage === 'validated' && '✓ All stages validated. Ready for quantization.'}
          {currentStage === 'requires-review' && '⚠ Review required. Validate each stage before proceeding.'}
          {currentStage === 'error' && '✗ Analysis failed. Check MIDI file.'}
        </div>
      )}
    </div>
  );
}

function SuggestionItem({ suggestion }: { suggestion: StageSuggestion }) {
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
        </div>
      </div>
    </div>
  );
}
