# Guía de Modelos IA y APIs para Whisperall

**Text-to-Speech • Speech-to-Text • LLMs • Música • Traducción • SFX • Doblaje**

Documento de referencia 2025-2026 | Providers implementados, configuración y precios

---

## Resumen Ejecutivo

Este documento detalla los **providers implementados en Whisperall** para cada módulo, incluyendo tanto opciones locales (gratuitas, requieren GPU) como APIs comerciales (requieren API key).

### Hallazgos Clave

| Módulo | Local Gratis | API Más Económica | API Premium |
|--------|--------------|-------------------|-------------|
| **TTS** | Chatterbox, Kokoro, F5-TTS | DeepInfra ($0.80/M) | ElevenLabs |
| **STT** | Faster-Whisper | Groq ($0.04/hora), DeepInfra (~$0.10/h) | ElevenLabs Scribe |
| **AI Edit** | Ollama (local) | DeepInfra ($0.03/M), DeepSeek ($0.07/M) | Claude, GPT-4o |
| **Música** | DiffRhythm, ACE-Step, YuE | Suno/Udio Free | Suno Pro, ElevenLabs |
| **SFX** | MMAudio | - | ElevenLabs |
| **Traducción** | Argos Translate | DeepSeek via LLM | DeepL |

---

## 1. Matriz de Providers por Módulo

### Providers Implementados en Whisperall

| Provider | TTS | STT | AI Edit | Traducción | Música | SFX | Doblaje |
|----------|-----|-----|---------|------------|--------|-----|---------|
| **Locales** |
| Chatterbox | ✅ | - | - | - | - | - | - |
| F5-TTS | ✅ | - | - | - | - | - | - |
| Orpheus | ✅ | - | - | - | - | - | - |
| Kokoro | ✅ | - | - | - | - | - | - |
| Fish-Speech | ✅ | - | - | - | - | - | - |
| OpenVoice | ✅ | - | - | - | - | - | - |
| Zonos | ✅ | - | - | - | - | - | - |
| VibeVoice | ✅ | - | - | - | - | - | - |
| VoxCPM | ✅ | - | - | - | - | - | - |
| Dia | ✅ | - | - | - | - | - | - |
| Faster-Whisper | - | ✅ | - | - | - | - | - |
| Ollama | - | - | ✅ | - | - | - | - |
| DiffRhythm | - | - | - | - | ✅ | - | - |
| MMAudio | - | - | - | - | - | ✅ | - |
| Argos | - | - | - | ✅ | - | - | - |
| **APIs** |
| OpenAI | ✅ | ✅ | ✅ | - | - | - | - |
| ElevenLabs | ✅ | ✅ | - | - | 🔄 | ✅ | ✅ |
| Groq | - | ✅ | - | - | - | - | - |
| Deepgram | - | ✅ | - | - | - | - | - |
| Claude | - | - | ✅ | - | - | - | - |
| Gemini | - | - | ✅ | - | - | - | - |
| DeepSeek | - | - | ✅ | ✅ | - | - | - |
| DeepInfra | ✅ | ✅ | ✅ | - | - | - | - |
| Zhipu (GLM) | - | - | ✅ | ✅ | - | - | - |
| Moonshot | - | - | ✅ | - | - | - | - |
| MiniMax | ✅ | - | ✅ | - | - | - | - |
| Fish Audio | ✅ | - | - | - | - | - | - |
| Cartesia | ✅ | - | - | - | - | - | - |
| PlayHT | ✅ | - | - | - | - | - | - |
| SiliconFlow | ✅ | - | - | - | - | - | - |
| Zyphra | ✅ | - | - | - | - | - | - |
| Nari Labs | ✅ | - | - | - | - | - | - |
| DeepL | - | - | - | ✅ | - | - | - |
| Google | - | - | - | ✅ | - | - | - |

**Leyenda:** ✅ Implementado | 🔄 SDK disponible (no implementado)

---

## 2. Text-to-Speech (TTS)

Whisperall soporta **20 providers de TTS**: 10 locales y 10 APIs.

### 2.1 Modelos Locales (Gratis)

Requieren GPU. El modelo se descarga desde la página "Models" de la app.

