# QUANTIZE.IT - MIDI Quantizer Pro v2.0

Herramienta profesional de cuantización MIDI con motor basado en ticks, base de datos local, asistente IA heurístico y procesamiento asíncrono.

## 🎯 Características Principales

### Motor de Cuantización Tick-Based
- **Precisión absoluta**: Trabaja directamente con ticks MIDI (no milisegundos)
- **Tempo constante**: Exporta siempre a 56 BPM con un único evento de tempo
- **Soporte completo**: Todos los grids (1/4, 1/8, 1/16, 1/32, tripletes)
- **Time signatures**: Respeta cambios de compás dinámicamente
- **Preservación rítmica**: Mantiene posiciones musicales originales en pulsos

### Base de Datos Local (IndexedDB)
- **Almacenamiento de proyectos**: Guarda archivos MIDI como blobs (no en tablas)
- **Historial de configuraciones**: Presets de cuantización reutilizables
- **Seguridad**: Todo se procesa localmente, sin enviar datos a servidores
- **Esquema versionado**: Migraciones automáticas

### Asistente IA Heurístico
- **Análisis local**: Detección de errores rítmicos, notas próximas, problemas de articulación
- **Sin ML**: Usa reglas heurísticas, no redes neuronales
- **No entrena con tus datos**: Tu música nunca se usa para entrenamiento
- **Sugerencias aprobables**: Cada cambio requiere tu confirmación explícita
- **Proveedor sustituible**: Interfaz para integrar APIs remotas (requiere configuración)

### Procesamiento Asíncrono
- **No bloquea la UI**: Chunked async processing con yield al main thread
- **Barra de progreso**: Feedback visual en tiempo real
- **Cancelación**: Detén operaciones largas en cualquier momento
- **Métricas de rendimiento**: Tiempos de parseo, análisis, cuantización y exportación

### Verificación Binaria
- **11 tests automáticos**: Valida integridad del MIDI exportado
- **PPQ y tempo**: Confirma que el archivo tiene el tempo correcto
- **Orden de notas**: Verifica que no hay notas desordenadas
- **Duraciones válidas**: Detecta notas con duración cero o negativa
- **Re-leíble**: Confirma que el MIDI se puede volver a abrir

## 📦 Instalación

```bash
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

## 🚀 Uso

### 1. Cargar Archivo MIDI
- Arrastra un archivo `.mid` o `.midi` a la zona de carga
- O haz clic para seleccionar desde el explorador de archivos
- La aplicación analiza automáticamente: pistas, tempo, time signature, PPQ

### 2. Seleccionar Pistas
- Marca las pistas que quieres cuantizar
- El sistema detecta automáticamente si son monofónicas o polifónicas
- Las pistas monofónicas evitan solapamientos automáticamente

### 3. Configurar Parámetros
- **Grid**: 1/4, 1/8, 1/16, 1/32, o tripletes (1/4T, 1/8T, 1/16T)
- **Strength**: 0-100% (0 = sin cambios, 100 = cuantización total)
- **Swing**: 0-100% (desplaza notas impares para groove)
- **Humanize**: 0-50 ticks (variación aleatoria)
- **Quantize Starts/Ends**: Cuantiza inicios, finales, o ambos
- **Preserve Velocity**: Mantiene la dinámica original

### 4. Cuantizar y Descargar
- Haz clic en "Quantize & Download"
- La barra de progreso muestra el avance
- Puedes cancelar en cualquier momento
- El archivo se descarga automáticamente como `nombre_q16_s85.mid`

### 5. Revisar Resultados
- **Comparación antes/después**: Notas movidas, desplazamiento máximo/promedio
- **Reporte detallado**: Estadísticas por pista
- **Tests binarios**: 11 validaciones automáticas
- **Verificación de tempo**: Confirma que el archivo tiene 56 BPM constante

### 6. Asistente IA (Opcional)
- Haz clic en "Analyze" para obtener sugerencias musicales
- Revisa cada sugerencia con explicación detallada
- Acepta o rechaza individualmente
- Las sugerencias NO se aplican automáticamente

### 7. Guardar Proyecto
- Haz clic en "Save Project" para guardar en IndexedDB
- Incluye archivos de entrada y salida
- Recupera proyectos anteriores desde el panel lateral

## 🏗️ Arquitectura

### Módulos Principales

```
src/
├── utils/
│   ├── binary-midi.ts       # Parser/escritor binario MIDI
│   ├── tick-quantizer.ts    # Motor de cuantización en ticks
│   ├── midi-io.ts           # Orquestador de I/O
│   ├── binary-tests.ts      # Suite de 11 tests binarios
│   ├── database.ts          # Capa de IndexedDB
│   ├── ai-provider.ts       # Asistente IA heurístico
│   ├── worker-utils.ts      # Utilidades para procesamiento async
│   └── worker-wrapper.ts    # Wrapper con progreso y cancelación
├── components/
│   ├── FileLoader.tsx       # Carga de archivos con drag & drop
│   ├── TrackSelector.tsx    # Selección múltiple de pistas
│   ├── QuantizePanel.tsx    # Panel de parámetros
│   ├── ComparisonView.tsx   # Vista antes/después
│   ├── ReportPanel.tsx      # Reporte detallado
│   ├── BinaryTestPanel.tsx  # Resultados de tests binarios
│   ├── ProgressBar.tsx      # Barra de progreso
│   ├── AiAssistantPanel.tsx # Panel de sugerencias IA
│   └── ProjectManager.tsx   # Gestión de proyectos
└── App.tsx                  # Componente principal
```

### Flujo de Datos

```
Archivo MIDI (.mid)
    ↓
