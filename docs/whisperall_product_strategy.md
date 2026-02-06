# Whisperall — Estrategia de Producto Completa

**Versión:** 1.0  
**Fecha:** 2026-02-02  
**Autor:** Product Lead + UX Lead + Frontend Architect

---

## Índice

1. [Definición del Producto](#1-definición-del-producto)
2. [Diagnóstico: Por qué NO es Monetizable Hoy](#2-diagnóstico-por-qué-no-es-monetizable-hoy)
3. [Propuesta de Enfoque: Core / Tools / Labs](#3-propuesta-de-enfoque-core--tools--labs)
4. [Estrategia de Monetización](#4-estrategia-de-monetización)
5. [Arquitectura de Proxying y Backend](#5-arquitectura-de-proxying-y-backend)
6. [UX: Flujos Críticos](#6-ux-flujos-críticos)
7. [Arquitectura UI: Reglas y Plan de Refactor](#7-arquitectura-ui-reglas-y-plan-de-refactor)
8. [Roadmap Ejecutable](#8-roadmap-ejecutable)
9. [Preguntas de Aclaración](#9-preguntas-de-aclaración)
10. [Anexos](#10-anexos)

---

## 1. Definición del Producto

### 1.1 En Una Oración

**Whisperall es dictación profesional a precio accesible** — la misma experiencia premium de Wispr Flow a una fracción del costo.

### 1.2 Para Quién

Profesionales que dictan a diario:
- Escritores y periodistas
- Abogados y médicos
- Programadores (documentación, commits, code review)
- Creadores de contenido
- Estudiantes y académicos
- Cualquiera que prefiera hablar a escribir

**Perfil clave:** Personas no técnicas que quieren que las cosas funcionen sin configuración.

### 1.3 Qué Problema Resuelve

| Problema | Cómo lo Resolvemos |
|----------|-------------------|
| Wispr Flow es caro ($15/mes) | Cobramos $7/mes con calidad equivalente |
| Apps locales requieren instalar modelos | Todo en la nube, funciona al instante |
| BYOK requiere conocimiento técnico | Sin API keys, sin configuración |
| Alternativas gratuitas son inconsistentes | Usamos los mejores providers económicos |

### 1.4 Propuesta de Valor

> **"Wispr Flow quality at a fraction of the price."**
>
> Pagas $7/mes y obtienes dictación instantánea, lectura de texto en voz alta, y transcripción de archivos. Sin instalaciones. Sin API keys. Funciona desde el primer minuto.

### 1.5 Modelo de Negocio

**Suscripción todo-incluido con márgenes mínimos.**

- El usuario paga una suscripción fija
- Nosotros pagamos a los providers (Groq, DeepInfra, etc.)
- Operamos con márgenes bajos (10-30%)
- Ganamos mercado con precio, retenemos con experiencia
- Eventualmente añadimos tier Pro con más margen

### 1.6 Qué NO Es

| NO Es | Por Qué |
|-------|---------|
| ❌ App "local-first" | La gente no quiere instalar modelos de 2GB ni lidiar con Python |
| ❌ BYOK como modelo principal | Demasiada fricción; mata la conversión |
| ❌ Suite de producción de audio | Music/SFX diluyen el mensaje; son extras, no core |
| ❌ Herramienta para técnicos | El target es gente normal que quiere que funcione |
| ❌ Producto enterprise (todavía) | Enfoque inicial en individuos; teams después |

### 1.7 Diferenciación vs Wispr Flow

| Aspecto | Wispr Flow | Whisperall |
|---------|------------|------------|
| **Precio Standard** | $15/mes | **$7/mes** |
| **Precio Anual** | $144/año (~$12/mes) | **$59/año** (~$5/mes) |
| **Free Trial** | Limitado con caps | 30 min dictation gratis |
| **Setup** | Funciona al instante | Funciona al instante |
| **Plataformas** | Mac + Windows + iPhone | Windows (v1) |
| **Target** | Premium users | Precio-conscientes |

---

## 2. Diagnóstico: Por qué NO es Monetizable Hoy

### 2.1 Top 10 Problemas

| # | Problema | Categoría | Impacto | Evidencia |
|---|----------|-----------|---------|-----------|
| **1** | **No hay "puerta de entrada" clara** — sidebar presenta 15+ módulos con igual peso | Producto | 🔴 Crítico | Screenshots muestran todos los módulos compitiendo |
| **2** | **Provider/model selection domina la UX** — usuarios forzados a elegir técnicamente | UX | 🔴 Crítico | Speech to Text muestra dropdown de engine prominente |
| **3** | **Modelo actual es "local-first"** — requiere descargar modelos, GPU, etc. | Producto | 🔴 Crítico | Esto mata la conversión de usuarios no técnicos |
| **4** | **Sin onboarding** — no hay camino a "primera dictación exitosa" en <60s | Producto | 🔴 Crítico | Docs confirman ausencia de guided first-run |
| **5** | **Inconsistencia de layouts** — cada módulo se siente como app distinta | UI/Arq | 🟠 Alto | Transcribe: settings derecha; Reader: izquierda; TTS: sidebar |
| **6** | **Estados de error técnicos** — "CUDA OOM" no significa nada para el usuario | UX | 🟠 Alto | MODULES_QA.md lista códigos de error sin UX recovery |
| **7** | **Código UI duplicado** — EngineSelector implementado de 3+ formas | Arquitectura | 🟠 Alto | Cards grid, dropdown, custom dropdown |
| **8** | **Branding débil** — logo genérico, naming inconsistente (ChatterboxUI legacy) | Producto | 🟡 Medio | Settings muestra path legacy |
| **9** | **Narrativa de monetización ausente** — no hay planes ni upgrade path | Producto | 🔴 Crítico | PRICING_DRAFT es solo borrador |
| **10** | **Music/SFX/Dubbing diluyen el mensaje** — confunden sobre qué ES el producto | Producto | 🟠 Alto | 16 módulos; nadie entiende qué hace la app |

### 2.2 Matriz de Impacto vs Esfuerzo

```
                        IMPACTO
                    Alto            Bajo
              ┌─────────────┬─────────────┐
         Bajo │ ✅ HACER    │ Considerar  │
              │ PRIMERO     │             │
    ESFUERZO  │ - Sidebar   │ - Branding  │
              │ - Ocultar   │ - Icons     │
              │   providers │             │
              ├─────────────┼─────────────┤
         Alto │ Planificar  │ ❌ NO HACER │
              │             │             │
              │ - Backend   │ - Music/SFX │
              │   proxying  │   polish    │
              │ - Payments  │             │
              └─────────────┴─────────────┘
```

---

## 3. Propuesta de Enfoque: Core / Tools / Labs

### 3.1 Jerarquía de Módulos

| Tier | Módulos | Acceso | Narrativa |
|------|---------|--------|-----------|
| **🎯 Core** | **Dictate** (Speech to Text) | Standard | "Tu voz → texto al instante" |
| **🎯 Core** | **Reader** (TTS rápido) | Standard | "Lee cualquier texto en voz alta" |
| **🎯 Core** | **Transcribe** (archivos) | Standard (límite) / Pro (ilimitado) | "Transcribe reuniones y podcasts" |
| **🔧 Tools** | Voice Library, History | Standard | Soporte para Core workflows |
| **🔧 Tools** | Live Transcription | Pro | Captura de reuniones en vivo |
| **🔧 Tools** | AI Edit, Translate | Standard (básico) / Pro (completo) | Productividad |
| **🧪 Labs** | Voice Changer, Voice Isolator | Pro | Experimental |
| **🧪 Labs** | Auto Dubbing | Pro | Workflow complejo |
| **🧪 Labs** | Music, Sound Effects | Pro (ocultos inicialmente) | No relacionados con core |
| **⚙️ Setup** | Models, Settings | Todos | Configuración |

### 3.2 Nueva Estructura de Navegación (Sidebar)

```
SIDEBAR PROPUESTO
─────────────────────────────────
🎤 Dictate           ← Default/Home (seleccionado)
📖 Reader
📝 Transcribe
─────────────────────────────────
📚 Voice Library
🕐 History
─────────────────────────────────
🔧 More Tools        ▾ (colapsado por defecto)
   ├─ Live Capture      [PRO badge]
   ├─ AI Edit
   └─ Translate
─────────────────────────────────
🧪 Labs              ▾ (colapsado, badge "Beta")
   ├─ Voice Changer    [PRO badge]
   ├─ Voice Isolator   [PRO badge]
   ├─ Auto Dubbing     [PRO badge]
   ├─ Music            [PRO badge]
   └─ Sound Effects    [PRO badge]
─────────────────────────────────
⚙️ Settings
```

### 3.3 Acciones sobre Módulos

| Acción | Módulo | Razón |
|--------|--------|-------|
| **Priorizar** | Dictate | Es la "puerta de entrada" — debe ser perfecto |
| **Priorizar** | Reader | Quick win; TTS rápido es muy usado |
| **Priorizar** | Transcribe | Alto valor percibido; justifica suscripción |
| **Mantener** | History, Voice Library | Soporte para Core |
| **Degradar a Pro** | Live Transcription, AI Edit avanzado | Features de poder |
| **Degradar a Labs** | Voice Changer, Isolator, Dubbing | Experimentales |
| **Ocultar inicialmente** | Music, Sound Effects | No relacionados; diluyen mensaje |
| **Eliminar o fusionar** | Text to Speech (página completa) | Confunde con Reader; TTS avanzado va en Voice Library |

---

## 4. Estrategia de Monetización

### 4.1 Modelo: All-Inclusive Subscription (Undercut Wispr Flow)

**Filosofía:**
1. Cobrar menos que Wispr Flow
2. Usar providers económicos de alta calidad
3. Operar con márgenes mínimos (10-30%)
4. Ganar mercado primero
5. Monetizar más después con tier Pro

### 4.2 Análisis de Costos por Provider

#### STT (Speech-to-Text)

| Provider | Costo/hora | Velocidad | Calidad | Recomendación |
|----------|------------|-----------|---------|---------------|
| **Groq** | **$0.04** | 216x RT | Alta | ✅ Principal |
| DeepInfra | $0.10 | Rápida | Alta | Fallback |
| OpenAI | $0.36 | Normal | Alta | No usar (caro) |
| ElevenLabs | $0.22-0.48 | 150ms RT | Alta | No usar (caro) |

#### TTS (Text-to-Speech)

| Provider | Costo/1M chars | Latencia | Calidad | Recomendación |
|----------|----------------|----------|---------|---------------|
| **DeepInfra Kokoro** | **$0.80** | ~100ms | Alta | ✅ Principal |
| DeepInfra Chatterbox | $0.80 | ~150ms | Alta | Fallback |
| OpenAI | $15-30 | Baja | Alta | No usar (caro) |
| ElevenLabs | $0.09-0.30/1K | 75ms+ | Muy alta | Solo Pro? |

#### LLM (AI Edit)

| Provider | Costo/1M tokens | Contexto | Calidad | Recomendación |
|----------|-----------------|----------|---------|---------------|
| **DeepInfra Llama 3.1 8B** | **$0.03** | 128K | Buena | ✅ Principal |
| DeepSeek V3.1 | $0.07 | 128K | Muy buena | Fallback |
| Claude Haiku | $0.25 | 200K | Muy buena | Solo Pro |

### 4.3 Estimación de Costo por Usuario

#### Usuario Típico (Activo Normal)

| Servicio | Uso estimado/mes | Costo |
|----------|------------------|-------|
| STT (Dictation) | 10 horas | $0.40 |
| STT (Transcribe) | 5 horas | $0.20 |
| TTS (Reader) | 500K chars (~8h) | $0.40 |
| AI Edit | 100K tokens | $0.003 |
| **Total** | — | **~$1.00** |

#### Power User (Heavy Usage)

| Servicio | Uso estimado/mes | Costo |
|----------|------------------|-------|
| STT (Dictation) | 25 horas | $1.00 |
| STT (Transcribe) | 15 horas | $0.60 |
| TTS (Reader) | 2M chars | $1.60 |
| AI Edit | 500K tokens | $0.015 |
| **Total** | — | **~$3.20** |

#### Usuario Extremo (Whale)

| Servicio | Uso estimado/mes | Costo |
|----------|------------------|-------|
| STT (Dictation) | 50 horas | $2.00 |
| STT (Transcribe) | 30 horas | $1.20 |
| TTS (Reader) | 5M chars | $4.00 |
| AI Edit | 1M tokens | $0.03 |
| **Total** | — | **~$7.23** |

### 4.4 Análisis de Rentabilidad

| Escenario | Precio suscripción | Costo promedio | Margen | Viable? |
|-----------|-------------------|----------------|--------|---------|
| Usuario típico | $7/mes | $1.00 | **$6.00 (86%)** | ✅ Muy rentable |
| Power user | $7/mes | $3.20 | **$3.80 (54%)** | ✅ Rentable |
| Whale | $7/mes | $7.23 | **-$0.23 (-3%)** | ⚠️ Break-even |
| Pro user típico | $15/mes | $3.00 | **$12.00 (80%)** | ✅ Muy rentable |

**Conclusión:** El modelo es viable. La mayoría de usuarios serán rentables. Los whales se compensan con usuarios ligeros. Los límites de fair-use previenen abuso extremo.

### 4.5 Planes Propuestos

| Plan | Precio | Target | Descripción |
|------|--------|--------|-------------|
| **Free** | $0 | Probar antes de comprar | Trial limitado |
| **Standard** | $7/mes o $59/año | 80% de usuarios | Todo lo que necesitas |
| **Pro** | $15/mes o $129/año | Power users | Sin límites + extras |

### 4.6 Feature Gating Detallado

| Feature | Free (Trial) | Standard ($7) | Pro ($15) |
|---------|--------------|---------------|-----------|
| **Dictation** | 30 min total | ✅ Ilimitado* | ✅ Ilimitado |
| **Reader (TTS)** | 5 min total | ✅ Ilimitado* | ✅ Ilimitado |
| **Transcribe** | 10 min total | 10h/mes | ✅ Ilimitado |
| **AI Edit** | 5 usos | ✅ Incluido | ✅ Incluido |
| **Translate** | ❌ | ✅ Básico | ✅ Avanzado |
| **Speaker Diarization** | ❌ | ❌ | ✅ |
| **Live Transcription** | ❌ | ❌ | ✅ |
| **Voice Commands** | ❌ | ❌ | ✅ |
| **Personal Dictionary** | ❌ | ✅ | ✅ |
| **Snippets** | ❌ | 10 max | ✅ Ilimitados |
| **History** | Últimos 10 | Últimos 100 | ✅ Ilimitado |
| **Priority Processing** | ❌ | ❌ | ✅ |
| **BYOK (opcional)** | ❌ | ❌ | ✅ |
| **Labs Access** | ❌ | ❌ | ✅ |
| **Export formats** | TXT | TXT, DOCX | Todos |

*Fair-use limits: 50h dictation/mes, 20h reader/mes

### 4.7 Guardrails (Protección contra Abuso)

| Tipo | Límite | Acción |
|------|--------|--------|
| **Soft limit** | 50h dictation/mes | Warning + throttle |
| **Hard limit** | 100h dictation/mes | Bloqueo + prompt upgrade |
| **Rate limit** | 10 requests/min | Queue, no bloqueo |
| **Max file (Standard)** | 2h por archivo | Reject + prompt upgrade |
| **Max file (Pro)** | 5h por archivo | Reject |
| **Concurrent requests** | 3 simultáneos | Queue |
| **Abuse detection** | Patrones anómalos | Review manual |

### 4.8 Por Qué NO BYOK como Modelo Principal

| BYOK | All-Inclusive |
|------|---------------|
| ❌ Fricción: crear cuentas, copiar keys | ✅ Paga y funciona |
| ❌ Soporte nightmare | ✅ Controlamos la experiencia |
| ❌ Usuarios no saben qué elegir | ✅ Nosotros elegimos |
| ❌ Conversión baja | ✅ Conversión alta |
| ❌ Precios variables para el usuario | ✅ Precio fijo predecible |

**BYOK como opción:** Solo en Pro, para usuarios que YA tienen API keys y quieren usar sus propios providers.

---

## 5. Arquitectura de Proxying y Backend

### 5.1 Visión General

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USUARIO (Electron App)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         WHISPERALL CLOUD                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Auth &    │  │   Usage     │  │   Proxy     │  │   Billing   │    │
│  │   Session   │  │   Tracking  │  │   Router    │  │   (Stripe)  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ┌──────────┐      ┌──────────┐      ┌──────────┐
              │   Groq   │      │ DeepInfra│      │ DeepSeek │
              │  (STT)   │      │(TTS/LLM) │      │  (LLM)   │
              └──────────┘      └──────────┘      └──────────┘
```

### 5.2 Componentes del Backend

#### 5.2.1 Auth Service

**Responsabilidades:**
- Registro y login de usuarios
- Gestión de sesiones (JWT)
- Verificación de suscripción
- Rate limiting por usuario

**Endpoints:**

```
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
GET  /auth/me
```

**Schema de Usuario:**

```typescript
interface User {
  id: string;                    // UUID
  email: string;
  password_hash: string;
  plan: 'free' | 'standard' | 'pro';
  subscription_status: 'active' | 'cancelled' | 'past_due';
  subscription_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
  
  // Usage tracking
  usage_period_start: Date;      // Reset mensual
  dictation_seconds_used: number;
  transcribe_seconds_used: number;
  tts_chars_used: number;
  ai_edit_tokens_used: number;
}
```

#### 5.2.2 Usage Tracking Service

**Responsabilidades:**
- Registrar cada request con su consumo
- Verificar límites antes de procesar
- Agregar métricas para billing y analytics
- Reset mensual de contadores

**Schema de Usage Log:**

```typescript
interface UsageLog {
  id: string;
  user_id: string;
  service: 'stt' | 'tts' | 'transcribe' | 'ai_edit' | 'translate';
  provider: string;
  model: string;
  
  // Métricas
  input_size: number;            // bytes, chars, o segundos según servicio
  output_size: number;
  duration_ms: number;
  estimated_cost: number;        // En USD, para tracking interno
  
  // Metadata
  created_at: Date;
  request_id: string;
  status: 'success' | 'error';
  error_code?: string;
}
```

**Endpoints:**

```
GET  /usage/current              // Usage del período actual
GET  /usage/history              // Historial de uso
POST /usage/check                // ¿Puede el usuario hacer X?
```

#### 5.2.3 Proxy Router Service

**Responsabilidades:**
- Recibir requests del cliente
- Verificar autenticación y límites
- Seleccionar provider óptimo
- Forwarding a providers externos
- Manejar errores y fallbacks
- Logging de uso

**Flujo de Request:**

```
1. Cliente envía request
   ↓
2. Verificar JWT válido
   ↓
3. Verificar plan permite operación
   ↓
4. Verificar no excede límites
   ↓
5. Seleccionar provider (basado en disponibilidad, costo, latencia)
   ↓
6. Forward request al provider
   ↓
7. Recibir respuesta
   ↓
8. Loggear uso
   ↓
9. Retornar respuesta al cliente
```

**Endpoints:**

```
POST /api/stt/transcribe         // Dictation y transcripción
POST /api/tts/synthesize         // Text-to-speech
POST /api/ai/edit                // AI text editing
POST /api/translate              // Translation
```

#### 5.2.4 Provider Abstraction Layer

**Concepto:** Interfaces unificadas que abstraen las diferencias entre providers.

```typescript
// Interface común para STT
interface STTProvider {
  name: string;
  transcribe(audio: Buffer, options: STTOptions): Promise<STTResult>;
  getEstimatedCost(durationSeconds: number): number;
  isAvailable(): Promise<boolean>;
}

// Implementaciones
class GroqSTTProvider implements STTProvider { ... }
class DeepInfraSTTProvider implements STTProvider { ... }
class OpenAISTTProvider implements STTProvider { ... }

// Router que selecciona provider
class STTRouter {
  private providers: STTProvider[];
  
  async transcribe(audio: Buffer, options: STTOptions): Promise<STTResult> {
    const provider = await this.selectBestProvider();
    return provider.transcribe(audio, options);
  }
  
  private async selectBestProvider(): Promise<STTProvider> {
    // 1. Filtrar disponibles
    // 2. Ordenar por costo
    // 3. Retornar el mejor
  }
}
```

### 5.3 Selección de Providers (Automática)

| Servicio | Provider Principal | Fallback 1 | Fallback 2 |
|----------|-------------------|------------|------------|
| **STT** | Groq whisper-turbo | DeepInfra Whisper | OpenAI Whisper |
| **TTS** | DeepInfra Kokoro | DeepInfra Chatterbox | SiliconFlow |
| **AI Edit** | DeepInfra Llama 3.1 8B | DeepSeek V3.1 | OpenAI GPT-4o-mini |
| **Translate** | DeepSeek V3.1 | DeepInfra Llama | Google Translate |

**Criterios de selección:**
1. Disponibilidad (health check)
2. Costo (preferir más barato)
3. Latencia histórica
4. Tasa de éxito histórica

### 5.4 Manejo de Errores y Fallbacks

```typescript
async function transcribeWithFallback(audio: Buffer): Promise<STTResult> {
  const providers = ['groq', 'deepinfra', 'openai'];
  
  for (const providerName of providers) {
    try {
      const provider = getProvider(providerName);
      
      // Health check rápido
      if (!await provider.isAvailable()) {
        continue;
      }
      
      const result = await provider.transcribe(audio);
      
      // Log éxito
      logUsage({ provider: providerName, status: 'success' });
      
      return result;
      
    } catch (error) {
      // Log error
      logUsage({ provider: providerName, status: 'error', error });
      
      // Continuar al siguiente provider
      continue;
    }
  }
  
  // Todos fallaron
  throw new ServiceUnavailableError('All STT providers failed');
}
```

### 5.5 Billing Integration (Stripe)

**Flujo de Suscripción:**

```
1. Usuario selecciona plan en la app
   ↓
2. App abre Stripe Checkout (hosted)
   ↓
3. Usuario paga
   ↓
4. Stripe envía webhook a nuestro backend
   ↓
5. Backend actualiza plan del usuario
   ↓
6. App recibe confirmación y desbloquea features
```

**Webhooks a manejar:**

```typescript
// Stripe webhooks
POST /webhooks/stripe

switch (event.type) {
  case 'checkout.session.completed':
    // Nueva suscripción
    activateSubscription(userId, plan);
    break;
    
  case 'invoice.paid':
    // Renovación exitosa
    extendSubscription(userId);
    break;
    
  case 'invoice.payment_failed':
    // Pago fallido
    markSubscriptionPastDue(userId);
    break;
    
  case 'customer.subscription.deleted':
    // Cancelación
    cancelSubscription(userId);
    break;
}
```

### 5.6 Infraestructura Recomendada

#### Opción A: Serverless (Recomendado para empezar)

| Componente | Servicio | Costo estimado |
|------------|----------|----------------|
| API Backend | Vercel Functions / Cloudflare Workers | $0-20/mes |
| Database | Supabase (Postgres) | $0-25/mes |
| Auth | Supabase Auth | Incluido |
| Storage | Supabase Storage (para audio temp) | $0-10/mes |
| Billing | Stripe | 2.9% + $0.30 por transacción |

**Total estimado: $0-55/mes** (escala con uso)

#### Opción B: VPS (Más control)

| Componente | Servicio | Costo estimado |
|------------|----------|----------------|
| Backend | Hetzner VPS (CPX21) | $10/mes |
| Database | PostgreSQL en VPS | Incluido |
| Storage | Hetzner Storage Box | $5/mes |
| Billing | Stripe | 2.9% + $0.30 |

**Total estimado: ~$15/mes** (fijo)

### 5.7 Seguridad

| Aspecto | Implementación |
|---------|----------------|
| **Auth** | JWT con refresh tokens, httpOnly cookies |
| **API Keys** | Almacenadas en env vars, nunca en código |
| **Provider Keys** | Solo en backend, nunca expuestas al cliente |
| **Rate Limiting** | Por usuario + por IP |
| **Input Validation** | Zod schemas en todos los endpoints |
| **HTTPS** | Obligatorio |
| **Audio Storage** | Temporal, auto-delete en 24h |

### 5.8 Comunicación App ↔ Backend

**Cambio en la arquitectura actual:**

| Antes (Local) | Después (Cloud) |
|---------------|-----------------|
| App → Provider directo | App → Whisperall Backend → Provider |
| API keys en local | API keys en backend |
| Sin auth de usuario | Auth requerido |
| Sin tracking de uso | Tracking completo |

**Cambios requeridos en Electron app:**

```typescript
// Antes: llamada directa al provider
const result = await groq.transcribe(audio, { apiKey: localKey });

// Después: llamada a nuestro backend
const result = await whisperallAPI.transcribe(audio, {
  headers: { Authorization: `Bearer ${userToken}` }
});
```

---

## 6. UX: Flujos Críticos

### 6.1 Flujo de Onboarding (First Run)

**Objetivo:** Primera dictación exitosa en < 60 segundos.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BIENVENIDO A WHISPERALL                          │
│                                                                         │
│                    🎤 Dictación instantánea por $7/mes                  │
│                                                                         │
│         ┌─────────────────────────────────────────────────────┐         │
│         │                                                     │         │
│         │    Prueba gratis: 30 minutos de dictación          │         │
│         │    Sin tarjeta de crédito                          │         │
│         │                                                     │         │
│         │         [Crear cuenta gratis]                       │         │
│         │                                                     │         │
│         │    ─────────── o ───────────                        │         │
│         │                                                     │         │
│         │         [Continuar con Google]                      │         │
│         │                                                     │         │
│         └─────────────────────────────────────────────────────┘         │
│                                                                         │
│                   ¿Ya tienes cuenta? [Iniciar sesión]                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                                   ↓ (después de registro)

┌─────────────────────────────────────────────────────────────────────────┐
│                        ¡LISTO! PRUEBA TU PRIMERA DICTACIÓN              │
│                                                                         │
│         ┌─────────────────────────────────────────────────────┐         │
│         │                                                     │         │
│         │              Presiona el botón y habla              │         │
│         │                                                     │         │
│         │                  ┌───────────┐                      │         │
│         │                  │    🎤     │                      │         │
│         │                  │  DICTAR   │                      │         │
│         │                  └───────────┘                      │         │
│         │                                                     │         │
│         │         El texto aparecerá automáticamente          │         │
│         │                                                     │         │
│         └─────────────────────────────────────────────────────┘         │
│                                                                         │
│                      Tip: También puedes usar Ctrl+Shift+D              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                                   ↓ (después de primera dictación)

┌─────────────────────────────────────────────────────────────────────────┐
│                              ✅ ¡PERFECTO!                              │
│                                                                         │
│                      Tu primera dictación fue exitosa                   │
│                                                                         │
│                      "Hola, esto es una prueba de                       │
│                       dictación con Whisperall"                         │
│                                                                         │
│         ┌─────────────────────────────────────────────────────┐         │
│         │  Ahora puedes:                                      │         │
│         │                                                     │         │
│         │  🎤 Dictar en cualquier app (Ctrl+Shift+D)         │         │
│         │  📖 Leer texto en voz alta                          │         │
│         │  📝 Transcribir archivos de audio                   │         │
│         │                                                     │         │
│         └─────────────────────────────────────────────────────┘         │
│                                                                         │
│                         [Ir a Whisperall →]                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Flujo: Dictate (Speech to Text)

**Job:** "Quiero dictar texto y que aparezca en mi app actual."

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🎤 Dictate                                          [Ctrl+Shift+D]     │
│                                                                         │
│  Dicta en cualquier aplicación con tu voz                              │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │                                                                 │   │
│  │                    ┌─────────────────────┐                      │   │
│  │                    │                     │                      │   │
│  │                    │    🎤 DICTAR        │                      │   │
│  │                    │                     │                      │   │
│  │                    │   Presiona o usa    │                      │   │
│  │                    │   Ctrl+Shift+D      │                      │   │
│  │                    │                     │                      │   │
│  │                    └─────────────────────┘                      │   │
│  │                                                                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Language: Auto ▾        ☑️ Auto-pegar en app activa                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Transcription                                         📋  🗑️    │   │
│  │                                                                 │   │
│  │ Tu dictado aparecerá aquí...                                   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ⚙️ Más opciones                                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**"Más opciones" (expandible):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚙️ Más opciones                                              [▲ Ocultar]│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  ☑️ Puntuación automática                                       │   │
│  │  ☑️ Eliminar muletillas (um, eh, este...)                      │   │
│  │  ☐ Formato inteligente (listas, números)                       │   │
│  │                                                                 │   │
│  │  Prompt de contexto (opcional):                                │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │ Nombres, acrónimos, o estilo...                         │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Estados durante dictación:**

```
IDLE           →    LISTENING       →    PROCESSING      →    DONE
[🎤 Dictar]         [🔴 Escuchando...]    [⏳ Transcribiendo]   [✅ Listo]
                    (waveform anim)       (spinner)             (texto aparece)
```

### 6.3 Flujo: Transcribe (Archivos)

**Job:** "Tengo un archivo de audio/video y quiero el texto."

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📝 Transcribe                                                          │
│                                                                         │
│  Transcribe archivos de audio y video con identificación de hablantes  │
│                                                                         │
├───────────────────────────────────────────────┬─────────────────────────┤
│                                               │                         │
│  ┌─────────────────────────────────────────┐  │  Settings               │
│  │                                         │  │                         │
│  │          ⬆️ Arrastra archivo aquí        │  │  Language               │
│  │             o haz clic para             │  │  ┌─────────────────┐    │
│  │               seleccionar               │  │  │ Auto-detectar ▾ │    │
│  │                                         │  │  └─────────────────┘    │
│  │    MP3, WAV, MP4, MKV hasta 4GB         │  │                         │
│  │                                         │  │  Quality                │
│  └─────────────────────────────────────────┘  │  ○ Rápido               │
│                                               │  ● Balanceado           │
│  ┌─────────────────────────────────────────┐  │  ○ Preciso              │
│  │  🔗 Importar desde link                  │  │                         │
│  │     YouTube, Dropbox, Google Drive...   │  │  ☑️ Identificar speakers │
│  └─────────────────────────────────────────┘  │     [PRO feature]       │
│                                               │                         │
│                                               │  ────────────────────   │
│                                               │                         │
│  ┌─────────────────────────────────────────┐  │  Tu plan: Standard      │
│  │                                         │  │  Uso: 3h / 10h mes      │
│  │  Transcription                          │  │  ████████░░░░ 30%       │
│  │                                         │  │                         │
│  │  (Tu transcripción aparecerá aquí)     │  │  [Upgrade a Pro →]      │
│  │                                         │  │                         │
│  └─────────────────────────────────────────┘  │                         │
│                                               │                         │
└───────────────────────────────────────────────┴─────────────────────────┘
```

**Estado: Procesando**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📝 Transcribe                                                          │
│                                                                         │
├───────────────────────────────────────────────┬─────────────────────────┤
│                                               │                         │
│  ┌─────────────────────────────────────────┐  │  meeting_2026.mp3       │
│  │                                         │  │  Duration: 45:32        │
│  │    📄 meeting_2026.mp3                   │  │  Size: 54.2 MB          │
│  │                                         │  │                         │
│  │    ████████████░░░░░░░░░░ 58%           │  │  ────────────────────   │
│  │                                         │  │                         │
│  │    Transcribiendo... 26:21 / 45:32      │  │  Language: Español      │
│  │                                         │  │  Quality: Balanceado    │
│  │    [Pausar]  [Cancelar]                 │  │  Speakers: Sí           │
│  │                                         │  │                         │
│  └─────────────────────────────────────────┘  │                         │
│                                               │                         │
│  ┌─────────────────────────────────────────┐  │                         │
│  │ Transcription (parcial)                 │  │                         │
│  │                                         │  │                         │
│  │ [00:00] Speaker 1: Buenos días a todos, │  │                         │
│  │ vamos a empezar la reunión de hoy...   │  │                         │
│  │                                         │  │                         │
│  │ [00:15] Speaker 2: Perfecto, yo quería │  │                         │
│  │ comentar sobre el proyecto...          │  │                         │
│  │                                         │  │                         │
│  └─────────────────────────────────────────┘  │                         │
│                                               │                         │
└───────────────────────────────────────────────┴─────────────────────────┘
```

### 6.4 Flujo: Upgrade (Free → Standard)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    ⚠️ Has usado tus 30 minutos gratis                    │
│                                                                         │
│         ┌─────────────────────────────────────────────────────┐         │
│         │                                                     │         │
│         │   Upgrade a Standard por solo $7/mes               │         │
│         │                                                     │         │
│         │   ✓ Dictación ilimitada                            │         │
│         │   ✓ Reader ilimitado                               │         │
│         │   ✓ 10 horas de transcripción/mes                  │         │
│         │   ✓ Diccionario personal                           │         │
│         │   ✓ Snippets                                       │         │
│         │                                                     │         │
│         │   ┌─────────────────────────────────────────────┐   │         │
│         │   │                                             │   │         │
│         │   │        [Upgrade ahora - $7/mes]            │   │         │
│         │   │                                             │   │         │
│         │   └─────────────────────────────────────────────┘   │         │
│         │                                                     │         │
│         │   O ahorra con el plan anual: $59/año ($4.92/mes)  │         │
│         │                                                     │         │
│         └─────────────────────────────────────────────────────┘         │
│                                                                         │
│              Powered by Stripe · Cancela cuando quieras                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Arquitectura UI: Reglas y Plan de Refactor

### 7.1 Reglas de Arquitectura (Non-Negotiables)

| # | Regla | Descripción | Enforcement |
|---|-------|-------------|-------------|
| 1 | **Un ModuleShell** | Toda página usa `<ModuleShell>` | PR review |
| 2 | **Sin provider selection visible** | Oculto para usuarios; solo en Settings > Pro Mode | Feature flag |
| 3 | **Layout consistente** | Controls izquierda, Content derecha | CSS tokens |
| 4 | **CTA único y prominente** | Un ActionBar por página | Component API |
| 5 | **Zero jargon técnico** | No "CUDA", "whisper-large-v3", "fp16" | Copy review |
| 6 | **Estados guiados** | Empty, Loading, Error tienen componentes estándar | Design system |
| 7 | **Mobile-aware** | Colapsa a 1 columna en <768px | Responsive CSS |

### 7.2 Componentes Base

| Componente | Status | Descripción |
|------------|--------|-------------|
| `ModuleShell` | Refactor | Layout wrapper con slots estandarizados |
| `ModuleHeader` | Refactor | Título + descripción + badges |
| `SettingsPanel` | OK | Panel colapsable de configuración |
| `ActionBar` | OK | Primary + Secondary CTAs |
| `StatusAlert` | OK | Error/Warning/Info banners |
| `EmptyState` | OK | Estado vacío con ilustración |
| `UpgradePrompt` | **NUEVO** | Prompt de upgrade a plan superior |
| `UsageMeter` | **NUEVO** | Barra de progreso de uso mensual |
| `AudioPlayer` | **NUEVO** | Player unificado para TTS output |
| `TranscriptViewer` | **NUEVO** | Viewer con speakers y timestamps |

### 7.3 Design Tokens

```css
:root {
  /* Spacing */
  --spacing-xs: 0.25rem;   /* 4px */
  --spacing-sm: 0.5rem;    /* 8px */
  --spacing-md: 1rem;      /* 16px */
  --spacing-lg: 1.5rem;    /* 24px */
  --spacing-xl: 2rem;      /* 32px */
  
  /* Border Radius */
  --radius-sm: 0.375rem;   /* 6px */
  --radius-md: 0.5rem;     /* 8px */
  --radius-lg: 0.75rem;    /* 12px */
  --radius-xl: 1rem;       /* 16px */
  
  /* Colors (Dark theme) */
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-tertiary: #334155;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --accent-primary: #22d3ee;   /* Cyan */
  --accent-success: #22c55e;
  --accent-warning: #f59e0b;
  --accent-error: #ef4444;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
}
```

### 7.4 Plan de Refactor por Fases

#### Fase 1: Foundation (Semana 1-2)

| Entregable | Esfuerzo | Impacto |
|------------|----------|---------|
| Reorganizar sidebar (Core/Tools/Labs) | 1 día | Alto |
| Eliminar provider selectors de UI principal | 2 días | Alto |
| Crear `UpgradePrompt` component | 1 día | Alto |
| Crear `UsageMeter` component | 1 día | Medio |
| Implementar auth flow (login/register) | 3 días | Crítico |

#### Fase 2: Core Modules (Semana 3-4)

| Entregable | Esfuerzo | Impacto |
|------------|----------|---------|
| Refactor Dictate con nuevo layout | 2 días | Alto |
| Refactor Reader con nuevo layout | 1 día | Alto |
| Refactor Transcribe con nuevo layout | 2 días | Alto |
| Implementar onboarding flow | 2 días | Alto |

#### Fase 3: Backend Integration (Semana 5-6)

| Entregable | Esfuerzo | Impacto |
|------------|----------|---------|
| Conectar app a Whisperall Backend | 3 días | Crítico |
| Implementar usage tracking en UI | 2 días | Alto |
| Implementar upgrade flow (Stripe) | 2 días | Crítico |
| Testing E2E | 3 días | Alto |

#### Fase 4: Polish (Semana 7-8)

| Entregable | Esfuerzo | Impacto |
|------------|----------|---------|
| Migrar Tools modules | 3 días | Medio |
| Migrar Labs modules | 2 días | Bajo |
| Branding refresh | 2 días | Medio |
| Bug fixes y QA | 3 días | Alto |

---

## 8. Roadmap Ejecutable

### 8.1 Next 7 Days (Sprint 0)

| Día | Entregable | Owner | Riesgo |
|-----|------------|-------|--------|
| **D1** | Reorganizar sidebar: Core/Tools/Labs | Frontend | Bajo |
| **D1** | Ocultar provider selectors en UI | Frontend | Bajo |
| **D2** | Diseñar schema de DB (users, usage) | Backend | Medio |
| **D2** | Setup Supabase/Vercel project | Backend | Bajo |
| **D3** | Implementar auth endpoints | Backend | Medio |
| **D3** | Implementar login/register UI | Frontend | Medio |
| **D4** | Crear proxy endpoint STT (Groq) | Backend | Medio |
| **D4** | Conectar Dictate a backend | Frontend | Medio |
| **D5** | Crear proxy endpoint TTS (DeepInfra) | Backend | Medio |
| **D5** | Conectar Reader a backend | Frontend | Medio |
| **D6** | Implementar usage tracking | Backend | Medio |
| **D6** | Crear `UsageMeter` component | Frontend | Bajo |
| **D7** | QA + fix regressions | Ambos | — |

**Riesgos Semana 1:**
- Configuración de cuentas en providers (Groq, DeepInfra)
- Latencia de proxying (añade ~50-100ms)

### 8.2 Next 6 Weeks

| Semana | Foco | Entregables Clave | Milestone |
|--------|------|-------------------|-----------|
| **W1** | Foundation | Auth, Proxy STT+TTS, Sidebar refactor | "Dictate funciona via backend" |
| **W2** | Core UX | Transcribe backend, Onboarding, UI polish | "First-run en <60s" |
| **W3** | Billing | Stripe integration, Plans UI, Upgrade flow | "Se puede pagar" |
| **W4** | Features | Dictionary, Snippets, History improvements | "Features Pro funcionan" |
| **W5** | Tools | AI Edit, Translate, Live Transcription | "Tools migrados" |
| **W6** | Launch Prep | Labs, Branding, Testing, Docs | "Ready for beta" |

### 8.3 Milestones de Validación

| Semana | Milestone | Métrica de Éxito |
|--------|-----------|------------------|
| W1 | Dictate via cloud funciona | Latencia <2s, 99% success rate |
| W2 | Onboarding completo | Primera dictación en <60s |
| W3 | Billing funcional | Transacción de prueba exitosa |
| W4 | Retención básica | Features Pro diferencian claramente |
| W6 | Beta ready | 10 usuarios de prueba sin issues críticos |

### 8.4 Dependencias Críticas

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEPENDENCIAS CRÍTICAS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Cuentas en Providers]──→[Backend Proxy]──→[App conectada]    │
│         ↑                       ↑                 ↑            │
│     BLOCKER W1             BLOCKER W1         BLOCKER W1       │
│                                                                 │
│  [Stripe Account]──→[Webhook handling]──→[Upgrade flow]        │
│         ↑                    ↑                  ↑              │
│     BLOCKER W3          BLOCKER W3         BLOCKER W3          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Preguntas de Aclaración

| # | Pregunta | Impacto | Decisión que Afecta |
|---|----------|---------|---------------------|
| **1** | ¿Ya tienes cuentas en Groq, DeepInfra, DeepSeek? | 🔴 Crítico | Sin esto no hay backend |
| **2** | ¿Hay presupuesto para ~$50-100/mes en infra inicial? | 🔴 Crítico | Supabase + Vercel vs self-hosted |
| **3** | ¿Stripe o Paddle para billing? (Paddle maneja taxes) | 🟠 Alto | Legal/compliance internacional |
| **4** | ¿El precio $7/mes está validado? ¿Hay disposición a $9? | 🟠 Alto | Afecta márgenes y posicionamiento |
| **5** | ¿Quién será responsable del backend? | 🟠 Alto | Si solo hay frontend dev, necesitamos más simple |
| **6** | ¿Hay beta testers disponibles para W6? | 🟡 Medio | Sin feedback real, es riesgoso lanzar |
| **7** | ¿El overlay de dictation funciona en todas las apps? | 🟡 Medio | Si hay edge cases, necesitamos documentar limitaciones |
| **8** | ¿Fair-use limits de 50h/mes son aceptables? | 🟡 Medio | Si muy bajo, frustración; si muy alto, abuso |
| **9** | ¿Mac/iPhone están en scope para 2026? | 🟡 Medio | Afecta messaging y expectativas |
| **10** | ¿Qué pasa con usuarios existentes que ya usan local models? | 🟡 Medio | ¿Migración? ¿Mantener opción local como fallback? |

---

## 10. Anexos

### 10.1 Comparativa de Costos Detallada

#### STT Providers

| Provider | Modelo | Costo/hora | Velocidad | Idiomas | Notas |
|----------|--------|------------|-----------|---------|-------|
| **Groq** | whisper-turbo | $0.04 | 216x RT | 100+ | ✅ Mejor opción |
| DeepInfra | whisper-large-v3 | ~$0.10 | Rápida | 100+ | Fallback |
| OpenAI | whisper-1 | $0.36 | Normal | 99+ | Caro |
| Deepgram | nova-2 | $0.26 | Streaming | 36 | Caro |
| ElevenLabs | Scribe | $0.22-0.48 | <150ms RT | 90+ | Muy caro |

#### TTS Providers

| Provider | Modelo | Costo/1M chars | Latencia | Calidad | Notas |
|----------|--------|----------------|----------|---------|-------|
| **DeepInfra** | Kokoro | $0.80 | ~100ms | Alta | ✅ Mejor opción |
| DeepInfra | Chatterbox | $0.80 | ~150ms | Alta | Alternativa |
| SiliconFlow | CosyVoice2 | $7.15 | 150ms | Alta | Backup |
| OpenAI | tts-1 | $15/1M | Baja | Alta | Muy caro |
| ElevenLabs | Turbo v2.5 | $0.09-0.30/1K | 75ms+ | Muy alta | Muy caro |

#### LLM Providers (AI Edit)

| Provider | Modelo | Costo/1M tokens | Contexto | Notas |
|----------|--------|-----------------|----------|-------|
| **DeepInfra** | Llama 3.1 8B | $0.03 | 128K | ✅ Mejor opción |
| DeepSeek | V3.1 | $0.07 | 128K | Alternativa |
| OpenAI | GPT-4o-mini | $0.15 | 128K | Backup |
| Anthropic | Claude Haiku | $0.25 | 200K | Caro |

### 10.2 Estimaciones de Uso por Tipo de Usuario

| Tipo | Dictation | Transcribe | TTS | AI Edit | Costo Total |
|------|-----------|------------|-----|---------|-------------|
| **Ligero** | 2h/mes | 1h/mes | 100K chars | 10K tokens | ~$0.20 |
| **Típico** | 10h/mes | 5h/mes | 500K chars | 100K tokens | ~$1.00 |
| **Activo** | 25h/mes | 15h/mes | 2M chars | 500K tokens | ~$3.20 |
| **Power** | 50h/mes | 30h/mes | 5M chars | 1M tokens | ~$7.20 |

### 10.3 Tech Stack Recomendado

| Capa | Tecnología | Razón |
|------|------------|-------|
| **Frontend** | Next.js + React (existente) | Ya implementado |
| **Desktop** | Electron (existente) | Ya implementado |
| **Backend API** | Vercel Functions o Cloudflare Workers | Serverless, escala automática |
| **Database** | Supabase (PostgreSQL) | Auth incluido, real-time, económico |
| **Auth** | Supabase Auth | Integrado, soporta OAuth |
| **Payments** | Stripe | Estándar de la industria |
| **Storage** | Supabase Storage | Para audio temporal |
| **Monitoring** | Vercel Analytics + Sentry | Básico pero suficiente |

### 10.4 Estructura de API Endpoints

```
/api
├── /auth
│   ├── POST /register
│   ├── POST /login
│   ├── POST /logout
│   └── GET  /me
│
├── /stt
│   ├── POST /transcribe      # Dictation y transcripción
│   └── POST /transcribe/file # Archivos largos
│
├── /tts
│   └── POST /synthesize      # Text-to-speech
│
├── /ai
│   ├── POST /edit            # AI text editing
│   └── POST /translate       # Translation
│
├── /usage
│   ├── GET  /current         # Uso del período actual
│   └── GET  /history         # Historial
│
├── /billing
│   ├── POST /create-checkout # Crear sesión de Stripe
│   ├── POST /portal          # Customer portal
│   └── POST /webhook         # Stripe webhooks
│
└── /user
    ├── GET  /settings
    ├── PUT  /settings
    ├── GET  /dictionary
    └── PUT  /dictionary
```

---

## Resumen Ejecutivo

### Situación Actual
Whisperall tiene capacidades técnicas impresionantes pero no es monetizable porque:
1. Requiere setup técnico (modelos locales, API keys)
2. UI fragmentada con 15+ módulos compitiendo
3. Sin narrativa clara de producto

### Estrategia Propuesta
1. **Cloud-first:** Todo funciona desde el primer minuto, sin instalaciones
2. **Precio agresivo:** $7/mes vs $15 de Wispr Flow
3. **Core focus:** Dictate + Reader + Transcribe; resto es Pro/Labs
4. **Márgenes mínimos:** Usamos Groq/DeepInfra para costos ~$1-3/usuario

### Viabilidad Financiera
- Usuario típico: $7 ingreso - $1 costo = **$6 margen (86%)**
- Power user: $7 ingreso - $3 costo = **$4 margen (57%)**
- Whale (edge case): break-even con límites de fair-use

### Timeline
- **Semana 1-2:** Backend básico + auth + proxy funcionando
- **Semana 3:** Billing con Stripe
- **Semana 4-5:** Features Pro + polish
- **Semana 6:** Beta ready

### Próximos Pasos Inmediatos
1. ✅ Crear cuentas en Groq, DeepInfra, DeepSeek
2. ✅ Setup Supabase + Vercel
3. ✅ Implementar auth + primer proxy endpoint
4. ✅ Reorganizar sidebar en la app
