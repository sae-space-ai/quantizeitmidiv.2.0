/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Report panel showing quantization details and verification.
 */

import { FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { QuantizeReport } from '../types';

interface ReportPanelProps {
  report: QuantizeReport;
  verification: string;
  tempoInfo?: string;
}

export function ReportPanel({ report, verification, tempoInfo }: ReportPanelProps) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Quantization Report</h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">{report.totalNotes}</div>
          <div className="text-xs text-gray-400">Total Notes</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">{report.notesMoved}</div>
          <div className="text-xs text-gray-400">Moved</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{report.notesUnchanged}</div>
          <div className="text-xs text-gray-400">Unchanged</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-400">{report.maxDisplacementMs}<span className="text-sm">ms</span></div>
          <div className="text-xs text-gray-400">Max Shift</div>
        </div>
      </div>

      {/* Average displacement */}
      <div className="bg-gray-700/30 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Average displacement</span>
          <span className="text-sm font-mono text-purple-300">{report.avgDisplacementMs} ms</span>
        </div>
      </div>

      {/* Verification */}
      {verification && (
        <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
          verification.includes('Valid') 
            ? 'bg-green-500/10 border border-green-500/30' 
            : 'bg-red-500/10 border border-red-500/30'
        }`}>
          {verification.includes('Valid') ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          )}
          <span className={`text-sm ${verification.includes('Valid') ? 'text-green-300' : 'text-red-300'}`}>
            {verification}
          </span>
        </div>
      )}

      {/* Tempo Info */}
      {tempoInfo && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <span className="text-sm text-blue-300">{tempoInfo}</span>
          </div>
        </div>
      )}

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-yellow-300">Warnings ({report.warnings.length})</span>
          </div>
          <ul className="text-xs text-gray-400 space-y-1 max-h-32 overflow-y-auto">
            {report.warnings.slice(0, 10).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