parseMidiBinary() → Eventos en ticks
    ↓
Analizar pistas, tempo, time signatures
    ↓
Para cada pista seleccionada:
  ├─ Obtener time signature en startTick
  ├─ Calcular gridSize desde PPQ + grid
  ├─ Cuantizar startTick (y endTick si activado)
  ├─ Aplicar strength, swing, humanize
  └─ Manejar pistas monofónicas (evitar solapamientos)
    ↓
Reemplazar tempos → Único 56 BPM en tick 0
    ↓
writeMidiBinary() → Uint8Array
    ↓
Verificar con 11 tests binarios
    ↓
Blob MIDI descargable
```

## 🧪 Tests Binarios

Después de cada cuantización, se ejecutan automáticamente 11 tests:

1. **PPQ**: Verifica que el PPQ coincide con el original
2. **Tempo único**: Confirma que hay exactamente un evento de tempo
3. **Tempo en tick 0**: Valida que el tempo está al inicio
4. **Time signatures**: Verifica que los compases se preservan
5. **Grid size**: Comprueba que el tamaño de rejilla es correcto
6. **Posiciones por compás**: Valida 16 posiciones para 4/4 con 1/16
7. **Orden de notas**: Verifica orden cronológico
8. **Duraciones válidas**: Confirma duraciones positivas
9. **Sin ticks negativos**: Valida que no hay valores negativos
10. **Notas en rejilla**: Comprueba que ≥95% de notas están cuantizadas
11. **Re-leíble**: Verifica que el MIDI se puede volver a abrir

## 💾 Base de Datos

### Esquema IndexedDB

**Object Stores:**
- `projects`: Metadatos de proyectos
- `files`: Blobs de archivos MIDI (entrada/salida)
- `configurations`: Presets de cuantización
- `history`: Historial de procesamiento
- `ai_suggestions`: Registro de sugerencias IA

### Seguridad
- **Todo es local**: No se envían datos a servidores
- **Archivos como blobs**: No se almacenan como strings en tablas
- **Sin autenticación**: No hay credenciales expuestas
- **Consentimiento**: La IA no entrena con tus archivos

## 🤖 Asistente IA

### Análisis Heurístico Local

El asistente detecta:

1. **Errores rítmicos**: Notas significativamente fuera de la rejilla (>20% del grid size)
2. **Notas próximas**: Notas duplicadas o muy cercanas (<10% del grid size)
3. **Articulación**: Patrones staccato/legato inusuales
4. **Anomalías de velocidad**: Velocidades inusualmente altas o bajas
5. **Anomalías de duración**: Notas muy largas o con duración cero

### Características
- **No modifica automáticamente**: Cada sugerencia requiere aprobación
- **Explicaciones detalladas**: Cada sugerencia incluye contexto musical
- **Comparación antes/después**: Muestra datos originales y propuestos
- **Confianza**: Cada sugerencia tiene un score de confianza (0-100%)
- **Registro**: Se guarda qué sugerencias fueron aceptadas/rechazadas

### Proveedor Remoto (Futuro)
La interfaz está diseñada para integrar APIs remotas:
- Requiere configuración de API key en servidor
- Nunca expone credenciales en el navegador
- Proxy a través de backend para seguridad

## ⚡ Rendimiento

### Optimizaciones
- **Chunked async**: Yield al main thread entre pistas
- **Importación dinámica**: Carga módulos solo cuando se necesitan
- **Sin bloqueos**: UI responde durante el procesamiento
- **Cancelación**: Detén operaciones largas sin perder trabajo

### Métricas
La aplicación mide:
- Tiempo de parseo
- Tiempo de análisis
- Tiempo de cuantización
- Tiempo de exportación
- Tiempo total
- Tamaño de archivo
- Número de pistas y notas

## 🔧 Configuración

### Variables de Entorno (Futuro)

Para habilitar proveedor IA remoto:

```env
VITE_AI_PROVIDER=openai
VITE_AI_ENDPOINT=https://api.example.com/analyze
# API key debe configurarse en el servidor, NO en el cliente
```

### Presets Personalizados

Puedes crear presets de cuantización:
1. Configura los parámetros deseados
2. Haz clic en "Save Configuration"
3. Asigna un nombre al preset
4. Recupéralo desde el panel de configuraciones

## 📊 Casos de Uso

### Caso 1: Cuantización Perfecta
- Grid: 1/16
- Strength: 100%
- Swing: 0%
- Resultado: Todas las notas perfectamente alineadas a semicorcheas

### Caso 2: Groove con Swing
- Grid: 1/16
- Strength: 85%
- Swing: 20%
- Resultado: Cuantización con feel de shuffle

### Caso 3: Humanización
- Grid: 1/16
- Strength: 70%
- Humanize: 5 ticks
- Resultado: Cuantización suave con variación natural

### Caso 4: Tresillos
- Grid: 1/8T
- Strength: 90%
- Resultado: Cuantización a tresillos de corchea

### Caso 5: Cambio de Compás
- Archivo con 4/4 → 3/4 → 6/8
- Grid: 1/16
- Resultado: Rejilla se recalcula en cada cambio de compás

## 🐛 Troubleshooting

### "MIDI verification failed"
- El archivo exportado no pasa los tests binarios
- Posibles causas: archivo corrupto, tempo inválido, notas con duración cero
- Solución: Revisa el reporte de tests para identificar el problema específico

### "No tempo events found"
- El archivo original no tiene eventos de tempo
- QUANTIZE.IT añade automáticamente un tempo de 56 BPM
- Esto es esperado y correcto

### "Track has no notes"
- La pista seleccionada está vacía
- Selecciona otra pista o verifica que el archivo MIDI tiene contenido

### "Web Worker not available"
- El navegador no soporta Web Workers
- La aplicación usa procesamiento async en el main thread como fallback
- El rendimiento puede ser ligeramente menor, pero la funcionalidad es completa

## 📝 Licencia

MIT License - Ver archivo LICENSE para detalles.

## 🙏 Créditos

Desarrollado con:
- React + TypeScript
- Vite
- Tailwind CSS
- @tonejs/midi (para UI)
- midi-file (para parsing binario)
- IndexedDB (para almacenamiento local)

## 🔄 Changelog

### v2.0 (Actual)
- ✅ Motor tick-based con precisión absoluta
- ✅ Base de datos IndexedDB para proyectos
- ✅ Asistente IA heurístico local
- ✅ Procesamiento async con progreso y cancelación
- ✅ Suite de 11 tests binarios
- ✅ Tempo constante de 56 BPM garantizado
- ✅ Soporte completo para time signatures
- ✅ Detección automática mono/poli
- ✅ Preservación de relaciones rítmicas

### v1.3
- Motor tick-based inicial
- Tests binarios básicos

### v1.2
- Tempo constante de 56 BPM
- Verificación post-exportación

### v1.1
- Multi-track selection
- Before/after comparison
- Downloadable report

### v1.0
- Cuantización MIDI básica
- Interfaz web

---

**QUANTIZE.IT** - Cuantización MIDI profesional con precisión de reloj suizo. 🎹⏱️
