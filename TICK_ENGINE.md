# QUANTIZE.IT - Motor de Cuantización Basado en Ticks

## Arquitectura del Motor

El motor de cuantización de QUANTIZE.IT trabaja directamente con los eventos binarios del archivo MIDI y sus posiciones en ticks (pulsos), sin convertir a milisegundos para los cálculos de rejilla.

### Componentes Principales

1. **binary-midi.ts**: Parser/escritor binario de MIDI
   - Parsea archivos MIDI a estructura de eventos con tiempos absolutos en ticks
   - Extrae notas emparejando noteOn/noteOff
   - Extrae eventos de tempo y time signature
   - Escribe MIDI binario desde estructura de eventos

2. **tick-quantizer.ts**: Motor de cuantización en dominio de ticks
   - Calcula tamaños de rejilla basados en PPQ
   - Cuantiza posiciones de tick a la rejilla
   - Aplica strength, swing, humanize en dominio de ticks
   - Respeta cambios de compás (time signature)

3. **midi-io.ts**: Orquestador de I/O
   - Carga archivos MIDI (binario + @tonejs/midi para UI)
   - Ejecuta cuantización tick-based
   - Exporta MIDI con tempo constante de 56 BPM
   - Verifica archivos generados

4. **binary-tests.ts**: Suite de pruebas binarias
   - Verifica PPQ, tempo, time signatures
   - Valida orden de notas, duraciones
   - Comprueba que notas están en la rejilla
   - Verifica que el MIDI es re-leíble

## Reloj Musical Interno

### Concepto

El reloj musical interno divide cada pulso (quarter note) en subdivisiones según el grid seleccionado:

```
PPQ = 480 (ejemplo común)

Grid 1/4:  480 ticks por negra     = 1 posición por pulso
Grid 1/8:  240 ticks por corchea   = 2 posiciones por pulso
Grid 1/16: 120 ticks por semicorchea = 4 posiciones por pulso
Grid 1/32: 60 ticks por fusa       = 8 posiciones por pulso

Tripletes:
Grid 1/8T: 160 ticks por corchea triple = 3 posiciones por pulso
Grid 1/16T: 80 ticks por semicorchea triple = 6 posiciones por pulso
```

### Cálculo de Tamaños de Rejilla

```typescript
function getGridSizeTicks(ppq: number, grid: GridType): number {
  // 1/4 = PPQ / 1
  // 1/8 = PPQ / 2
  // 1/16 = PPQ / 4
  // 1/32 = PPQ / 8
  let gridSize = ppq / division;
  
  if (isTriplet) {
    gridSize = (gridSize * 2) / 3;
  }
  
  return gridSize;
}
```

### Posiciones por Compás

El número de posiciones de rejilla por compás depende del time signature:

```
4/4 con grid 1/16:
  4 beats × 4 semicorcheas = 16 posiciones por compás
  
3/4 con grid 1/16:
  3 beats × 4 semicorcheas = 12 posiciones por compás
  
6/8 con grid 1/8:
  6 beats × 1 corchea = 6 posiciones por compás
```

### Duración de Compás en Ticks

```typescript
function getBarDurationTicks(ppq: number, timeSignature: [number, number]): number {
  const [numerator, denominator] = timeSignature;
  // Bar = numerator × (PPQ × 4 / denominator)
  // 4/4: 4 × (PPQ × 4 / 4) = 4 × PPQ
  // 3/4: 3 × PPQ
  // 6/8: 6 × (PPQ × 4 / 8) = 3 × PPQ
  return numerator * (ppq * 4 / denominator);
}
```

## Flujo de Cuantización

### 1. Carga del Archivo

```
Archivo MIDI (.mid)
    ↓
parseMidiBinary() → MidiFile (eventos en ticks)
    ↓
Extraer: notas, tempos, time signatures
```

### 2. Cuantización por Pista

Para cada pista seleccionada:

```
Para cada nota:
  1. Obtener time signature en startTick
  2. Calcular gridSize desde PPQ + grid
  3. Cuantizar startTick a la rejilla
  4. Aplicar strength (interpolación)
  5. Aplicar swing (delay en posiciones impares)
  6. Aplicar humanize (offset aleatorio)
  7. Si quantizeEnds: cuantizar endTick
  8. Asegurar duración positiva (mínimo 1 tick)
```

### 3. Manejo de Pistas Monofónicas

```
Si la pista es monofónica:
  Ordenar notas por startTick
  Para cada par de notas consecutivas:
    Si endTick[i] > startTick[i+1]:
      endTick[i] = startTick[i+1]
      (acortar para evitar solapamiento)
```

