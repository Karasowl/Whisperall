# Auditoría: Selectores de Modelos - Whisperall

## 1. TODOS LOS MÓDULOS DE LA APLICACIÓN

| # | Módulo | Ruta | Propósito |
|---|--------|------|-----------|
| 1 | **TTS (Home)** | `/` | Text-to-Speech principal |
| 2 | **AI Edit** | `/ai-edit` | Edición de texto con AI |
| 3 | **Audiobook** | `/audiobook` | Generación de audiolibros |
| 4 | **Dictate** | `/dictate` | Dictado con STT |
| 5 | **Dubbing** | `/dubbing` | Doblaje automático de video |
| 6 | **History** | `/history` | Historial de generaciones |
| 7 | **Loopback** | `/loopback` | Transcripción en tiempo real |
| 8 | **Models** | `/models` | Gestión de modelos instalados |
| 9 | **Music** | `/music` | Generación de música con AI |
| 10 | **Reader** | `/reader` | Lector de documentos TTS |
| 11 | **Settings** | `/settings` | Configuración general |
| 12 | **SFX** | `/sfx` | Efectos de sonido para video |
| 13 | **Transcribe** | `/transcribe` | Transcripción de audio/video |
| 14 | **Translate** | `/translate` | Traducción de texto |
| 15 | **Voice Changer** | `/voice-changer` | Cambio de voz Speech-to-Speech |
| 16 | **Voice Isolator** | `/voice-isolator` | Aislamiento de voz |
| 17 | **Voices** | `/voices` | Gestión de voces |

---

## 2. TODOS LOS PROVEEDORES/MODELOS DISPONIBLES

### 2.1 TTS Providers (Local)
- **Chatterbox** - Voice cloning, ~4GB VRAM
- **F5-TTS** - Fast voice cloning
- **Orpheus** - Expressive TTS
- **Kokoro** - Multi-language, preset voices
- **Fish-Speech** - Chinese/English specialty
- **OpenVoice** - Voice cloning
- **Zonos** - Premium quality
- **VibeVoice** - Expressive
- **VoxCPM** - Lightweight
- **Dia** - Dialog synthesis

### 2.2 TTS Providers (API)
- **OpenAI-TTS** - Cloud TTS
- **ElevenLabs** - Premium cloud TTS, voice cloning
- **FishAudio** - Cloud version
- **Cartesia** - Cloud TTS
- **PlayHT** - Cloud TTS
- **SiliconFlow** - Cloud TTS
- **MiniMax** - Cloud TTS
- **Zyphra** - Cloud TTS
- **NariLabs** - Cloud TTS

### 2.3 STT Providers
- **Whisper (local)** - Models: tiny, base, small, medium, large
- **Faster Whisper** - Optimized Whisper
- **OpenAI Whisper API** - Cloud transcription

### 2.4 Music Providers
- **DiffRhythm** - Full song generation with lyrics

### 2.5 SFX Providers
- **MMAudio** - Video-to-audio synthesis

### 2.6 Voice Changer Providers
- **ElevenLabs STS** - Speech-to-speech transformation

### 2.7 Voice Isolator Providers
- **ElevenLabs Audio Isolation** - Cloud-based
- **Demucs** - Local stem separation

### 2.8 Translation Providers
- **Local Translation** - NLLB/M2M models
- **OpenAI Translation** - GPT-based

### 2.9 AI Edit Providers
- **Local LLM** - Ollama, llama.cpp
- **OpenAI** - GPT-4, etc.

### 2.10 Dubbing Providers
- **ElevenLabs Dubbing** - Full auto-dubbing pipeline

---

## 3. ESTADO ACTUAL DE CADA MÓDULO

| Módulo | Selector Usado | ¿UnifiedProviderSelector? | Problema |
|--------|---------------|---------------------------|----------|
| **TTS (Home)** | UnifiedProviderSelector | ✅ SÍ | - |
| **AI Edit** | UnifiedProviderSelector | ✅ SÍ | - |
| **Audiobook** | UnifiedProviderSelector | ✅ SÍ | - |
| **Dictate** | UnifiedProviderSelector | ✅ SÍ | - |
| **Reader** | UnifiedProviderSelector | ✅ SÍ | - |
| **Transcribe** | UnifiedProviderSelector | ✅ SÍ | - |
| **Translate** | UnifiedProviderSelector | ✅ SÍ | - |
| **Music** | ❌ ProviderSelector custom | ❌ NO | Usa componentes separados |
| **SFX** | ❌ Selector inline | ❌ NO | Selector hardcoded en página |
| **Voice Changer** | ❌ Selector inline | ❌ NO | Selector hardcoded en página |
| **Voice Isolator** | ❌ Selector inline | ❌ NO | Selector hardcoded en página |
| **Dubbing** | ❌ Selector inline | ❌ NO | Selector hardcoded en página |
| **Loopback** | N/A (solo dispositivos) | N/A | Sin selector de modelos |
| **History** | N/A (solo visualización) | N/A | - |
| **Models** | N/A (gestión) | N/A | - |
| **Settings** | N/A (configuración) | N/A | - |
| **Voices** | N/A (gestión) | N/A | - |

---

## 4. FUNCIONALIDADES ESPECÍFICAS POR MODELO (UI Adaptativa)

### 4.1 El selector debe saber si el modelo soporta:

