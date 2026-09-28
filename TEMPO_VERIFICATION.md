# QUANTIZE.IT - Verificación de Tempo Constante (56 BPM)

## Implementación

### Estrategia de Cuantización

El motor de cuantización ahora utiliza una estrategia basada en **posiciones de rejilla**:

1. **Conversión a posición de rejilla**: Cada nota se convierte de tiempo (segundos) a posición de rejilla usando el BPM local en ese momento.
   ```typescript
   const gridPos = timeToGridPosition(note.time, localBPM, grid);
   ```

2. **Cuantización de posición**: La posición de rejilla se cuantiza (redondeo, strength, swing, humanize).
   ```typescript
   const quantizedPos = quantizeGridPositionFull(gridPos, params, groove);
   ```

3. **Conversión a tiempo con tempo constante**: La posición cuantizada se convierte de vuelta a tiempo usando el tempo de salida (56 BPM).
   ```typescript
   const newTime = gridPositionToTime(quantizedPos, outputTempo, grid);
   ```

4. **Reemplazo de tempos**: Todos los eventos de tempo del header se eliminan y se inserta un único tempo de 56 BPM al inicio.
   ```typescript
   midi.header.tempos = [{ bpm: 56, time: 0 }];
   ```

### Ventajas de esta estrategia

- ✅ **Preserva relaciones rítmicas**: Las notas mantienen su posición relativa en la rejilla musical.
- ✅ **Independiente de cambios de tempo**: Los cambios de tempo del original no afectan la cuantización.
- ✅ **Tempo constante garantizado**: El archivo de salida tiene un único tempo de 56 BPM.
- ✅ **Compatible con todos los grids**: Funciona con grids binarios (1/4, 1/8, 1/16, 1/32) y ternarios (1/4T, 1/8T, 1/16T).

## Interfaz de Usuario

### Indicador de Tempo de Salida

El panel de cuantización muestra un indicador visual:

```
┌─────────────────────────────────────────────┐
│ ● Tempo de salida: 56 BPM constante         │
│   El archivo MIDI resultante tendrá un      │
│   tempo uniforme de 56 BPM desde el inicio  │
│   hasta el final.                           │
└─────────────────────────────────────────────┘
```

### Verificación Post-Export

Después de cuantizar y descargar, la aplicación verifica el MIDI generado y muestra:

1. **Validación general**: "Valid MIDI: X tracks, Y notes, Z.Zs"
2. **Información de tempo**: "Single tempo: 56 BPM at 0.00s"

Si se detectan múltiples tempos, se muestra una advertencia.

## Archivo de Prueba

### Generador de MIDI con Cambios de Tempo

Se incluye un generador de MIDI de prueba (`src/utils/test-midi.ts`) que crea un archivo con:

- **8 compases** en 4/4
- **4 cambios de tempo**:
  - Compases 1-2: 120 BPM (negra = 0.5s)
  - Compases 3-4: 90 BPM (negra = 0.667s)
  - Compases 5-6: 140 BPM (negra = 0.429s)
  - Compases 7-8: 56 BPM (negra = 1.071s)
- **32 notas** colocadas ligeramente fuera de la rejilla (offsets de ±10-50ms)

### Botón de Descarga

En la pantalla inicial, hay un botón:

```
┌─────────────────────────────────────────────┐
│ 📥 Download Test MIDI (with tempo changes)  │
│   Test file with 4 tempo changes:           │
│   120 → 90 → 140 → 56 BPM                 │
└─────────────────────────────────────────────┘
```

## Procedimiento de Prueba

### Paso 1: Descargar el MIDI de prueba

1. Abrir la aplicación
2. Hacer clic en "Download Test MIDI (with tempo changes)"
3. Se descargará `test_tempo_changes.mid`

### Paso 2: Cargar el MIDI de prueba

1. Arrastrar el archivo a la zona de carga o hacer clic para seleccionarlo
2. La aplicación mostrará:
   - 1 pista con 32 notas
   - Tempo inicial: 120 BPM
   - 4 cambios de tempo detectados
   - Compás: 4/4

### Paso 3: Cuantizar con tempo constante

1. Seleccionar la pista
2. Elegir grid: 1/4 (negras)
3. Strength: 100%
4. Hacer clic en "Quantize & Download"

### Paso 4: Verificar el resultado

La aplicación mostrará:

1. **Panel de comparación**:
   - Notas movidas: ~32 (todas)
   - Desplazamiento máximo: variable
   - Desplazamiento promedio: variable