| Provider ID | Modelo | VRAM | Latencia | Idiomas | Características |
|-------------|--------|------|----------|---------|-----------------|
| `chatterbox` | Chatterbox 0.5B | 4-6GB | ~150ms | 23 | Zero-shot cloning, control emocional, **modelo por defecto** |
| `f5-tts` | F5-TTS 335M | 4-8GB | 100-200ms | EN/ZH/ES | Flow matching, RTF 0.15, **mejor para español** |
| `orpheus` | Orpheus 3B | 6-12GB | ~200ms | 8 | Llama backbone, 24 voces, streaming |
| `kokoro` | Kokoro 82M | 1-2GB | ~300ms | 8 | **Ultra-eficiente**, 54 voces |
| `fish-speech` | Fish-Speech 500M | 8-12GB | ~150ms | 13 | 1M+ horas entrenamiento, 22+ emociones |
| `openvoice` | OpenVoice V2 | 4-6GB | Bajo | 6+ | Clonación cross-lingual |
| `zonos` | Zonos 1.6B | 6GB+ | ~150ms | 6 | 44kHz alta fidelidad |
| `vibevoice` | VibeVoice 0.5B-1.5B | 2-8GB | ~300ms | EN | Real-time streaming, hasta 90 min |
| `voxcpm` | VoxCPM 800M | 4-6GB | RTF 0.17 | EN/ZH | Tokenizer-free, 44.1kHz |
| `dia` | Dia 1.6B | 7-10GB | ~40 tok/s | EN | Diálogos multi-speaker, non-verbal |

#### Variantes de Modelo por Provider

**Chatterbox:**
- `multilingual` - 23 idiomas (default)
- `original` - Solo inglés, primera versión
- `turbo` - GPT-2 backbone, más rápido

**F5-TTS:**
- `F5TTS_v1_Base` - Base EN/ZH
- `F5-Spanish` - Fine-tuned español (218h)
- `E2TTS_Base` - Variante E2

### 2.2 APIs de TTS

Requieren API key configurada en Settings.