| Capacidad | Modelos que la tienen | UI que debe aparecer |
|-----------|----------------------|---------------------|
| **Voice Cloning** | Chatterbox, F5-TTS, ElevenLabs, etc. | Selector de voz clonada + recorder |
| **Preset Voices** | Kokoro, OpenAI-TTS, ElevenLabs | Lista de voces preset con **PREVIEW** |
| **Voice Preview** | ElevenLabs (sample_url) | 🔊 Botón Play para escuchar voz |
| **Temperature** | Chatterbox, F5-TTS | Slider de temperatura |
| **Exaggeration** | Solo Chatterbox | Slider de exageración |
| **CFG Weight** | Chatterbox, Dia | Slider CFG |
| **Speed Control** | OpenAI-TTS, Kokoro | Slider de velocidad |
| **Model Variants** | Todos | Selector de tamaño (small/medium/large) |
| **API Key Required** | Todos los cloud | Indicador + link a Settings |
| **Install Required** | Todos locales | Botón para ir a /models |
| **VRAM Info** | Modelos locales | Badge con GB VRAM |
| **Language Filter** | Kokoro, OpenAI | Filtrado por idioma soportado |

### 4.2 Ejemplo crítico: ElevenLabs

Cuando seleccionas ElevenLabs en TTS, la UI DEBE mostrar:
1. ✅ Lista de voces disponibles en tu cuenta
2. ✅ Botón 🔊 Play para **escuchar preview** de cada voz (`sample_url`)
3. ✅ Sliders: Stability, Similarity Boost, Style
4. ✅ Selector de modelo (eleven_multilingual_v2, eleven_turbo_v2, etc.)
5. ✅ Indicador de uso/cuota restante

**¿Está implementado?** → Parcialmente. Falta verificar que el preview de voz funcione.

---

## 5. ServiceType ACTUAL

```typescript
export type ServiceType = 'tts' | 'stt' | 'ai_edit' | 'translation';
```

**FALTANTES:**
- ❌ `'music'`
- ❌ `'sfx'`
- ❌ `'voice_changer'`
- ❌ `'voice_isolator'`
- ❌ `'dubbing'`

---

## 6. PLAN DE ACCIÓN

### Fase 1: Extender ServiceType
```typescript
export type ServiceType = 
  | 'tts' 
  | 'stt' 
  | 'ai_edit' 
  | 'translation'
  | 'music'
  | 'sfx'
  | 'voice_changer'
  | 'voice_isolator'
  | 'dubbing';
```

### Fase 2: Migrar módulos a UnifiedProviderSelector

1. **Music** → Usar UnifiedProviderSelector con `service="music"`
2. **SFX** → Usar UnifiedProviderSelector con `service="sfx"`
3. **Voice Changer** → Usar UnifiedProviderSelector con `service="voice_changer"`
4. **Voice Isolator** → Usar UnifiedProviderSelector con `service="voice_isolator"`
5. **Dubbing** → Usar UnifiedProviderSelector con `service="dubbing"`

### Fase 3: Adaptar UI por modelo seleccionado

Para cada módulo, cuando se selecciona un proveedor:
- Mostrar controles específicos del modelo
- Mostrar preview de voces cuando aplique
- Mostrar opciones avanzadas según capacidades

---

## 7. ARCHIVOS A MODIFICAR

1. `src/lib/api.ts` - Extender ServiceType, unificar tipos de Provider
2. `src/components/UnifiedProviderSelector.tsx` - Añadir casos para nuevos services
3. `src/app/music/page.tsx` - Migrar a UnifiedProviderSelector
4. `src/app/sfx/page.tsx` - Migrar a UnifiedProviderSelector
5. `src/app/voice-changer/page.tsx` - Migrar a UnifiedProviderSelector
6. `src/app/voice-isolator/page.tsx` - Migrar a UnifiedProviderSelector
7. `src/app/dubbing/page.tsx` - Migrar a UnifiedProviderSelector

**Componentes a eliminar después:**
- `src/components/ProviderSelector.tsx` (si solo lo usaba music)
- `src/components/ProviderModelSelector.tsx` (si se unifica)
- `src/components/ServiceProviderSelector.tsx` (redundante)

---

## 8. VERIFICACIÓN DE FUNCIONALIDADES FALTANTES

### 8.1 Preview de voz ElevenLabs - ¿Funciona?
- [ ] Verificar que `TTSPresetVoice.sample_url` se muestra
- [ ] Verificar que hay botón Play en la lista de voces
- [ ] Implementar reproductor inline

### 8.2 Controles adaptativos por modelo
- [ ] Chatterbox muestra: Temperature, Exaggeration, CFG
- [ ] Kokoro muestra: Speed, lista de preset voices
- [ ] ElevenLabs muestra: Stability, Similarity, Style, Voice Preview
- [ ] OpenAI-TTS muestra: Speed, Voice (alloy, echo, fable, onyx, nova, shimmer)

---

## PRIORIDAD DE IMPLEMENTACIÓN

1. **P1 CRÍTICO**: Migrar Music a UnifiedProviderSelector (ya roto)
2. **P2 ALTO**: Añadir preview de voces para ElevenLabs
3. **P3 MEDIO**: Migrar SFX, Voice Changer, Voice Isolator, Dubbing
4. **P4 BAJO**: Eliminar componentes redundantes
