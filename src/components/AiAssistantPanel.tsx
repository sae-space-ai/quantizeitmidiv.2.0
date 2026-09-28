/**
 * QUANTIZE.IT - AI Assistant Panel
 * 
 * Shows AI suggestions from the local heuristic analyzer.
 * Each suggestion can be accepted or rejected.
 * Does NOT modify the work without explicit user action.
 */

import { useState } from 'react';
import { Brain, Check, X, AlertCircle, Info, Lightbulb } from 'lucide-react';
import type { AiAnalysisResult, AiSuggestion } from '../utils/ai-provider';

interface AiAssistantPanelProps {
  analysis: AiAnalysisResult | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onAcceptSuggestion: (suggestion: AiSuggestion) => void;
  onRejectSuggestion: (suggestion: AiSuggestion) => void;
  disabled: boolean;
}

export function AiAssistantPanel({
  analysis,
  isAnalyzing,
  onAnalyze,
  onAcceptSuggestion,
  onRejectSuggestion,
  disabled,
}: AiAssistantPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'suggestion':
        return <Lightbulb className="w-4 h-4 text-blue-400" />;
      default:
        return <Info className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <h3 className="text-base font-semibold text-white">AI Assistant</h3>
        </div>
        <button
          onClick={onAnalyze}
          disabled={disabled || isAnalyzing}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            disabled || isAnalyzing
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300'
          }`}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Local heuristic analysis. No data is sent to external services. 
        Suggestions require your explicit approval before being applied.
      </p>

      {analysis && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-gray-700/30 rounded p-2 text-center">
              <div className="text-lg font-bold text-white">{analysis.summary.totalNotes}</div>
              <div className="text-xs text-gray-400">Notes</div>
            </div>
            <div className="bg-gray-700/30 rounded p-2 text-center">
              <div className="text-lg font-bold text-yellow-400">{analysis.summary.rhythmErrors}</div>
              <div className="text-xs text-gray-400">Rhythm</div>
            </div>
            <div className="bg-gray-700/30 rounded p-2 text-center">
              <div className="text-lg font-bold text-orange-400">{analysis.summary.proximityIssues}</div>
              <div className="text-xs text-gray-400">Proximity</div>
            </div>
            <div className="bg-gray-700/30 rounded p-2 text-center">
              <div className="text-lg font-bold text-blue-400">{analysis.summary.articulationSuggestions}</div>
              <div className="text-xs text-gray-400">Articulation</div>
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-3">
            Analysis completed in {analysis.durationMs.toFixed(0)} ms by {analysis.provider}
          </div>

          {/* Suggestions */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {analysis.suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`bg-gray-700/30 rounded-lg p-3 border ${
                  expandedId === suggestion.id
                    ? 'border-purple-500/50'
                    : 'border-gray-600/30'
                }`}
              >
                <div
                  className="flex items-start gap-2 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === suggestion.id ? null : suggestion.id)}
                >
                  {severityIcon(suggestion.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{suggestion.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{suggestion.description}</div>
                  </div>
                  <div className="flex gap-1">
                    {suggestion.canAutoFix && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcceptSuggestion(suggestion);
                          }}
                          className="p-1 hover:bg-green-500/20 rounded"
                          title="Accept"
                        >
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRejectSuggestion(suggestion);
                          }}
                          className="p-1 hover:bg-red-500/20 rounded"
                          title="Reject"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {expandedId === suggestion.id && (
                  <div className="mt-2 pt-2 border-t border-gray-600/30">
                    <p className="text-xs text-gray-300 mb-2">{suggestion.explanation}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500 mb-1">Before:</div>
                        <pre className="bg-gray-800/50 p-2 rounded font-mono text-gray-300 overflow-x-auto">
                          {JSON.stringify(suggestion.beforeData, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">After:</div>
                        <pre className="bg-gray-800/50 p-2 rounded font-mono text-gray-300 overflow-x-auto">
                          {suggestion.afterData
                            ? JSON.stringify(suggestion.afterData, null, 2)
                            : 'No automatic fix'}
                        </pre>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!analysis && !isAnalyzing && (
        <div className="text-center py-6 text-gray-500 text-sm">
          Click "Analyze" to get musical suggestions for the loaded MIDI.
        </div>
      )}
    </div>
  );
}