| Provider ID | Modelos | Precio | Latencia | Idiomas | Consola |
|-------------|---------|--------|----------|---------|---------|
| `openai-tts` | tts-1, tts-1-hd | $15-30/M chars | Baja | 13 voces | [OpenAI](https://platform.openai.com/api-keys) |
| `elevenlabs` | Multilingual v2, Turbo v2.5, Flash, v3 | $0.09-0.30/1K | 75ms+ | 70+ | [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) |
| `deepinfra` | Kokoro, Chatterbox, Orpheus, Zonos | **$0.80/M chars** | ~100ms | 23+ | [DeepInfra](https://deepinfra.com/dash/api_keys) |
| `fishaudio` | Fish Audio | $15/M UTF-8 | ~150ms | 8+ | [Fish Audio](https://fish.audio/app/api-keys/) |
| `cartesia` | Sonic-3, Sonic-Turbo | $0.03/1K chars | 40-90ms | 27 | [Cartesia](https://play.cartesia.ai/console) |
| `playht` | PlayHT 2.0 | $0.49/M chars+ | <800ms | 142 | [PlayHT](https://play.ht/studio) |
| `siliconflow` | CosyVoice2 | $7.15/M UTF-8 | 150ms | Multi | [SiliconFlow](https://cloud.siliconflow.cn/account/ak) |
| `minimax` | Speech-02 | $0.05/1K chars | Estándar | 30+ | [MiniMax](https://platform.minimax.io/user-center/basic-information) |
| `zyphra` | Zonos API | $0.02/min | Estándar | 6 | [Zyphra](https://www.zyphra.com/dashboard) |
| `narilabs` | Dia API | $0.04/1K chars | Real-time | EN | [Nari Labs](https://nari.ai/dashboard) |

### 2.3 Configuración TTS

```
Settings > Providers > [Provider Name]
```

**Para APIs:** Introducir API key y seleccionar modelo/voz predeterminada.

**Para Locales:** Ir a Models > Descargar el modelo correspondiente.

---

## 3. Speech-to-Text (STT/Transcripción)

Whisperall soporta **6 providers de STT**: 1 local y 5 APIs.

### 3.1 Provider Local

| Provider ID | Modelo | VRAM | Velocidad | Idiomas | Características |
|-------------|--------|------|-----------|---------|-----------------|
| `faster-whisper` | Whisper (varios tamaños) | 2-8GB | 10-50x RT | 100+ | **Por defecto**, offline, privado |

Tamaños disponibles: tiny, base, small, medium, large-v2, large-v3

### 3.2 APIs de STT

| Provider ID | Precio/hora | Velocidad | Idiomas | Consola |
|-------------|-------------|-----------|---------|---------|
| `groq` | **$0.04** | 216x RT | 100+ | [Groq](https://console.groq.com/keys) |
| `deepinfra` | ~$0.10 | Rápida | 100+ | [DeepInfra](https://deepinfra.com/dash/api_keys) |
| `openai` | $0.36 | Estándar | 99+ | [OpenAI](https://platform.openai.com/api-keys) |
| `deepgram` | $0.26-0.46 | Streaming | 36 | [Deepgram](https://console.deepgram.com/signup) |
| `elevenlabs` | $0.22-0.48 | <150ms RT | 90+ | [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) |

### 3.3 Comparativa de Costos STT (por hora de audio)

```
Groq whisper-turbo     $0.04  ████░░░░░░░░░░░░░░░░ (más económico)
ElevenLabs Scribe      $0.22  ████████████░░░░░░░░
Deepgram Nova-2        $0.26  ██████████████░░░░░░
OpenAI Whisper         $0.36  ████████████████████ (referencia)
```

---

## 4. AI Edit (LLMs)

Whisperall soporta **9 providers de AI**: 1 local y 8 APIs.

### 4.1 Provider Local

| Provider ID | Modelos | VRAM | Contexto | Características |
|-------------|---------|------|----------|-----------------|
| `ollama` | Llama 3.2, Mistral, Gemma 2 | 1-43GB | 8K-128K | **Gratis**, privado, múltiples modelos |

Modelos recomendados para Ollama:
- `llama3.2:1b` - 1.3GB VRAM, rápido
- `llama3.2:3b` - 2GB VRAM, function calling
- `llama3.1:8b` - 5GB VRAM, general purpose
- `mistral:7b` - 4.4GB VRAM, Apache 2.0
- `gemma2:9b` - 5.4GB VRAM, eficiente

### 4.2 APIs de AI

| Provider ID | Modelos | Precio (in/out) | Contexto | Consola |
|-------------|---------|-----------------|----------|---------|
| `deepseek` | V3.1, R1 | **$0.07-1.68/M** | 128K | [DeepSeek](https://platform.deepseek.com/api_keys) |
| `deepinfra` | Llama 3.x, Mistral, Qwen, DeepSeek, Gemma+ | **$0.03-0.90/M** | 128K+ | [DeepInfra](https://deepinfra.com/dash/api_keys) |
| `zhipu` | GLM-4.7 | ~$3/mes ilim. | 200K | [Zhipu](https://open.bigmodel.cn/usercenter/apikeys) |
| `openai` | GPT-4o-mini, GPT-4o | $0.15-10/M | 128K | [OpenAI](https://platform.openai.com/api-keys) |
| `claude` | Haiku, Sonnet, Opus | $0.25-75/M | 200K | [Anthropic](https://console.anthropic.com/settings/keys) |
| `gemini` | Flash, Pro | $0.075-5/M | 1M-2M | [Google AI](https://aistudio.google.com/app/apikey) |
| `moonshot` | Kimi K2 | $0.15-2.50/M | 256K | [Moonshot](https://platform.moonshot.ai/console) |
| `minimax` | M2, MiniMax-01 | $0.20-1.20/M | 204K-4M | [MiniMax](https://platform.minimax.io/user-center/basic-information) |

### 4.3 Recomendaciones por Caso de Uso

- **Máxima economía:** DeepSeek ($0.07/M tokens con cache) o DeepInfra Llama 3.1 8B ($0.03/M)
- **Modelos open-source via API:** DeepInfra (Llama, Mistral, Qwen sin gestionar infraestructura)
- **Contexto largo:** MiniMax-01 (4M tokens) o Gemini Pro (2M)
- **Máxima calidad:** Claude Sonnet o GPT-4o
- **Privacidad total:** Ollama con Llama 3.1

---

## 5. Traducción

Whisperall soporta **5 providers de traducción**: 1 local y 4 APIs.

### 5.1 Provider Local

| Provider ID | Idiomas | Características |
|-------------|---------|-----------------|
| `argos` | 23+ pares | **100% offline**, OpenNMT, pivoteo automático |

### 5.2 APIs de Traducción

| Provider ID | Precio | Idiomas | Free Tier | Consola |
|-------------|--------|---------|-----------|---------|
| `deepseek` | $0.07-1.68/M tok | 100+ | Via LLM | [DeepSeek](https://platform.deepseek.com/api_keys) |
| `zhipu` | $0.35-3/M tok | Multi | Via GLM | [Zhipu](https://open.bigmodel.cn/usercenter/apikeys) |
| `deepl` | $25/M chars | 36 | 500K/mes | [DeepL](https://www.deepl.com/account/summary) |
| `google` | $20/M chars | 130+ | 500K/mes | [Google Cloud](https://console.cloud.google.com/apis/credentials) |

> **Nota:** Usar LLMs como DeepSeek para traducción puede ser hasta **800x más económico** que DeepL para volúmenes grandes.

---

## 6. Generación de Música

El mercado de generación musical con IA ha explotado en 2024-2025. Esta sección cubre **TODOS** los modelos disponibles: APIs comerciales y modelos locales open-source.

### 6.1 Resumen del Mercado

| Categoría | Opciones | Mejor Calidad | Más Económico |
|-----------|----------|---------------|---------------|
| **APIs** | 10+ servicios | Suno v5, Udio | Suno Free, Udio Free |
| **Locales** | 8+ modelos | ACE-Step, DiffRhythm | MusicGen (15s), Bark |
| **Híbrido** | ElevenLabs | Eleven Music | - |

### 6.2 APIs Comerciales de Música

#### 6.2.1 Suno AI (Líder del Mercado)

El servicio más popular con 12M+ usuarios. Genera canciones completas con voz desde texto.

| Plan | Precio | Créditos/mes | Canciones aprox. | Uso Comercial |
|------|--------|--------------|------------------|---------------|
| **Free** | $0 | 50/día | ~10/día | ❌ No |
| **Pro** | $10/mes ($8 anual) | 2,500 | ~500 | ✅ Sí |
| **Premier** | $30/mes ($24 anual) | 10,000 | ~2,000 | ✅ Sí |

**Sistema de créditos:**
- ~5 créditos por canción corta
- ~12 créditos por canción completa (hasta 8 min)
- **Sin rollover** - créditos no utilizados se pierden

**API:** ~$0.04/llamada oficial | ~$0.01-0.02 via terceros (SunoAPI, CometAPI)

**Modelo actual:** v4.5 (gratis) | v5 (pagado, enero 2025)

**Consola:** https://suno.com

---

#### 6.2.2 Udio (Favorito de Productores)

Fundado por ex-investigadores de Spotify. Mejor para producción profesional.

| Plan | Precio | Créditos/mes | Canciones aprox. |
|------|--------|--------------|------------------|
| **Free** | $0 | 10/día + 100/mes | ~50 |
| **Standard** | $10/mes | 2,400 | ~1,200 |
| **Pro** | $30/mes | 6,000 | ~3,000 |

**Sistema de créditos:**
- ~2 créditos por canción de 130s
- ~4 créditos por canción extendida
- **Sin rollover**

**Features únicos:**
- ✅ Stems (pistas separadas)
- ✅ Inpainting (regenerar secciones)
- ✅ Remix de canciones existentes
- ✅ Extensiones de 30s

**API:** No oficial. Terceros: ~7-20 créditos/render

**Consola:** https://www.udio.com

---

#### 6.2.3 ElevenLabs Eleven Music

Parte del ecosistema ElevenLabs. **100% datos licenciados** = sin riesgo de copyright.

| Plan | Minutos Incluidos | Costo Adicional |
|------|-------------------|-----------------|
| Free | - | - |
| Starter ($5) | ~11 min | Créditos extra |
| Creator ($22) | ~55 min | ~$0.65-0.80/min |
| Pro ($99) | Variable | Variable |
| Scale ($330) | Variable | ~$0.50/min |

**Sistema:** Créditos basados en (longitud × variantes generadas)

**Ventaja clave:** SDK ya instalado en Whisperall (potencial integración)

**Consola:** https://elevenlabs.io

---

#### 6.2.4 Stable Audio (Stability AI)

Audio de calidad enterprise con datos 100% licenciados.

| Licencia | Precio | Uso |
|----------|--------|-----|
| **Community** | Gratis | Personal, <$1M revenue |
| **Creator** | Por definir | Comercial individual |
| **Enterprise** | Custom | Corporativo |

**Modelo:** Stable Audio 2.5
**Features:** Audio-to-audio, inpainting
**API:** Créditos via platform.stability.ai

---

#### 6.2.5 AIVA (Música Cinematográfica)

Especializado en música instrumental y cinematográfica.

| Plan | Precio | Descargas/mes | Copyright |
|------|--------|---------------|-----------|
| **Free** | $0 | 3 | AIVA |
| **Standard** | €15/mes | 15 | AIVA |
| **Pro** | €49/mes | 300 | **Tuyo** |

**API:** Solo via negociación custom (no pública)

**Consola:** https://www.aiva.ai

---

#### 6.2.6 Mubert (Música Generativa Infinita)

Genera música que nunca se repite. Ideal para fondos y ambient.

| Plan | Precio | Uso |
|------|--------|-----|
| **Ambassador** | $0 | Personal con atribución |
| **Creator** | $14/mes | Contenido social |
| **Pro** | $39/mes | Indie games, ads |
| **Business** | $199/mes | Agencies, apps |

**API:** $49/mes trial, luego tiers superiores
**Duración máxima:** 25 minutos
**Features:** 100+ moods/géneros, nunca repite

**Consola:** https://mubert.com

---

#### 6.2.7 Loudly

Buena opción para volumen alto de tracks.

| Plan | Precio | Creaciones/mes |
|------|--------|----------------|
| **Free** | $0 | Limitado, 30s |
| **Personal** | $8/mes | 900 tracks |
| **Pro** | $24/mes | 3,000 tracks |

**Duración máxima:** 30 min (Pro)
**API:** Custom pricing por volumen

**Consola:** https://www.loudly.com

---

#### 6.2.8 Beatoven.ai

Pay-as-you-go con modelo Maestro de alta calidad.

| Plan | Precio | Cantidad |
|------|--------|----------|
| **Free** | $0 | 10 gen (sin descarga) |
| **Buy Minutes** | $1/min | Pay-as-you-go |
| **15 Min/mes** | $3/mes | 15 min |
| **30 Min/mes** | $10/mes | 30 min |
| **60 Min/mes** | $20/mes | 60 min |

**API:** ~$0.12-0.15/min
**Modelo:** Maestro (agosto 2025) - 44.1kHz
**Features:** Video-to-music, audio-to-music

**Consola:** https://www.beatoven.ai

---

#### 6.2.9 Soundraw

Datos 100% propios = legalmente seguro.

| Plan | Precio | Uso |
|------|--------|-----|
| **Free** | $0 | Sin descargas |
| **Creator** | $11/mes | Ilimitado (BGM) |
| **Artist** | $19-32/mes | Distribución |

**API:** $500/mes
**Ventaja:** Sin riesgo legal, datos propios

**Consola:** https://soundraw.io

---

#### 6.2.10 Mureka

API con buen balance precio/calidad.

| Plan | Precio | Canciones/mes |
|------|--------|---------------|
| **Free** | $0 | Trial |
| **Básico** | $10/mes | 400 |
| **Pro** | $24-30/mes | 1,600 |

**API:** ~$0.12-0.15/min
**Features:** Audio-to-music, video-to-music, stems

**Consola:** https://www.mureka.ai

---

#### 6.2.11 Proveedores Chinos

**Tencent SongGeneration (TME/QQ Music):**
- Integrado en QQ Music
- Modelo LeVo (NeurIPS 2025)
- Open-source en GitHub

**NetEase Cloud Music (Tianyin):**
- 40,000+ composiciones generadas
- Integrado en la plataforma

---

### 6.3 Modelos Locales Open-Source (GRATIS)

#### 6.3.1 DiffRhythm ✅ (Implementado en Whisperall)

Primer modelo de difusión latente para canciones completas.

| Modelo | VRAM | Duración | Licencia |
|--------|------|----------|----------|
| **v1.2-base** | 6GB | 1m 35s | Apache 2.0 |
| **v1.2-full** | 8GB | 4m 45s | Apache 2.0 |

**Generación:** ~10 segundos
**Features:** Lyrics (formato LRC), vocals+instrumentals, 18 géneros
**Instalación:** `pip install diffrhythm`

**GitHub:** https://github.com/ASLP-lab/DiffRhythm

---

#### 6.3.2 ACE-Step (Estado del Arte 2025)

Modelo fundacional de ACE Studio + StepFun. El más rápido y coherente.

| GPU | Velocidad | Duración |
|-----|-----------|----------|
| **A100** | 20s para 4min | 4 min |
| **RTX 4090** | 34x RTF | 4 min |
| **RTX 3090** | 12x RTF | 4 min |
| **CPU offload** | Variable | 8GB RAM mín |

**Licencia:** Apache 2.0
**Idiomas:** 19 (EN, ZH, ES, JA, KO, FR, DE, etc.)
**Features:** Voice cloning, remix, lyric edit, LoRA training

**GitHub:** https://github.com/ace-step/ACE-Step

---

#### 6.3.3 YuE (Alternativa a Suno)

Modelo fundacional para generación lyrics-to-song.

| Configuración | VRAM | Duración |
|---------------|------|----------|
| **Básico (2 sesiones)** | 24GB | ~5 min |
| **Full (4+ sesiones)** | 80GB+ (A100/H800) | Ilimitado |

**Licencia:** Apache 2.0
**Features:** Múltiples idiomas, géneros variados

**GitHub:** https://github.com/multimodal-art-projection/YuE

---

#### 6.3.4 MusicGen / AudioCraft (Meta)

El estándar de referencia de Meta. Limitado a clips cortos.

| Modelo | VRAM | Duración |
|--------|------|----------|
| **small** | 4-8GB | 15s |
| **medium** | 16GB | 15s |
| **large** | 24GB+ | 15s |

**Licencia:** CC-BY-NC 4.0 (no comercial)
**Limitación:** Solo 15 segundos por generación
**Instalación:** `pip install audiocraft`

**GitHub:** https://github.com/facebookresearch/audiocraft

---

#### 6.3.5 Riffusion / FUZZ / Producer.ai

Pionero de spectrogram-to-audio. Evolucionó significativamente.

| Versión | Año | Features |
|---------|-----|----------|
| **Riffusion Original** | 2022 | Spectrograms → audio |
| **FUZZ-1.0** | Abril 2025 | Full songs |
| **FUZZ-2.0 (Producer.ai)** | Julio 2025 | Multi-instrument, conversational |

**Licencia:** MIT (original)

**GitHub:** https://github.com/riffusion/riffusion-hobby

---

#### 6.3.6 Bark (Suno - TTS+)

Modelo TTS que también genera música y efectos de sonido.

| Modelo | VRAM | Duración |
|--------|------|----------|
| **Full** | 8GB+ | ~14s |
| **Small** | 2GB | ~14s |

**Licencia:** MIT (uso comercial permitido)
**Features:** TTS + música + SFX + risas/suspiros
**Limitación:** Solo 14 segundos máximo

**Instalación:** `pip install git+https://github.com/suno-ai/bark.git`

**GitHub:** https://github.com/suno-ai/bark

---

#### 6.3.7 Tencent SongGeneration / LeVo

Modelo open-source de Tencent AI Lab.

| Característica | Valor |
|----------------|-------|
| **Duración** | Hasta 4m 30s |
| **Idiomas** | Chino, Inglés |
| **Licencia** | Open-source |

**Paper:** NeurIPS 2025

**GitHub:** https://github.com/tencent-ailab/SongGeneration

---

#### 6.3.8 Magenta RealTime (Google)

Modelo open-weights de Google DeepMind.

| Característica | Valor |
|----------------|-------|
| **Parámetros** | 800M |
| **Entrenamiento** | 190K horas stock music |
| **Hardware** | Corre en Colab TPU gratis |

**Licencia:** Open-weights

---

### 6.4 Tabla Comparativa de Costos

| Servicio | Costo/Canción | Tipo | Duración Max | Calidad |
|----------|---------------|------|--------------|---------|
| **LOCALES (GRATIS)** |
| ACE-Step | $0 | Local | 4 min | ⭐⭐⭐⭐⭐ |
| DiffRhythm | $0 | Local | 4m45s | ⭐⭐⭐⭐ |
| YuE | $0 | Local | 5 min | ⭐⭐⭐⭐ |
| Tencent LeVo | $0 | Local | 4m30s | ⭐⭐⭐⭐ |
| MusicGen | $0 | Local | 15s | ⭐⭐⭐ |
| Bark | $0 | Local | 14s | ⭐⭐⭐ |
| **APIs** |
| Suno Free | $0 | API | 8 min | ⭐⭐⭐⭐⭐ |
| Udio Free | $0 | API | 2 min | ⭐⭐⭐⭐⭐ |
| Suno Pro | ~$0.02 | API | 8 min | ⭐⭐⭐⭐⭐ |
| Udio Standard | ~$0.008 | API | 4 min | ⭐⭐⭐⭐⭐ |
| Beatoven | $0.12-0.15/min | API | Variable | ⭐⭐⭐⭐ |
| Mureka | $0.12-0.15/min | API | Variable | ⭐⭐⭐⭐ |
| ElevenLabs | $0.65-0.80/min | API | Variable | ⭐⭐⭐⭐ |
| Soundraw | $11+/mes ilim | API | Variable | ⭐⭐⭐⭐ |
| AIVA | €15-49/mes | API | Variable | ⭐⭐⭐⭐ |

### 6.5 Recomendaciones por Caso de Uso

#### Máxima Economía (Stack 100% Gratuito)
| Necesidad | Opción |
|-----------|--------|
| Canciones completas con voz | Suno Free (10/día) o DiffRhythm local |
| Producción profesional | ACE-Step local (requiere GPU) |
| Clips cortos | MusicGen o Bark |

#### Producción Comercial
| Necesidad | Opción |
|-----------|--------|
| Máxima calidad | Suno Pro/Premier o Udio Pro |
| Sin riesgo legal | Soundraw, ElevenLabs Music, o Stable Audio |
| Volumen alto | Loudly Pro (3,000 tracks/mes) |

#### Música de Fondo / Ambient
| Necesidad | Opción |
|-----------|--------|
| Streaming infinito | Mubert |
| Videos/Podcasts | Beatoven.ai |
| Games | Mubert API o Loudly |

### 6.6 Roadmap para Whisperall

**Implementado:**
- ✅ DiffRhythm (local)

**Potencial (SDK disponible en venv):**
- 🔄 ElevenLabs Eleven Music (SDK `elevenlabs/music/` instalado)

**Futuros candidatos:**
- ACE-Step (Apache 2.0, bajo VRAM)
- Bark (MIT, multi-propósito)
- MusicGen (para clips cortos)

---

## 7. Sound Effects (SFX)

Whisperall soporta **2 providers de SFX**: 1 local y 1 API.

### 7.1 Providers

| Provider ID | Tipo | Precio | Características |
|-------------|------|--------|-----------------|
| `mmaudio` | Local | Gratis | Video/texto a audio, 3 tamaños |
| `elevenlabs` | API | $0.02-0.06/gen | 50-55K generaciones/mes según plan |

**MMAudio tamaños:**
- small: 601MB
- medium: ~1.5GB
- large v2: 3.9GB (44.1kHz, **recomendado**)

---

## 8. Doblaje (Dubbing)

Whisperall soporta **1 provider de doblaje** (ElevenLabs API).

### 8.1 ElevenLabs Dubbing

| Plan | Minutos/mes | Precio adicional |
|------|-------------|------------------|
| Starter | 5 min | $0.60/min |
| Creator | 10 min | $0.48/min |
| Pro | 25 min | $0.36/min |
| Scale | 100 min | $0.30/min |

**32+ idiomas soportados** incluyendo: EN, ES, FR, DE, IT, PT, ZH, JA, KO, AR, HI, RU, etc.

Características:
- Detección automática de idioma origen
- Preservación de voces y emociones
- Sincronización automática de labios

---

## 9. ElevenLabs: Estructura Completa de Planes

ElevenLabs es el provider más versátil, cubriendo TTS, STT, SFX y Dubbing.

| Plan | Precio/mes | TTS | STT Incluido | Agents | SFX |
|------|------------|-----|--------------|--------|-----|
| Free | $0 | 10 min | 12.5h | 15 min | 50 gen |
| Starter | $5 | 30 min | 22.5h | 30 min | 150 gen |
| Creator | $22 | 100 min | 62.8h | 100 min | 500 gen |
| Pro | $99 | 500 min | 300h | 500 min | 2,500 gen |
| Scale | $330 | 2,000 min | 1,100h | 2,000 min | 10,000 gen |
| Business | $1,320 | 11,000 min | 6,000h | 11,000 min | 55,000 gen |

### Productos Adicionales

- **Voice Cloning:** Instantáneo incluido desde Starter; Profesional según plan
- **Eleven Music:** 55-2,400 min ($0.65-0.80/min adicional)
- **Image & Video:** 40-44,000 imágenes según plan

---

## 10. DeepInfra: Plataforma Multi-Modelo

DeepInfra es una plataforma de inferencia serverless que hospeda modelos open-source de alta calidad. Una sola API key da acceso a TTS, STT y LLMs.

### 10.1 Modelos TTS Disponibles

| Modelo | ID | Precio | Idiomas | Características |
|--------|-----|--------|---------|-----------------|
| **Kokoro** | `hexgrad/Kokoro-82M` | $0.80/M chars | 8 | Ultra-eficiente 82M params, Apache 2.0 |
| **Chatterbox** | `ResembleAI/chatterbox` | ~$0.80/M chars | EN | MIT, emociones, benchmarked vs ElevenLabs |
| **Chatterbox Multilingual** | `ResembleAI/chatterbox-multilingual` | ~$0.80/M chars | 23 | AR, DA, DE, EL, EN, ES, FI, FR, HE, HI, IT, JA, KO, MS, NL, NO, PL, PT, RU, SV, SW, TR, ZH |
| **Chatterbox-Turbo** | `ResembleAI/chatterbox-turbo` | ~$0.80/M chars | EN | 350M params, baja latencia, tags paralingüísticos |
| **Orpheus** | `canopylabs/orpheus-3b` | ~$1.00/M chars | 8 | Llama-based, expresivo, streaming |
| **Orpheus-Turbo** | `canopylabs/orpheus-turbo` | ~$0.80/M chars | 8 | Versión optimizada |
| **Zonos** | `Zyphra/Zonos-v0.1` | ~$1.00/M chars | 6 | 44kHz, clonación, control de emociones |

**Voice Cloning:** Soportado via endpoint `/v1/voices/add`

### 10.2 Modelos STT Disponibles

| Modelo | ID | Características |
|--------|-----|-----------------|
| **Whisper Base** | `openai/whisper-base` | Rápido, 100+ idiomas |
| **Whisper Large-v3** | `openai/whisper-large-v3` | Mayor precisión |
| **Whisper Large-v3-turbo** | `openai/whisper-large-v3-turbo` | Balance velocidad/calidad |
| **Whisper Timestamped** | `openai/whisper-timestamped` | Timestamps por palabra |

### 10.3 Modelos LLM Disponibles

| Familia | Modelos | Precio Input | Precio Output | Contexto |
|---------|---------|--------------|---------------|----------|
| **Llama 4** | Scout, Maverick | $0.08/M | $0.30/M | 1M+ |
| **Llama 3.1** | 8B, 70B, 405B | $0.03-1.79/M | $0.05-1.79/M | 128K |
| **DeepSeek** | V3.2, R1, R1-Turbo | $0.26-0.50/M | $0.39-2.15/M | 128K |
| **Qwen 2.5/3** | 7B-72B, Coder | $0.05-0.40/M | $0.10-0.90/M | 128K |
| **Mistral** | Small (24B), Large | $0.05-0.30/M | $0.08-0.50/M | 128K |
| **Gemma 2** | 9B, 27B | $0.05-0.15/M | $0.10-0.30/M | 8K |
| **Nemotron** | 3 Nano, Mini | $0.03-0.10/M | $0.05-0.20/M | 128K |

### 10.4 Ventajas de DeepInfra

- **Una API key para todo:** TTS + STT + LLM con la misma cuenta
- **Modelos open-source sin GPU:** Corre Kokoro, Chatterbox, Llama sin hardware local
- **Precios competitivos:** $0.80/M chars TTS vs $15-30/M OpenAI
- **Sin contratos:** Pay-as-you-go puro
- **Escalable:** Hasta 200 requests concurrentes

### 10.5 Configuración

**API Key:** [deepinfra.com/dash/api_keys](https://deepinfra.com/dash/api_keys)

**Documentación:** [deepinfra.com/docs](https://deepinfra.com/docs)

---

## 11. Configuración Rápida

### 11.1 Configurar API Keys

1. Ir a **Settings** en Whisperall
2. Sección **Providers**
3. Seleccionar el provider
4. Introducir la API key
5. (Opcional) Seleccionar modelo/voz predeterminada

### 11.2 Descargar Modelos Locales

1. Ir a **Models** en Whisperall
2. Buscar el modelo deseado
3. Click en **Download**
4. Esperar a que termine la descarga
5. El provider aparecerá como disponible

### 11.3 Configurar Ollama

1. Instalar Ollama: https://ollama.ai
2. Descargar modelo: `ollama pull llama3.2:3b`
3. Asegurar que Ollama está corriendo
4. En Whisperall, seleccionar Ollama como provider de AI Edit

---

## 12. Recomendaciones por Caso de Uso

### 12.1 Máxima Economía (Stack Gratuito)

| Módulo | Provider | Costo |
|--------|----------|-------|
| TTS | Kokoro-82M o Chatterbox | $0 |
| STT | Faster-Whisper | $0 |
| AI Edit | Ollama | $0 |
| Traducción | Argos | $0 |
| Música | DiffRhythm | $0 |
| SFX | MMAudio | $0 |

**Requisitos:** GPU con 4-8GB VRAM

### 12.2 Bajo Costo con APIs

| Módulo | Provider | Costo aproximado |
|--------|----------|------------------|
| TTS | DeepInfra (Kokoro/Chatterbox) | **$0.80/M chars** |
| TTS | SiliconFlow | $7.15/M chars |
| STT | Groq | $0.04/hora |
| STT | DeepInfra (Whisper) | ~$0.10/hora |
| AI Edit | DeepInfra (Llama 3.1 8B) | **$0.03/M tokens** |
| AI Edit | DeepSeek | $0.07/M tokens |
| Traducción | DeepSeek | $0.07/M tokens |

### 12.3 Producción Comercial (Calidad Premium)

| Módulo | Provider | Razón |
|--------|----------|-------|
| TTS | ElevenLabs | Voces ultra-realistas |
| STT | ElevenLabs Scribe | 90+ idiomas, diarización |
| AI Edit | Claude Sonnet | Balance calidad/costo |
| Traducción | DeepL | Calidad europea superior |

### 12.4 Baja Latencia (Agentes Conversacionales)

| Módulo | Provider | Latencia |
|--------|----------|----------|
| TTS | Cartesia Sonic-Turbo | 40ms |
| STT | Groq | 216x real-time |
| AI Edit | Groq (si se implementa) | 1,000+ TPS |

---

## 13. Links Rápidos

### Consolas de API Keys

| Provider | URL |
|----------|-----|
| OpenAI | https://platform.openai.com/api-keys |
| ElevenLabs | https://elevenlabs.io/app/settings/api-keys |
| Anthropic (Claude) | https://console.anthropic.com/settings/keys |
| Google AI (Gemini) | https://aistudio.google.com/app/apikey |
| DeepSeek | https://platform.deepseek.com/api_keys |
| DeepInfra | https://deepinfra.com/dash/api_keys |
| Groq | https://console.groq.com/keys |
| Deepgram | https://console.deepgram.com/signup |
| DeepL | https://www.deepl.com/account/summary |
| Fish Audio | https://fish.audio/app/api-keys/ |
| Cartesia | https://play.cartesia.ai/console |
| PlayHT | https://play.ht/studio |
| SiliconFlow | https://cloud.siliconflow.cn/account/ak |
| MiniMax | https://platform.minimax.io/user-center/basic-information |
| Zhipu | https://open.bigmodel.cn/usercenter/apikeys |
| Moonshot | https://platform.moonshot.ai/console |
| Zyphra | https://www.zyphra.com/dashboard |
| Nari Labs | https://nari.ai/dashboard |

### Documentación

| Provider | URL |
|----------|-----|
| OpenAI | https://platform.openai.com/docs |
| ElevenLabs | https://docs.elevenlabs.io |
| Anthropic | https://docs.anthropic.com/claude/docs |
| Google AI | https://ai.google.dev/gemini-api/docs |
| DeepSeek | https://platform.deepseek.com/docs |
| DeepInfra | https://deepinfra.com/docs |
| Groq | https://console.groq.com/docs/overview |
| Deepgram | https://developers.deepgram.com/documentation |
| DeepL | https://www.deepl.com/docs-api |

---

## 14. Limitaciones Conocidas

- **Diarización:** Solo disponible vía Deepgram y ElevenLabs (no implementado actualmente en Whisperall).
- **Real-time Multimodal:** No soportado nativamente.
- **Idiomas Low-Resource:** La mayoría de modelos optimizados para EN/ZH/ES. Lenguas minoritarias limitadas.
- **Voice Banking Profesional:** Clonación de alta fidelidad requiere 30-60 min de grabación.

---

*Documento generado: Enero 2026 | Específico para Whisperall | Información sujeta a cambios de proveedores*
