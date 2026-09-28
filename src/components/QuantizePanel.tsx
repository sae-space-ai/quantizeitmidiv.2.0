/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Main quantization parameters panel with reset and download options.
 */

import { Settings2, Grid3x3, Zap, Wind, Shuffle, CheckSquare, RotateCcw, Download, FileText } from 'lucide-react';
import type { QuantizeParams, GridType } from '../types';
import { getGridOptions } from '../utils/quantizer';

interface QuantizePanelProps {
  params: QuantizeParams;
  onChangeParams: (params: QuantizeParams) => void;
  onQuantize: () => void;
  onReset: () => void;
  onDownloadReport?: () => void;
  onDownloadMidi?: () => void;
  isProcessing: boolean;
  disabled: boolean;
}

export function QuantizePanel({
  params,
  onChangeParams,
  onQuantize,
  onReset,
  onDownloadReport,
  onDownloadMidi,
  isProcessing,
  disabled,
}: QuantizePanelProps) {
  const gridOptions = getGridOptions();

  const updateParam = <K extends keyof QuantizeParams>(key: K, value: QuantizeParams[K]) => {
    onChangeParams({ ...params, [key]: value });
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-semibold text-white">Quantization Parameters</h3>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
          title="Reset to original MIDI"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Output Tempo Indicator */}
      <div className="mb-5 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-cyan-300">
            Tempo de salida: {params.outputTempo} BPM constante
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          El archivo MIDI resultante tendrá un tempo uniforme de {params.outputTempo} BPM desde el inicio hasta el final.
        </p>
      </div>

      <div className="space-y-5">
        {/* Grid Selection */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <Grid3x3 className="w-4 h-4 text-cyan-400" />
            Grid Division
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {gridOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => updateParam('grid', option.value as GridType)}
                className={`
                  px-2 py-2 rounded-lg text-xs font-medium transition-all text-center
                  ${params.grid === option.value
                    ? 'bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 shadow-lg shadow-cyan-500/10'
                    : 'bg-gray-700/40 border border-gray-600/30 text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
                  }
                `}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Strength Slider */}
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Strength
            </span>
            <span className="text-cyan-400 font-mono">{params.strength}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={params.strength}
            onChange={(e) => updateParam('strength', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0% (None)</span>
            <span>50%</span>
            <span>100% (Full)</span>
          </div>
        </div>

        {/* Swing Slider */}
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-purple-400" />
              Swing
            </span>
            <span className="text-cyan-400 font-mono">{params.swing}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={params.swing}
            onChange={(e) => updateParam('swing', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Straight</span>
            <span>50%</span>
            <span>Heavy Swing</span>
          </div>
        </div>

        {/* Humanize */}
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-orange-400" />
              Humanize (ticks)
            </span>
            <span className="text-cyan-400 font-mono">{params.humanizeTicks}</span>
          </label>
          <input
            type="range"
            min="0"
            max="50"
            value={params.humanizeTicks}
            onChange={(e) => updateParam('humanizeTicks', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0 (Perfect)</span>
            <span>25</span>
            <span>50 (Loose)</span>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
            <input
              type="checkbox"
              checked={params.quantizeStarts}
              onChange={(e) => updateParam('quantizeStarts', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm text-gray-200">Quantize Starts</span>
              <p className="text-xs text-gray-500">Snap note onsets to grid</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
            <input
              type="checkbox"
              checked={params.quantizeEnds}
              onChange={(e) => updateParam('quantizeEnds', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm text-gray-200">Quantize Ends</span>
              <p className="text-xs text-gray-500">Snap note offsets to grid</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
            <input
              type="checkbox"
              checked={params.preserveVelocity}
              onChange={(e) => updateParam('preserveVelocity', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm text-gray-200">Preserve Velocity</span>
              <p className="text-xs text-gray-500">Keep original dynamics</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
            <input
              type="checkbox"
              checked={params.humanizeTicks > 0}
              onChange={(e) => updateParam('humanizeTicks', e.target.checked ? 5 : 0)}
              className="w-4 h-4 rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm text-gray-200">Humanize</span>
              <p className="text-xs text-gray-500">Add random timing variation</p>
            </div>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Quantize Button */}
          <button
            onClick={onQuantize}
            disabled={disabled || isProcessing}
            className={`
              w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
              ${disabled || isProcessing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40'
              }
            `}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4" />
                Quantize & Download
              </>
            )}
          </button>

          {/* Secondary Actions */}
          {(onDownloadMidi || onDownloadReport) && (
            <div className="grid grid-cols-2 gap-2">
              {onDownloadMidi && (
                <button
                  onClick={onDownloadMidi}
                  className="flex items-center justify-center gap-2 py-2 px-4 bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download MIDI
                </button>
              )}
              {onDownloadReport && (
                <button
                  onClick={onDownloadReport}
                  className="flex items-center justify-center gap-2 py-2 px-4 bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Download Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
