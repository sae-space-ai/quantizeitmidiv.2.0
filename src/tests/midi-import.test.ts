/**
 * QUANTIZE.IT - MIDI Import Regression Test
 * 
 * Prueba automatizada para detectar la regresión del importador MIDI.
 * Verifica que la librería midi-file se importa correctamente y que
 * las funciones parseMidi y writeMidi están disponibles.
 */

// @ts-ignore - midi-file has no types
import { parseMidi, writeMidi } from 'midi-file';

export interface MidiImportTestResult {
  success: boolean;
  message: string;
  details: {
    parseMidiExists: boolean;
    writeMidiExists: boolean;
    parseMidiType: string;
    writeMidiType: string;
  };
}

/**
 * Verifica que la librería midi-file está correctamente importada.
 */
export function testMidiImport(): MidiImportTestResult {
  const parseMidiExists = typeof parseMidi === 'function';
  const writeMidiExists = typeof writeMidi === 'function';

  const details = {
    parseMidiExists,
    writeMidiExists,
    parseMidiType: typeof parseMidi,
    writeMidiType: typeof writeMidi,
  };

  if (!parseMidiExists) {
    return {
      success: false,
      message: 'parseMidi no es una función. Verificar importación de midi-file.',
      details,
    };
  }

  if (!writeMidiExists) {
    return {
      success: false,
      message: 'writeMidi no es una función. Verificar importación de midi-file.',
      details,
    };
  }

  return {
    success: true,
    message: 'Importación de midi-file correcta: parseMidi y writeMidi disponibles.',
    details,
  };
}

/**
 * Prueba básica de parseo de MIDI con datos mínimos válidos.
 */
export function testMidiParsing(): { success: boolean; message: string } {
  try {
    // MIDI mínimo válido: header + 1 track vacío
    const minimalMidi = new Uint8Array([
      // Header chunk
      0x4D, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // Length: 6
      0x00, 0x00,             // Format: 0
      0x00, 0x01,             // Num tracks: 1
      0x00, 0x60,             // Ticks per beat: 96
      
      // Track chunk
      0x4D, 0x54, 0x72, 0x6B, // "MTrk"
      0x00, 0x00, 0x00, 0x04, // Length: 4
      0x00, 0xFF, 0x2F, 0x00, // End of track
    ]);

    const parsed = parseMidi(minimalMidi);

    if (!parsed || !parsed.header || !parsed.tracks) {
      return {
        success: false,
        message: 'Parseo de MIDI falló: estructura inválida.',
      };
    }

    if (parsed.header.format !== 0) {
      return {
        success: false,
        message: `Formato incorrecto: esperado 0, obtenido ${parsed.header.format}.`,
      };
    }

    if (parsed.header.numTracks !== 1) {
      return {
        success: false,
        message: `Número de pistas incorrecto: esperado 1, obtenido ${parsed.header.numTracks}.`,
      };
    }

    if (parsed.header.ticksPerBeat !== 96) {
      return {
        success: false,
        message: `Ticks per beat incorrecto: esperado 96, obtenido ${parsed.header.ticksPerBeat}.`,
      };
    }

    return {
      success: true,
      message: 'Parseo de MIDI mínimo válido correcto.',
    };
  } catch (error) {
    return {
      success: false,
      message: `Error al parsear MIDI: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Prueba básica de escritura de MIDI.
 */
export function testMidiWriting(): { success: boolean; message: string } {
  try {
    const midiData = {
      header: {
        format: 0 as const,
        numTracks: 1,
        ticksPerBeat: 96,
      },
      tracks: [
        [
          {
            deltaTime: 0,
            type: 'endOfTrack' as const,
          },
        ],
      ],
    };

    const result = writeMidi(midiData);

    if (!result || !Array.isArray(result) || result.length === 0) {
      return {
        success: false,
        message: 'Escritura de MIDI falló: resultado inválido.',
      };
    }

    // Verificar que el resultado empieza con "MThd"
    const header = result.slice(0, 4);
    if (header[0] !== 0x4D || header[1] !== 0x54 || header[2] !== 0x68 || header[3] !== 0x64) {
      return {
        success: false,
        message: 'Escritura de MIDI falló: header incorrecto.',
      };
    }

    return {
      success: true,
      message: 'Escritura de MIDI mínimo correcto.',
    };
  } catch (error) {
    return {
      success: false,
      message: `Error al escribir MIDI: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Ejecuta todas las pruebas de importación MIDI.
 */
export function runAllMidiImportTests(): {
  allPassed: boolean;
  results: Array<{ name: string; success: boolean; message: string }>;
} {
  const results = [];

  // Test 1: Importación
  const importTest = testMidiImport();
  results.push({
    name: 'Importación de midi-file',
    success: importTest.success,
    message: importTest.message,
  });

  // Test 2: Parseo
  const parseTest = testMidiParsing();
  results.push({
    name: 'Parseo de MIDI',
    success: parseTest.success,
    message: parseTest.message,
  });

  // Test 3: Escritura
  const writeTest = testMidiWriting();
  results.push({
    name: 'Escritura de MIDI',
    success: writeTest.success,
    message: writeTest.message,
  });

  const allPassed = results.every(r => r.success);

  return { allPassed, results };
}

/**
 * Componente React para mostrar resultados de pruebas.
 */
export function MidiImportTestComponent() {
  const testResults = runAllMidiImportTests();

  return {
    allPassed: testResults.allPassed,
    summary: testResults.allPassed
      ? '✅ Todas las pruebas de importación MIDI pasaron.'
      : '❌ Algunas pruebas de importación MIDI fallaron.',
    details: testResults.results.map(r => ({
      test: r.name,
      status: r.success ? '✅ PASS' : '❌ FAIL',
      message: r.message,
    })),
  };
}
