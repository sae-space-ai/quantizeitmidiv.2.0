# Sistema de Etapas Musicales - QUANTIZE.IT

## Fundamento Musical

Este sistema implementa el procesamiento musical por etapas siguiendo los criterios del **Prof. Manuel Gago Fernández**:

> "La precisión rítmica debe servir a la intención musical. Pulso, compás, acentos, articulación, fraseo, respiraciones y silencios tienen significado."

### Principios Clave

1. **La rejilla no es arte**: Ajustar notas a una rejilla no demuestra por sí solo una mejora artística
2. **Decisión del músico**: La persona música decide sobre las transformaciones expresivas
3. **Transparencia total**: Cada cambio puede verse, escucharse, compararse, deshacerse y reconstruirse
4. **Preservación del original**: El archivo original se conserva; cada resultado es una versión nueva
5. **IA como asistente**: La IA propone y explica; no presume conocer la intención del compositor

## Las 4 Etapas de Procesamiento

### Etapa 1: Base Rítmica Perfecta

**Objetivo**: Establecer la referencia temporal común para todas las pistas.

**Análisis**:
- Identificación de compás, pulsos y subdivisiones
- Detección de ataques, silencios y patrones rítmicos
- Cálculo de rejilla basado en PPQ real (4 posiciones por pulso de negra = 16 por compás en 4/4)
- Adaptación automática a cambios de compás

**Criterios de validación**:
- Coherencia con la rejilla seleccionada
- Conservación de silencios deliberados
- No invención de percusión
- Identificación de posibles errores rítmicos

**Importante**: "Perfecta" significa coherente con la rejilla y criterios seleccionados, NO significa borrar automáticamente swing, rubato o intención expresiva.

### Etapa 2: Base Armónica y Bajos

**Objetivo**: Analizar bajo e instrumentos armónicos con la referencia rítmica ya validada.

**Análisis**:
- Conservación de fundamentales, alturas e inversiones
- Preservación de acordes auténticos y duración armónica
- Detección de colisiones temporales y solapamientos indebidos
- Coordinación de bajo, armonía y base rítmica

**Criterios de validación**:
- No rearmonización automática
- No desplazamiento del bajo a otro pulso por iniciativa propia
- Señalización de incompatibilidades armónicas como sugerencias
- Verificación de coordinación antes de avanzar

### Etapa 3: Cuerda y Madera

**Objetivo**: Procesar familias de cuerda y madera, pista por pista y voz por voz.

**Análisis**:
- Respeto de melodías, contrapunto, entradas y silencios
- Conservación de fraseo, articulación y notas sostenidas
- Preservación de respiraciones musicales (maderas)
- Conservación de polifonía real y notas que cruzan pulsos/compases (cuerda)

**Criterios de validación**:
- Distinción entre pistas monofónicas y polifónicas basada en evidencia (no solo nombre)
- Comparación con base rítmica y armónica aprobadas
- No alteración oculta de las bases validadas

### Etapa 4: Trompetas (Metales)

**Objetivo**: Procesar trompetas en último lugar dentro de la secuencia.

**Análisis**:
- Comprobación de ataques, entradas y duraciones
- Verificación de silencios y acentos
- Coordinación con bajo, armonía, cuerda, madera y percusión
- Conservación de alturas y articulaciones

**Criterios de validación**:
- Señalización de ataques imposibles
- Identificación de pasajes que requieren revisión
- No reescritura de la parte por cuenta propia

## Implementación Técnica

### Arquitectura

```
src/utils/musical-stages.ts
├── detectInstrumentFamily()     # Clasificación por evidencia musical
├── analyzeRhythmicBase()        # Etapa 1
├── analyzeHarmonicBase()        # Etapa 2
├── analyzeStringsWoodwinds()    # Etapa 3
├── analyzeBrass()               # Etapa 4
└── runAllStages()               # Orquestación completa

src/components/MusicalStagesPanel.tsx
├── Stage cards (4 etapas)
├── Suggestion items
├── Validation controls
└── Status indicators
```

### Detección de Familias Instrumentales

El sistema usa múltiples heurísticas, no solo el nombre de la pista:

1. **Nombre de pista**: drum, bass, piano, violin, clarinet, trumpet, etc.
2. **Rango MIDI**: 
   - Bajo: MIDI 28-55 (E1-G3)
   - Metales: MIDI >55 con pistas monofónicas
3. **Polifonía**: 
   - Acordes → instrumento armónico
   - Monofónico → melodía o bajo
4. **Contexto musical**: Posición en la mezcla, densidad rítmica

### Sistema de Sugerencias

Cada sugerencia incluye:
- **ID único**: Para trazabilidad
- **Etapa**: En qué etapa se detectó
- **Pista**: Índice de la pista afectada
- **Tipo**: rhythm, harmony, articulation, coordination, impossible
- **Severidad**: info, warning, critical
- **Título y descripción**: Claros y concisos
- **Explicación**: Contexto musical y razón de la sugerencia
- **Confianza**: 0.0 a 1.0 (qué tan seguro está el análisis)
- **Auto-fix**: Si se puede corregir automáticamente

### Validación por Etapa

El músico puede:
1. **Revisar** las sugerencias de cada etapa
2. **Validar** la etapa cuando esté conforme
3. **Retroceder** a etapas anteriores sin perder trabajo
4. **Resetear** todo el análisis y empezar de nuevo

