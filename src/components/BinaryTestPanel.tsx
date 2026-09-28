/**
 * QUANTIZE.IT - MIDI Quantizer Pro
 * Binary test results panel.
 */

import { CheckCircle2, XCircle, TestTube } from 'lucide-react';
import type { TestSuite } from '../utils/binary-tests';

interface BinaryTestPanelProps {
  testSuite: TestSuite;
}

export function BinaryTestPanel({ testSuite }: BinaryTestPanelProps) {
  const allPassed = testSuite.failed === 0;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <TestTube className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Binary MIDI Tests</h3>
        <span className={`ml-auto text-sm font-mono ${allPassed ? 'text-green-400' : 'text-red-400'}`}>
          {testSuite.passed}/{testSuite.results.length} passed
        </span>
      </div>

      <div className="space-y-2">
        {testSuite.results.map((result, index) => (
          <div
            key={index}
            className={`flex items-start gap-2 p-2 rounded-lg ${
              result.passed ? 'bg-green-500/5' : 'bg-red-500/5'
            }`}
          >
            {result.passed ? (
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200">{result.name}</div>
              <div className={`text-xs ${result.passed ? 'text-green-300' : 'text-red-300'}`}>
                {result.message}
              </div>
              {result.details && !result.passed && (
                <div className="text-xs text-gray-500 mt-1 font-mono whitespace-pre-wrap">
                  {result.details}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {allPassed && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm text-green-300 text-center">
            ✓ All binary tests passed. MIDI file is valid and correctly quantized.
          </p>
        </div>
      )}
    </div>
  );
}
