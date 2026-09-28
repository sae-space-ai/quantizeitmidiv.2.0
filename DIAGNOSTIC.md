# QUANTIZE.IT - Diagnóstico y Correcciones

## Problemas Identificados y Corregidos

### 1. DOMINIO DE TIEMPO INCORRECTO
**Problema**: El código original trabajaba con ticks (unidades MIDI) pero @tonejs/midi usa tiempo en segundos.

**Corrección**: Reescrita completa de la lógica de cuantización para trabajar en el dominio del tiempo (segundos).

**Archivos modificados**:
- `src/utils/quantizer.ts` - Nueva implementación basada en tiempo
- `src/utils/midi-io.ts` - Conversión y cuantización en segundos

### 2. MANEJO DE CAMBIOS DE TEMPO
**Problema**: No se consideraban los cambios de tempo durante la cuantización.

**Corrección**: Implementada función `getBpmAtTime()` que calcula el BPM actual en cada punto temporal.

**Código**:
```typescript
function getBpmAtTime(midi: Midi, time: number): number {
  if (midi.header.tempos.length === 0) return 120;
  let currentBpm = midi.header.tempos[0].bpm;
  for (const tempo of midi.header.tempos) {
    if (tempo.time !== undefined && tempo.time <= time) {
      currentBpm = tempo.bpm;
    } else if (tempo.time !== undefined && tempo.time > time) {
      break;
    }
  }
  return currentBpm;
}
```

### 3. CÁLCULO DE REJILLA
**Problema**: La rejilla no se calculaba correctamente para diferentes compases.

**Corrección**: Fórmula correcta basada en la nota completa:
```typescript
const wholeNoteSeconds = (60 / bpm) * 4;
const baseInterval = wholeNoteSeconds / denominator;
```

**Ejemplo para 1/16 en 4/4 a 120 BPM**:
- wholeNoteSeconds = (60/120) * 4 = 2 segundos
- gridInterval = 2 / 16 = 0.125 segundos (semicorchea)

### 4. PISTAS MONOFÓNICAS VS POLIFÓNICAS
**Problema**: No se distinguía entre pistas monofónicas y polifónicas, causando solapamientos o pérdida de acordes.

**Corrección**: 
- Implementada detección automática con `isTrackMonophonic()`
- Para pistas monofónicas: se acortan notas para evitar solapamiento
- Para pistas polifónicas: se conservan los acordes legítimos

**Código**:
```typescript
function isTrackMonophonic(notes: Array<{ time: number; duration: number }>): boolean {
  if (notes.length <= 1) return true;
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = sorted[i].time + sorted[i].duration;
    const nextStart = sorted[i + 1].time;
    if (currentEnd > nextStart) {
      return false;
    }
  }
  return true;
}
```

### 5. CLONADO DE ARCHIVO ORIGINAL
**Problema**: No se preservaba el archivo original, imposibilitando re-cuantización con diferentes parámetros.

**Corrección**: Almacenamiento del ArrayBuffer original en un ref:
```typescript
const originalBufferRef = useRef<ArrayBuffer | null>(null);
// Al cargar:
originalBufferRef.current = arrayBuffer.slice(0);
// Al cuantizar:
const freshMidi = new Midi(originalBufferRef.current.slice(0));
```

### 6. EXPORTACIÓN Y DESCARGA
**Problema**: La exportación del blob MIDI podría fallar o generar archivos inválidos.

**Corrección**:
- Creación correcta del ArrayBuffer desde Uint8Array
- Generación de nombre de archivo descriptivo
- Uso de setTimeout para asegurar que la descarga se inicie

**Código**:
```typescript
export function exportMidiBlob(midi: Midi): Blob {
  const midiData = midi.toArray();
  const buffer = new ArrayBuffer(midiData.length);
  const view = new Uint8Array(buffer);
  view.set(midiData);
  return new Blob([buffer], { type: 'audio/midi' });
}
```

### 7. VALIDACIÓN DE ARCHIVOS
**Problema**: No se validaban archivos vacíos, corruptos o sin notas.

**Corrección**: Validaciones completas:
```typescript
if (file.size === 0) throw new Error('File is empty');
if (file.size > 50 * 1024 * 1024) throw new Error('File is too large');
const hasNotes = info.tracks.some(t => t.noteCount > 0);
if (!hasNotes) throw new Error('MIDI file has no notes');
```

### 8. MANEJO DE DURACIONES
**Problema**: Duraciones negativas o nulas después de la cuantización.

**Corrección**:
```typescript
// Asegurar duración positiva
newDuration = Math.max(0.001, newEndTime - newTime);

// Para pistas monofónicas, evitar solapamiento
if (currentEnd > nextStart) {
  quantizedNotes[i].duration = Math.max(0.001, nextStart - quantizedNotes[i].time);
}
```

## Archivos Modificados

1. **src/utils/quantizer.ts**
   - Reescrita completa para trabajar en dominio de tiempo
   - Nuevas funciones: `getGridIntervalSeconds()`, `quantizeTime()`, `applyStrength()`, `applySwing()`, `applyHumanize()`

2. **src/utils/midi-io.ts**
   - Conversión de lógica de ticks a segundos
   - Nueva función `getBpmAtTime()` para cambios de tempo
   - Nueva función `isTrackMonophonic()` para detección de pistas
   - Mejora de `exportMidiBlob()` para generación correcta de blobs

3. **src/App.tsx**
   - Almacenamiento del ArrayBuffer original
   - Validaciones completas de archivos
   - Mejora del flujo de descarga
   - Mensajes de error más claros
   - Generación de nombres de archivo descriptivos

## Verificación Realizada

✓ Compilación exitosa con `npm run build`
✓ Sin errores de TypeScript
✓ Lógica de cuantización verificada matemáticamente
✓ Manejo de casos edge (tiempo 0, duraciones cortas, cambios de tempo)
✓ Preservación de eventos MIDI (program changes, control changes, etc.)
✓ Detección correcta de pistas monofónicas/polifónicas

## Flujo de Trabajo Corregido

1. **Carga**: Archivo → ArrayBuffer (clonado) → Midi object → Análisis
2. **Selección**: Usuario elige pista y parámetros
3. **Cuantización**: 
   - Crear fresh Midi desde ArrayBuffer original
   - Para cada nota: calcular BPM actual → calcular rejilla → cuantizar
   - Detectar monofonía → aplicar política de solapamiento
   - Ordenar cronológicamente
4. **Exportación**: Midi → Uint8Array → ArrayBuffer → Blob → Download
5. **Descarga**: Nombre descriptivo con parámetros de cuantización

## Criterios Musicales Cumplidos

✓ **Rejilla 1/16 en 4/4**: Posiciones cada 0.125s a 120 BPM (semicorcheas)
✓ **Cambios de tempo**: BPM calculado en cada punto temporal
✓ **Preservación**: Alturas, pistas, canales, timbres, velocidades
✓ **Emparejamiento note-on/note-off**: Duraciones calculadas correctamente
✓ **Sin duraciones nulas/negativas**: Mínimo 0.001 segundos
✓ **Orden válido**: Notas ordenadas cronológicamente
✓ **No conversión automática**: No se convierten notas en acordes
✓ **Detección de ataques simultáneos**: Polifonía preservada
✓ **Pistas monofónicas**: Sin solapamiento
✓ **Pistas polifónicas**: Conservación de acordes legítimos

## Estado Final

✅ Aplicación operativa
✅ Botones Quantize y Download funcionales
✅ Archivos MIDI válidos generados
✅ Manejo robusto de errores
✅ Preservación completa de eventos MIDI
✅ Compilación exitosa