### Estados del Sistema

```
idle → analyzing → [rhythmic-base, harmonic-base, strings-woodwinds, brass] → validated
                                                     ↓
                                              requires-review
                                                     ↓
                                                   error
```

## Flujo de Trabajo Musical

### 1. Carga del MIDI
- El archivo original se preserva intacto
- Se analiza PPQ, pistas, canales, programas, tempo, compás

### 2. Análisis por Etapas
- Se ejecutan las 4 etapas en orden
- Cada etapa genera sugerencias (no impone cambios)
- El músico revisa y valida cada etapa

### 3. Cuantización (Opcional)
- Solo después de validar las etapas musicales
- Se aplica la rejilla seleccionada
- Se genera nuevo MIDI con tempo 56 BPM (si está configurado)

### 4. Verificación
- Tests binarios validan el MIDI resultante
- Comparación antes/después
- El músico decide si acepta el resultado

### 5. Exportación
- MIDI cuantizado (si se aplicó)
- MusicXML (para notación)
- El original siempre está disponible

## Diferencias con Otros Sistemas

### vs. Cuantización Automática

**Cuantización automática tradicional**:
- Aplica rejilla ciegamente
- No distingue intención musical
- Puede destruir swing, rubato, fraseo
- No explica qué hace ni por qué

**QUANTIZE.IT con etapas musicales**:
- Analiza antes de transformar
- Explica cada sugerencia
- Preserva intención expresiva
- El músico decide en cada paso

### vs. IA Generativa

**IA generativa**:
- "Adivina" la intención del compositor
- Puede inventar notas, acordes, estructuras
- Opaca sobre su proceso de decisión
- Difícil de auditar o corregir

**QUANTIZE.IT**:
- Analiza lo que hay, no inventa
- Explica cada sugerencia con evidencia
- Transparencia total del proceso
- El músico mantiene control total

## Casos de Uso

### Caso 1: Grabación con timing imperfecto
1. Cargar MIDI de la grabación
2. Analizar etapas musicales
3. Revisar sugerencias de la etapa rítmica
4. Validar solo las correcciones deseadas
5. Cuantizar con strength 70% (preserva algo de swing natural)
6. Exportar MIDI cuantizado

### Caso 2: Arreglo orquestal
1. Cargar MIDI con múltiples pistas
2. Analizar todas las etapas
3. Validar base rítmica y armónica
4. Revisar sugerencias de cuerda/madera
5. Verificar coordinación de trompetas
6. Cuantizar selectivamente por familia
7. Exportar MusicXML para revisión en notación

### Caso 3: Transcripción de audio
1. Cargar audio (WAV/MP3)
2. Transcribir a MIDI (estimación)
3. Editar notas en el piano roll
4. Analizar etapas musicales
5. Validar y corregir problemas detectados
6. Cuantizar si es necesario
7. Exportar MIDI y MusicXML

## Limitaciones Conocidas

### Lo que el sistema NO hace:
- ❌ No rearmoniza automáticamente
- ❌ No inventa notas o acordes
- ❌ No decide por el músico
- ❌ No borra swing/rubato sin permiso
- ❌ No distingue composición de interpretación
- ❌ No reemplaza el criterio musical humano

### Lo que el sistema SÍ hace:
- ✅ Analiza estructura rítmica y armónica
- ✅ Detecta posibles errores y los señala
- ✅ Explica cada sugerencia con contexto
- ✅ Preserva el original en todo momento
- ✅ Permite validación por etapas
- ✅ Mantiene transparencia total

## Próximas Mejoras

### Corto Plazo
- [ ] Playback de sugerencias (escuchar antes/después)
- [ ] Edición visual de sugerencias en piano roll
- [ ] Export de reporte de análisis (PDF/HTML)
- [ ] Presets de análisis por género musical

### Mediano Plazo
- [ ] Detección de forma musical (AABA, verso/coro, etc.)
- [ ] Análisis de dinámica y fraseo
- [ ] Sugerencias de articulación basadas en contexto
- [ ] Integración con partitura (MusicXML bidireccional)

### Largo Plazo
- [ ] Análisis de estilo y período histórico
- [ ] Sugerencias de orquestación
- [ ] Detección de errores de notación convencionales
- [ ] Export a formatos de DAW (Ableton, Logic, etc.)

## Referencias

### Criterios Musicales
- Prof. Manuel Gago Fernández: "La precisión rítmica debe servir a la intención musical"
- Principios de notación musical estándar (SMuFL, MusicXML)
- Prácticas de edición musical profesional

### Implementación Técnica
- MIDI Specification (MIDI 1.0, 2.0)
- MusicXML 3.1 Specification
- Web Audio API
- IndexedDB para almacenamiento local

## Conclusión

QUANTIZE.IT no es solo una herramienta de cuantización. Es un **asistente de análisis musical** que respeta la intención del compositor, proporciona transparencia total y mantiene al músico en control de cada decisión.

Las 4 etapas de procesamiento aseguran que el análisis musical sea completo y coherente, mientras que el sistema de sugerencias permite al músico tomar decisiones informadas sin perder el contexto artístico.

---

**Versión**: 1.0  
**Última actualización**: 2024  
**Estado**: Implementado y funcional
