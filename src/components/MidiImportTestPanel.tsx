/**
 * QUANTIZE.IT - MIDI Import Test Panel
 * 
 * Panel visual para ejecutar y mostrar resultados de pruebas
 * de importación MIDI. Útil para verificar que la regresión
 * del importador MIDI está corregida.
 */

import { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Play } from 'lucide-react';
import { runAllMidiImportTests } from '../tests/midi-import.test';

interface TestResult {
  name: string;
  success: boolean;
  message: string;
}

export function MidiImportTestPanel() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [allPassed, setAllPassed] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runTests = () => {
    setIsRunning(true);
    
    // Simular async para mostrar estado de carga
    setTimeout(() => {
      const testResults = runAllMidiImportTests();
      setResults(testResults.results);
      setAllPassed(testResults.allPassed);
      setIsRunning(false);
    }, 100);
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <h3 className="text-base font-semibold text-white">
            Pruebas de Importación MIDI
          </h3>
        </div>
        <button
          onClick={runTests}
          disabled={isRunning}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            isRunning
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Ejecutando...' : 'Ejecutar Pruebas'}
        </button>
      </div>

      {results === null && !isRunning && (
        <div className="text-center py-8 text-gray-500">
          <p>Haz clic en "Ejecutar Pruebas" para verificar la importación MIDI.</p>
          <p className="text-sm mt-2">
            Esto verificará que la regresión del importador MIDI está corregida.
          </p>
        </div>
      )}

      {isRunning && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="text-gray-400 mt-2">Ejecutando pruebas...</p>
        </div>
      )}

      {results !== null && !isRunning && (
        <div className="space-y-3">
          {/* Resumen */}
          <div
            className={`p-3 rounded-lg ${
              allPassed
                ? 'bg-green-500/10 border border-green-500/30'
                : 'bg-red-500/10 border border-red-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {allPassed ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span
                className={`font-medium ${
                  allPassed ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {allPassed
                  ? '✅ Todas las pruebas pasaron'
                  : '❌ Algunas pruebas fallaron'}
              </span>
            </div>
          </div>

          {/* Resultados individuales */}
          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  result.success
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-sm text-white">
                      {result.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {result.message}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Información adicional */}
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-300">
              <strong>Nota:</strong> Estas pruebas verifican que la librería midi-file
              está correctamente importada y que las funciones parseMidi y writeMidi
              están disponibles. Si todas las pruebas pasan, la regresión del
              importador MIDI está corregida.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