### 4. Reemplazo de Tempo

```
Eliminar todos los eventos setTempo de todas las pistas
    ↓
Insertar único evento setTempo en tick 0:
  microsecondsPerBeat = 60000000 / 56 = 1071428
  (56 BPM constante)
```

### 5. Exportación

```
MidiFile (eventos en ticks)
    ↓
writeMidiBinary() → Uint8Array
    ↓
Convertir tiempos absolutos a delta times
    ↓
Blob MIDI descargable
```

## Preservación de Relaciones Rítmicas

### Estrategia

Al trabajar en ticks y mantener el PPQ original:

1. **Posiciones rítmicas preservadas**: Una nota en la posición 480 (segunda negra en PPQ=480) sigue en la posición 480 después de cuantizar.

2. **Independiente del tempo**: El tempo de salida (56 BPM) no afecta las posiciones de tick, solo la velocidad de reproducción.

3. **Cambios de compás respetados**: Si el MIDI original tiene cambios de time signature, la rejilla se recalcula en cada tramo.

### Ejemplo

```
Original (120 BPM, PPQ=480):
  Nota 1: tick 0 (beat 1)
  Nota 2: tick 480 (beat 2)
  Nota 3: tick 960 (beat 3)
  Nota 4: tick 1440 (beat 4)

Cuantizado (56 BPM, PPQ=480):
  Nota 1: tick 0 (beat 1)
  Nota 2: tick 480 (beat 2)
  Nota 3: tick 960 (beat 3)
  Nota 4: tick 1440 (beat 4)

Las posiciones rítmicas son idénticas.
Solo cambia la velocidad de reproducción (56 BPM en lugar de 120 BPM).
```

## Pruebas Binarias

### Tests Implementados

1. **PPQ**: Verifica que el PPQ del archivo de salida coincide con el original
2. **Tempo único**: Confirma que hay exactamente un evento de tempo
3. **Tempo en tick 0**: Verifica que el tempo está al inicio
4. **Time signatures**: Valida que los compases se preservan
5. **Grid size**: Comprueba que el tamaño de rejilla es correcto
6. **Posiciones por compás**: Valida 16 posiciones para 4/4 con 1/16
7. **Orden de notas**: Verifica orden cronológico
8. **Duraciones válidas**: Confirma duraciones positivas
9. **Sin ticks negativos**: Valida que no hay valores negativos
10. **Notas en rejilla**: Comprueba que ≥95% de notas están cuantizadas
11. **Re-leíble**: Verifica que el MIDI se puede volver a abrir

### Ejecución

Las pruebas se ejecutan automáticamente después de cada cuantización y se muestran en el panel "Binary MIDI Tests".

## Ventajas del Enfoque Tick-Based

1. **Precisión**: No hay redondeos de milisegundos
2. **Compatibilidad**: Funciona con cualquier PPQ (96, 120, 384, 480, 960, etc.)
3. **Independencia del tempo**: Las posiciones rítmicas se preservan
4. **Soporte de compases variables**: Time signature changes se manejan correctamente
5. **Verificación robusta**: Las pruebas binarias validan la integridad del archivo

## Limitaciones

1. **Tempo de salida fijo**: Actualmente 56 BPM (configurable en el código)
2. **Swing en ticks**: El swing se aplica en posiciones de rejilla, no en tiempo absoluto
3. **Humanize en ticks**: La humanización se especifica en ticks, no en milisegundos
4. **No preserva tempo original**: Todos los archivos de salida tienen 56 BPM

## Archivos Modificados

- `src/utils/midi-types.ts`: Tipos para eventos MIDI binarios
- `src/utils/binary-midi.ts`: Parser/escritor binario
- `src/utils/tick-quantizer.ts`: Motor de cuantización en ticks
- `src/utils/midi-io.ts`: Orquestador actualizado
- `src/utils/binary-tests.ts`: Suite de pruebas binarias
- `src/components/BinaryTestPanel.tsx`: UI para resultados de pruebas
- `src/App.tsx`: Integración de pruebas binarias

## Estado

✅ Motor tick-based implementado
✅ Reloj musical interno basado en PPQ
✅ Soporte para cambios de compás
✅ Tempo constante de 56 BPM
✅ Suite de pruebas binarias
✅ Verificación automática post-exportación
✅ Compilación exitosa

**Versión**: QUANTIZE.IT - MIDI Quantizer Pro v1.3 (Tick-Based Engine)