2. **Panel de reporte**:
   - Validación: "Valid MIDI: 1 tracks, 32 notes, X.Xs"
   - Tempo: "Single tempo: 56 BPM at 0.00s" ✅

3. **Advertencia global**:
   - "Tempo set to 56 BPM constant"

### Paso 5: Verificar con software externo

Abrir el archivo descargado en un DAW o editor MIDI:

1. **Ardour / Reaper / Logic Pro**:
   - Importar el MIDI
   - Verificar que el tempo es 56 BPM constante
   - No debe haber cambios de tempo

2. **MuseScore**:
   - Abrir el MIDI
   - Verificar que todas las notas están en la rejilla de negras
   - El tempo debe ser 56 BPM

3. **Análisis manual**:
   - Compás 1: 4 notas en tiempos 0.0, 1.071, 2.143, 3.214s
   - Compás 2: 4 notas en tiempos 4.286, 5.357, 6.429, 7.500s
   - Todas las notas deben estar perfectamente alineadas

## Criterios de Aceptación

✅ **Tempo constante**: El archivo de salida tiene un único tempo de 56 BPM
✅ **Sin cambios de tempo**: No hay eventos de tempo después del tiempo 0
✅ **Relaciones rítmicas preservadas**: Las notas mantienen su posición en la rejilla
✅ **Alturas preservadas**: No se modifican las notas (midi numbers)
✅ **Duraciones proporcionales**: Las duraciones se escalan correctamente al nuevo tempo
✅ **Pistas no seleccionadas intactas**: Solo se modifican las pistas seleccionadas
✅ **Instrumentos preservados**: Program changes y control changes se mantienen
✅ **Verificación automática**: La app verifica que el MIDI tiene un solo tempo

## Casos de Prueba

### Caso 1: MIDI con tempo constante (120 BPM)

**Entrada**: MIDI con 120 BPM constante, notas fuera de rejilla
**Salida esperada**: 
- Tempo: 56 BPM constante
- Notas cuantizadas a la rejilla
- Duraciones escaladas proporcionalmente

### Caso 2: MIDI con múltiples cambios de tempo

**Entrada**: MIDI de prueba con 4 cambios de tempo (120 → 90 → 140 → 56)
**Salida esperada**:
- Tempo: 56 BPM constante (único)
- Notas cuantizadas manteniendo relaciones rítmicas
- Sin cambios de tempo en el archivo de salida

### Caso 3: MIDI con tresillos

**Entrada**: MIDI con tresillos a 120 BPM
**Salida esperada** (con grid 1/8T):
- Tempo: 56 BPM constante
- Tresillos cuantizados a rejilla de tresillos
- Relaciones ternarias preservadas

### Caso 4: Múltiples pistas

**Entrada**: MIDI con 3 pistas, seleccionar solo pista 2
**Salida esperada**:
- Pista 2: cuantizada a 56 BPM
- Pistas 1 y 3: intactas (pero con tempo global de 56 BPM)
- Tempo: 56 BPM constante para todo el archivo

## Limitaciones Conocidas

1. **Tempo de salida fijo**: Actualmente hardcodeado a 56 BPM. En futuras versiones se podría hacer configurable.

2. **Escalado de duraciones**: Las duraciones se escalan proporcionalmente, pero si el tempo original era muy diferente (ej. 200 BPM → 56 BPM), las notas pueden sonar muy lentas.

3. **Pistas no seleccionadas**: Aunque no se cuantizan, su tempo también cambia a 56 BPM porque el tempo es global en MIDI.

4. **Control changes**: No se cuantizan, solo se preservan en su posición temporal original (escalada al nuevo tempo).

## Archivos Modificados

- `src/types.ts`: Añadido `outputTempo` a `QuantizeParams`
- `src/utils/quantizer.ts`: Reescrito para trabajar con posiciones de rejilla
- `src/utils/midi-io.ts`: Implementada estrategia de tempo constante
- `src/utils/test-midi.ts`: Nuevo generador de MIDI de prueba
- `src/App.tsx`: Añadido estado `outputTempo: 56` y manejo de `tempoInfo`
- `src/components/QuantizePanel.tsx`: Añadido indicador de tempo de salida
- `src/components/ReportPanel.tsx`: Añadida visualización de información de tempo
- `src/components/FileLoader.tsx`: Añadido botón de descarga de MIDI de prueba

## Estado

✅ **Implementación completa**
✅ **Compilación exitosa**
✅ **Interfaz actualizada**
✅ **MIDI de prueba disponible**
✅ **Verificación automática implementada**

**Versión**: QUANTIZE.IT - MIDI Quantizer Pro v1.2 (Tempo Constante)
