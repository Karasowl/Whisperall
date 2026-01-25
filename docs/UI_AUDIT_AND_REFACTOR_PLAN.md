# Whisperall UI Audit & Refactor Plan

**Author:** Senior Product Designer + Frontend Architect
**Date:** January 2026
**Status:** Proposal Draft

---

## Executive Summary

### Patrón Base Inferido de Screenshots

Tras analizar los 16 screenshots proporcionados, identifico un **patrón conceptual común** que NO se aplica consistentemente:

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER: Title + Description + [ExecutionControls?] + [Actions?] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │ CONTROLS/SETTINGS   │    │ INPUT / OUTPUT AREA          │   │
│  │ - Engine Selector   │    │ - Dropzone / Text Area       │   │
│  │ - Model Selector    │    │ - Preview / Result           │   │
│  │ - Voice/Params      │    │                              │   │
│  │ - Advanced          │    │                              │   │
│  └─────────────────────┘    └──────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ [SIDEBAR/INFO PANEL]: Tips, Status, Primary CTA            ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Hallazgo crítico:** Existe un sistema de componentes modulares en `components/module/` (ModuleShell, ModuleHeader, SettingsPanel, ActionBar) que **NO se usa** en la mayoría de módulos. Cada página implementa su propio layout manualmente.

---

## 1. Diagnóstico de Inconsistencias

### 1.1 Layout & Estructura de Grid

| Módulo | Estructura Actual | Problema |
|--------|------------------|----------|
| Voice Changer | 2 cols (controls 66% / info 33%) | No usa ModuleShell |
| Music Generator | 2 cols (config 66% / info 33%) | Grid custom |
| SFX Generator | 2 cols (input 66% / info 33%) | Patrón similar pero diferente spacing |
| Audiobook Creator | 1 col centrada | Sin panel de info lateral |
| AI Text Editing | 3 cols (command / input / output) | Layout único |
| Live Transcription | 1 col con header actions | Minimalista |
| Voice Library | Grid de cards | Layout especial (correcto) |
| Transcription | 2 cols (dropzone 66% / settings 33%) | Settings a la derecha |
| Speech to Text | 2 cols (controls 50% / output 50%) | Proporción diferente |
| Reader | 2 cols (controls / input) | Usa algunos componentes |

**Inconsistencias detectadas:**
- No hay consenso sobre la posición del panel de Settings (izquierda vs derecha)
- Las proporciones de columnas varían (50/50, 66/33, 100)
- El panel de info/tips aparece en ubicaciones diferentes
- No existe un sistema de breakpoints unificado

### 1.2 Componentes & Patrones Visuales

#### ExecutionControls (Auto/GPU/CPU/CUDA/Fast)

| Módulo | Ubicación | Visibilidad |
|--------|-----------|-------------|
| Reader | Header, bajo título | Siempre visible |
| Audiobook Creator | Header, esquina derecha | Siempre visible |
| Voice Library | No aplica | N/A |
| Music Generator | No aparece | Ausente |
| Voice Changer | No aparece | Ausente |
| Transcription | No aparece | Ausente |
| AI Text Editing | No aparece | Ausente |

**Problema:** Los controles de ejecución solo aparecen en 2 de ~12 módulos, cuando deberían ser consistentes para todos los módulos con modelos locales.

#### Engine/Provider Selector

| Módulo | Componente | Estilo |
|--------|-----------|--------|
| Voice Changer | Custom cards grid | Border-2, padding-4, iconos custom |
| Music Generator | UnifiedProviderSelector | Dropdown estándar |
| SFX Generator | UnifiedProviderSelector | Dropdown (colapsado) |
| Transcription | Dropdown custom | STT Engine label |
| Speech to Text | UnifiedProviderSelector | Con label "Transcription Engine" |
| Reader | UnifiedProviderSelector | TTS Engine dropdown |
| AI Text Editing | Dropdown "AI Provider" | Loading state visible |

**Problema:** 3 patrones diferentes para lo mismo:
1. Cards grid seleccionable (Voice Changer)
2. Dropdown estándar (UnifiedProviderSelector)
3. Dropdown custom con loading states diferentes

#### Primary CTA (Call to Action)

| Módulo | Label | Ubicación | Estilo |
|--------|-------|-----------|--------|
| Voice Changer | "Transform Voice" | Sidebar derecho | btn-primary w-full py-4 |
| Music Generator | "Generate Music" | Sidebar derecho | Similar |
| SFX Generator | "Generate SFX" | Sidebar derecho | Similar |
| AI Text Editing | "Apply Command" | Panel izquierdo | btn dentro de card |
| Speech to Text | "Start Dictation" | Panel izquierdo | btn dentro de controls |
| Reader | "Read Clipboard" | Panel izquierdo | btn-secondary |
| Live Transcription | "Start Capture" | Header inline | btn outline |
| Audiobook Creator | No visible en screenshot | - | - |
| Transcription | No visible (Dropzone as CTA) | - | - |

**Problema:**
- Labels inconsistentes (Generate vs Transform vs Apply vs Start)
- Ubicación variable (sidebar vs inline vs panel)
- Jerarquía visual diferente

#### Output/Result Panel

| Módulo | Formato | Ubicación |
|--------|---------|-----------|
| Voice Changer | Audio player + Download btn | Inline, debajo de progress |
| Music Generator | Audio player | Similar |
| AI Text Editing | Textarea "AI Output" | Columna derecha |
| Speech to Text | Textarea "Transcription" | Columna derecha |
| Reader | AudioPlayer component | Debajo del input |
| Transcription | (No visible en estado inicial) | - |

**Problema:** No hay un componente OutputPanel estandarizado.

### 1.3 Jerarquía Visual & Tipografía

| Elemento | Variantes Observadas |
|----------|---------------------|
| Page Title | `text-4xl font-bold` vs `module-title` class |
| Section Headers | `text-lg font-semibold` vs `label` class vs sin título |
| Card Headers | Iconos + texto vs solo texto vs badge de estado |
| Description | `text-foreground-secondary` vs `text-foreground-muted` |

### 1.4 Estados de Interfaz

**Estados no estandarizados:**
- Loading: Spinner inline vs skeleton vs overlay
- Error: Alert banner vs inline text vs modal
- Empty: Texto simple vs ilustración + texto
- Disabled: Opacity variable (0.5, 0.6, "opacity-50 cursor-not-allowed")
- CUDA unavailable: No hay patrón definido
- API key missing: Warning inline vs badge vs tooltip

### 1.5 Iconografía

| Concepto | Iconos Usados |
|----------|--------------|
| Engine/Provider | Wand2, Cloud, Cpu, Gpu (inconsistente) |
| Voice | Mic, Volume2, User |
| Audio | Volume2, Music, Play |
| Settings | Settings2, ChevronDown |
| Upload | Upload, FilePlus |
| Download | Download |
| Processing | Loader2, Sparkles |

### 1.6 Copy & Microcopy

| Pattern | Variantes |
|---------|-----------|
| Provider type badge | "Local" / "API" / "30 min/mo" / quota text |
| Install prompt | "(install model)" / "Download in Models" |
| API key warning | "API key required" / "Configure in Settings" / "Check your API key" |

---

## 2. Propuesta de Arquitectura UI

### 2.1 ModuleShell Mejorado

El componente existente `ModuleShell` es una buena base pero necesita extensiones:

```tsx
// Propuesta de API extendida
interface ModuleShellProps {
  // === METADATA ===
  title: string;
  description?: string;
  icon?: LucideIcon;
  moduleId: ModuleId; // Para persistencia y analytics

  // === LAYOUT ===
  layout: 'default' | 'split' | 'centered' | 'wide';
  /*
    default: 3 cols (settings 1/3, main 2/3) - Voice Changer, Music
    split: 2 cols iguales (controls / output) - STT, AI Edit
    centered: 1 col centrada - Audiobook, Voice Library
    wide: Full width sin sidebar - Live Transcription
  */

  // === SLOTS ===
  headerActions?: React.ReactNode;        // Botones en header
  executionControls?: React.ReactNode;    // Auto/GPU/CPU badge cluster
  engineSelector?: React.ReactNode;       // Provider + Model selector
  settings?: React.ReactNode;             // Configuración específica
  input?: React.ReactNode;                // Input area (dropzone, textarea, etc.)
  output?: React.ReactNode;               // Output area (audio, text, etc.)
  sidebar?: React.ReactNode;              // Info panel / Tips / CTA
  actions?: React.ReactNode;              // ActionBar con Primary/Secondary

  // === BEHAVIOR ===
  settingsPosition?: 'left' | 'right';    // Default: left
  sidebarPosition?: 'left' | 'right';     // Default: right
  settingsCollapsible?: boolean;
  persistKey?: string;                    // Para localStorage

  // === STATUS ===
  isLoading?: boolean;
  loadingText?: string;
  error?: ServiceError | null;
  onErrorDismiss?: () => void;
  progress?: ProgressState | null;

  // === STATES ===
  emptyState?: EmptyStateConfig;
  modelUnavailable?: ModelUnavailableConfig;
  apiKeyMissing?: string;                 // Provider name
}
```

### 2.2 Inventario de Componentes Reutilizables

#### Tier 1: Layout Components

| Componente | Responsabilidad | Estado Actual |
|------------|-----------------|---------------|
| `ModuleShell` | Layout wrapper con slots | Existente, mejorar |
| `ModuleHeader` | Title + description + actions | Existente |
| `SettingsPanel` | Panel colapsable de config | Existente |
| `SidebarPanel` | Panel de info/tips/CTA | **NUEVO** |
| `ContentArea` | Wrapper para input/output | **NUEVO** |

#### Tier 2: Control Components

| Componente | Responsabilidad | Estado Actual |
|------------|-----------------|---------------|
| `ExecutionModeSwitch` | Auto/GPU/CPU/CUDA/Fast | **NUEVO** |
| `UnifiedProviderSelector` | Provider + Model dropdown | Existente, mejorar |
| `EngineCard` | Card seleccionable para provider | **NUEVO** |
| `EngineCardGrid` | Grid de EngineCards | **NUEVO** |
| `ModelVariantSelector` | Chips/Tabs para variantes | **NUEVO** |
| `VoiceSelector` | Selector de voces con preview | Existente parcial |
| `DynamicParamsEditor` | Editor de params según provider | Existente |
| `AdvancedSettings` | Accordion de settings avanzados | Existente |

#### Tier 3: Input/Output Components

| Componente | Responsabilidad | Estado Actual |
|------------|-----------------|---------------|
| `Dropzone` | Upload de archivos | Existente inline |
| `TextInputArea` | Textarea con contador | Parcial |
| `AudioOutputPanel` | Player + Download + Info | **NUEVO** |
| `TextOutputPanel` | Textarea readonly + Copy | **NUEVO** |
| `TranscriptViewer` | Viewer con speakers | Existente parcial |

#### Tier 4: Feedback Components

| Componente | Responsabilidad | Estado Actual |
|------------|-----------------|---------------|
| `StatusAlert` | Error/Warning/Info banner | Existente |
| `EmptyState` | Estado vacío con ilustración | Existente |
| `ProgressBar` | Barra de progreso | Existente |
| `ActionBar` | Primary + Secondary CTAs | Existente |
| `LoadingOverlay` | Overlay de procesamiento | **NUEVO** |
| `ModelUnavailableCard` | Estado cuando modelo no instalado | **NUEVO** |

### 2.3 Reglas de Composición vs Especialización

#### Composición (preferida)
Usar slots del ModuleShell con componentes genéricos:

```tsx
// Ejemplo: Voice Changer
<ModuleShell
  title="Voice Changer"
  description="Transform any voice..."
  layout="default"
  executionControls={<ExecutionModeSwitch />}
  engineSelector={
    <EngineCardGrid
      providers={providers}
      selected={selected}
      onChange={setSelected}
    />
  }
  settings={
    <>
      <VoiceSelector voices={voices} />
      <AdvancedSettings params={advancedParams} />
    </>
  }
  input={<Dropzone accept="audio/*" onFile={handleFile} />}
  output={result && <AudioOutputPanel audio={result} />}
  sidebar={<InfoPanel tips={tips} />}
  actions={
    <ActionBar
      primary={{ label: "Transform Voice", onClick: handleTransform }}
    />
  }
/>
```

#### Especialización (cuando necesario)
Crear componentes específicos solo cuando:
1. La lógica de negocio es única (ej: LyricsEditor para Music)
2. La interacción es compleja (ej: TranscriptEditor con speakers)
3. Hay más de 3 módulos con el mismo patrón especializado

```tsx
// Ejemplo: Componente especializado justificado
<MusicLyricsEditor
  lyrics={lyrics}
  format="lrc"
  onLoad={handleLoadExample}
  validation={validateLRC}
/>
```

---

## 3. Reglas de Layout por Breakpoint

### 3.1 Sistema de Grid

```css
/* Breakpoints */
--breakpoint-sm: 640px;   /* Mobile landscape */
--breakpoint-md: 768px;   /* Tablet portrait */
--breakpoint-lg: 1024px;  /* Tablet landscape / Small desktop */
--breakpoint-xl: 1280px;  /* Desktop */
--breakpoint-2xl: 1536px; /* Large desktop */
```

### 3.2 Desktop (>= 1024px)

**Layout Default (2/3 split):**
```
┌─────────────────────────────────────────────────────────────┐
│ ModuleHeader + ExecutionControls (right-aligned)            │
├───────────────────────┬─────────────────────────────────────┤
│ SettingsPanel         │ Main Content Area                   │
│ (1/3 width, sticky)   │ (2/3 width)                         │
│                       │                                     │
│ - EngineSelector      │ - Input (Dropzone/TextArea)         │
│ - ModelSelector       │ - Output (Audio/Text)               │
│ - Settings            │                                     │
│ - ActionBar           │                                     │
│                       │                                     │
└───────────────────────┴─────────────────────────────────────┘
```

**Layout Split (50/50):**
```
┌─────────────────────────────────────────────────────────────┐
│ ModuleHeader + ExecutionControls                            │
├────────────────────────────┬────────────────────────────────┤
│ Input Panel                │ Output Panel                   │
│ (1/2 width)                │ (1/2 width)                    │
│                            │                                │
│ - EngineSelector           │ - Result Area                  │
│ - Controls                 │ - Copy/Export                  │
│ - TextArea/Dropzone        │                                │
│ - ActionBar                │                                │
└────────────────────────────┴────────────────────────────────┘
```

**Layout Centered:**
```
┌─────────────────────────────────────────────────────────────┐
│ ModuleHeader + ExecutionControls (centered)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              ┌─────────────────────────────┐                │
│              │ Main Content (max-w-4xl)    │                │
│              │                             │                │
│              │ - Dropzone/Input            │                │
│              │ - Output                    │                │
│              │ - Actions                   │                │
│              └─────────────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Tablet (768px - 1023px)

**Todos los layouts colapsan a 1 columna:**

```
┌─────────────────────────────────┐
│ ModuleHeader                    │
│ ExecutionControls               │
├─────────────────────────────────┤
│ EngineSelector                  │
├─────────────────────────────────┤
│ Input Area                      │
├─────────────────────────────────┤
│ Settings (colapsable)           │
├─────────────────────────────────┤
│ Output Area                     │
├─────────────────────────────────┤
│ ActionBar (sticky bottom?)      │
└─────────────────────────────────┘
```

### 3.4 Mobile (< 768px)

**Orden de apilamiento estricto:**

1. **ModuleHeader** (title + description reducida)
2. **ExecutionControls** (chips compactos)
3. **EngineSelector** (dropdown, no cards)
4. **Input** (Dropzone/TextArea full width)
5. **Settings** (colapsado por defecto, acordeón)
6. **Output** (full width)
7. **ActionBar** (sticky bottom, fixed)

```css
/* Mobile ActionBar */
.action-bar-mobile {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--spacing-4);
  background: var(--surface-1);
  border-top: 1px solid var(--glass-border);
  z-index: 50;
}
```

---

## 4. Design System Mínimo Viable

### 4.1 Spacing Tokens

```css
:root {
  /* Base unit: 4px */
  --spacing-0: 0;
  --spacing-1: 0.25rem;  /* 4px */
  --spacing-2: 0.5rem;   /* 8px */
  --spacing-3: 0.75rem;  /* 12px */
  --spacing-4: 1rem;     /* 16px */
  --spacing-5: 1.25rem;  /* 20px */
  --spacing-6: 1.5rem;   /* 24px */
  --spacing-8: 2rem;     /* 32px */
  --spacing-10: 2.5rem;  /* 40px */
  --spacing-12: 3rem;    /* 48px */

  /* Component-specific */
  --module-header-gap: var(--spacing-2);
  --module-section-gap: var(--spacing-6);
  --card-padding: var(--spacing-6);
  --card-padding-compact: var(--spacing-4);
  --input-padding: var(--spacing-3) var(--spacing-4);
}
```

### 4.2 Border Radius Tokens

```css
:root {
  --radius-sm: 0.375rem;  /* 6px - inputs, badges */
  --radius-md: 0.5rem;    /* 8px - buttons */
  --radius-lg: 0.75rem;   /* 12px - cards pequeñas */
  --radius-xl: 1rem;      /* 16px - cards, dropzone */
  --radius-2xl: 1.5rem;   /* 24px - modals */
  --radius-full: 9999px;  /* pills, avatars */
}
```

### 4.3 Elevation Tokens

```css
:root {
  /* Glass effect (actual) */
  --glass-bg: rgba(30, 41, 59, 0.8);
  --glass-border: rgba(255, 255, 255, 0.1);

  /* Surfaces */
  --surface-0: var(--background);    /* Page bg */
  --surface-1: var(--glass-bg);      /* Cards */
  --surface-2: rgba(255, 255, 255, 0.05); /* Hover, nested */
  --surface-3: rgba(255, 255, 255, 0.1);  /* Active states */

  /* Elevation no usa sombras (glass effect) */
}
```

### 4.4 Typography Scale

```css
:root {
  /* Sizes */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
  --text-4xl: 2.25rem;    /* 36px */

  /* Semantic */
  --module-title-size: var(--text-4xl);
  --module-description-size: var(--text-lg);
  --section-title-size: var(--text-lg);
  --label-size: var(--text-sm);
  --body-size: var(--text-base);
  --caption-size: var(--text-xs);
}
```

### 4.5 Button Standards

```css
/* Primary CTA (Generate, Transform, Start) */
.btn-cta {
  @apply w-full py-4 px-6;
  @apply bg-accent-primary text-black;
  @apply font-semibold text-base;
  @apply rounded-xl;
  @apply flex items-center justify-center gap-2;
  @apply transition-all duration-200;
  @apply hover:brightness-110;
  @apply disabled:opacity-50 disabled:cursor-not-allowed;
}

/* Secondary */
.btn-secondary {
  @apply px-4 py-2;
  @apply bg-surface-2 text-foreground;
  @apply rounded-lg;
  @apply hover:bg-surface-3;
}

/* Outline */
.btn-outline {
  @apply px-4 py-2;
  @apply border border-glass-border;
  @apply bg-transparent text-foreground;
  @apply rounded-lg;
  @apply hover:bg-surface-2;
}
```

### 4.6 Card Standards

```css
/* Glass card (patrón actual) */
.glass-card {
  @apply bg-glass-bg backdrop-blur-xl;
  @apply border border-glass-border;
  @apply rounded-xl;
  @apply p-6;
}

/* Selectable card (para Engine/Voice selection) */
.selectable-card {
  @apply glass-card;
  @apply cursor-pointer;
  @apply transition-all duration-200;
  @apply hover:border-accent-primary/50;
}

.selectable-card[data-selected="true"] {
  @apply border-accent-primary;
  @apply bg-accent-primary/10;
}

.selectable-card:disabled {
  @apply opacity-50 cursor-not-allowed;
}
```

### 4.7 Icon Standards

| Contexto | Icono Estándar | Tamaño |
|----------|---------------|--------|
| Module icon | Contextual | w-6 h-6 |
| Engine local | Cpu | w-4 h-4 |
| Engine API | Cloud | w-4 h-4 |
| Settings | Settings2 | w-5 h-5 |
| Input | Upload | w-5 h-5 |
| Output | Download | w-5 h-5 |
| Play audio | Play | w-5 h-5 |
| Loading | Loader2 (animate-spin) | w-5 h-5 |
| Error | AlertCircle | w-5 h-5 |
| Warning | AlertTriangle | w-5 h-5 |
| Info | Info | w-4 h-4 |
| GPU | Gpu / MonitorSmartphone | w-4 h-4 |
| Voice | Mic | w-4 h-4 |

---

## 5. Plan de Migración (Strangler Pattern)

### 5.1 Fases de Implementación

#### Fase 0: Preparación (Prerequisitos)
- [ ] Crear branch `refactor/module-shell-v2`
- [ ] Documentar breaking changes esperados
- [ ] Setup visual regression tests (si no existen)

#### Fase 1: Foundation Components (Mayor Impacto)

**Semana 1-2:**

| Componente | Archivos a Modificar | Impacto |
|------------|---------------------|---------|
| ExecutionModeSwitch | NUEVO | Alto - Unifica controles en 10+ módulos |
| ModuleHeader v2 | components/module/ModuleHeader.tsx | Alto |
| StatusAlert unificado | Ya existe, verificar uso | Medio |

```tsx
// ExecutionModeSwitch.tsx (NUEVO)
interface ExecutionModeSwitchProps {
  mode: 'auto' | 'cuda' | 'cpu';
  onModeChange: (mode: 'auto' | 'cuda' | 'cpu') => void;
  cudaAvailable?: boolean;
  fastMode?: boolean;
  onFastModeChange?: (fast: boolean) => void;
  compact?: boolean; // Para mobile
}
```

**Criterio de éxito:** Los controles Auto/GPU/CPU aparecen en la misma posición en todos los módulos con modelos locales.

#### Fase 2: Provider Selection Unification

**Semana 3-4:**

| Componente | Archivos a Modificar | Impacto |
|------------|---------------------|---------|
| EngineCard | NUEVO | Medio |
| EngineCardGrid | NUEVO | Medio |
| UnifiedProviderSelector v2 | components/UnifiedProviderSelector.tsx | Alto |

**Estrategia:**
1. Crear EngineCard como componente atómico
2. Crear EngineCardGrid como composición
3. Modificar UnifiedProviderSelector para soportar ambos modos (dropdown vs cards)
4. Migrar Voice Changer (usa cards) como piloto
5. Opcionalmente, otros módulos pueden usar cards si el espacio lo permite

#### Fase 3: Output Components

**Semana 5-6:**

| Componente | Módulos que lo usarán |
|------------|---------------------|
| AudioOutputPanel | Voice Changer, Music, SFX, Reader, TTS |
| TextOutputPanel | AI Editor, STT, Transcription |

```tsx
// AudioOutputPanel.tsx
interface AudioOutputPanelProps {
  audioUrl: string;
  filename?: string;
  onDownload?: () => void;
  metadata?: {
    duration?: string;
    provider?: string;
    model?: string;
  };
  showWaveform?: boolean;
}
```

#### Fase 4: ModuleShell Integration

**Semana 7-10:**

Migrar módulos uno por uno al nuevo ModuleShell:

| Orden | Módulo | Complejidad | Razón de prioridad |
|-------|--------|-------------|-------------------|
| 1 | Reader | Baja | Ya usa algunos componentes, buen piloto |
| 2 | Speech to Text | Baja | Similar a Reader |
| 3 | AI Text Editing | Media | Layout split (50/50) |
| 4 | Audiobook Creator | Baja | Layout centered |
| 5 | Voice Changer | Media | EngineCards + Sidebar |
| 6 | Music Generator | Media | Similar a Voice Changer |
| 7 | SFX Generator | Media | Similar |
| 8 | Transcription | Media | Settings panel derecho |
| 9 | Live Transcription | Baja | Layout wide |
| 10 | Voice Library | Baja | Layout especial (grid) |

### 5.2 Estrategia de Migración por Módulo

```tsx
// ANTES (voice-changer/page.tsx actual - 670 líneas)
export default function VoiceChangerPage() {
  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header manual */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold...">Voice Changer</h1>
        <p className="text-foreground-secondary...">Transform any voice...</p>
      </div>

      {/* Error alert manual */}
      {error && <div className="card p-4 flex...">...</div>}

      {/* Grid manual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 600+ líneas de JSX */}
      </div>
    </div>
  );
}

// DESPUÉS (~150 líneas de lógica + composición)
export default function VoiceChangerPage() {
  // ... hooks y lógica (sin cambios significativos) ...

  return (
    <ModuleShell
      title="Voice Changer"
      description="Transform any voice into a different voice using AI speech-to-speech technology"
      icon={Wand2}
      layout="default"

      executionControls={
        currentProvider?.type === 'local' && (
          <ExecutionModeSwitch mode={device} onModeChange={setDevice} />
        )
      }

      engineSelector={
        <EngineCardGrid
          providers={providers}
          selected={selectedProvider}
          onSelect={setSelectedProvider}
          loading={loadingProviders}
        />
      }

      settings={
        <VoiceChangerSettings
          voices={voices}
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          advanced={showAdvanced}
          onAdvancedChange={setShowAdvanced}
          // ... etc
        />
      }

      input={
        <Dropzone
          file={audioFile}
          onFile={handleFileSelect}
          accept="audio/*"
          maxSize={50 * 1024 * 1024}
          uploading={isUploading}
        />
      }

      output={
        currentJob?.status === 'completed' && (
          <AudioOutputPanel
            audioUrl={getVoiceChangerDownloadUrl(currentJob.id)}
            onDownload={handleDownload}
          />
        )
      }

      sidebar={
        <VoiceChangerSidebar
          provider={currentProviderInfo}
          selectedModel={selectedModel}
          selectedVoice={selectedVoiceInfo}
        />
      }

      actions={
        <ActionBar
          primary={{
            label: "Transform Voice",
            icon: Wand2,
            onClick: handleConvert,
            disabled: !audioPath || !selectedVoice || !currentProviderInfo?.ready,
          }}
          loading={isProcessing}
          loadingText="Converting..."
        />
      }

      progress={isProcessing && currentJob ? {
        value: currentJob.progress * 100,
        status: "Converting voice...",
        details: currentJob.status,
      } : undefined}

      error={error}
      onErrorDismiss={() => setError(null)}
    />
  );
}
```

### 5.3 Archivos a Crear/Modificar

```
ui/frontend/src/
├── components/
│   ├── module/
│   │   ├── ModuleShell.tsx        # MODIFICAR (agregar slots)
│   │   ├── ModuleHeader.tsx       # MODIFICAR (estandarizar)
│   │   ├── SettingsPanel.tsx      # OK
│   │   ├── ActionBar.tsx          # OK
│   │   ├── StatusAlert.tsx        # OK
│   │   ├── EmptyState.tsx         # OK
│   │   ├── SidebarPanel.tsx       # NUEVO
│   │   ├── ExecutionModeSwitch.tsx # NUEVO
│   │   ├── AudioOutputPanel.tsx   # NUEVO
│   │   ├── TextOutputPanel.tsx    # NUEVO
│   │   └── index.ts               # MODIFICAR (exports)
│   ├── engine/
│   │   ├── EngineCard.tsx         # NUEVO
│   │   ├── EngineCardGrid.tsx     # NUEVO
│   │   └── index.ts               # NUEVO
│   └── Dropzone.tsx               # EXTRAER de módulos
├── styles/
│   └── tokens.css                 # NUEVO (design tokens centralizados)
└── app/
    ├── reader/page.tsx            # MIGRAR (Fase 4, semana 7)
    ├── dictate/page.tsx           # MIGRAR (Fase 4, semana 7)
    ├── ai-edit/page.tsx           # MIGRAR (Fase 4, semana 8)
    ├── audiobook/page.tsx         # MIGRAR (Fase 4, semana 8)
    ├── voice-changer/page.tsx     # MIGRAR (Fase 4, semana 9)
    ├── music/page.tsx             # MIGRAR (Fase 4, semana 9)
    ├── sfx/page.tsx               # MIGRAR (Fase 4, semana 10)
    ├── transcribe/page.tsx        # MIGRAR (Fase 4, semana 10)
    └── loopback/page.tsx          # MIGRAR (Fase 4, semana 10)
```

---

## 6. Acceptance Criteria & QA Checklist

### 6.1 Checklist de Consistencia Visual

#### Por Módulo:

- [ ] **Header**
  - [ ] Título usa clase `module-title` (text-4xl font-bold)
  - [ ] Descripción usa `module-description` (text-lg text-foreground-secondary)
  - [ ] Icono del módulo presente (opcional pero consistente)
  - [ ] Spacing correcto (gap-2 entre título y descripción)

- [ ] **ExecutionControls**
  - [ ] Aparece en todos los módulos con modelos locales
  - [ ] Ubicación consistente (header-right o bajo título)
  - [ ] Estados: auto (default), cuda (si disponible), cpu
  - [ ] Fast mode toggle presente si aplica
  - [ ] Indicador CUDA available/unavailable

- [ ] **Engine/Provider Selector**
  - [ ] Componente UnifiedProviderSelector o EngineCardGrid
  - [ ] Muestra badge "Local" o "API"
  - [ ] Estado de carga visible
  - [ ] Provider no disponible: disabled + mensaje
  - [ ] API key missing: warning visible

- [ ] **Settings Panel**
  - [ ] Título "Settings" consistente (si aplica)
  - [ ] Colapsable en móvil
  - [ ] Sticky en desktop (top-24)
  - [ ] Spacing interno: gap-4 entre secciones

- [ ] **Primary CTA**
  - [ ] Estilo `btn-cta` (py-4, full width en sidebar)
  - [ ] Icono + label
  - [ ] Estado loading con Loader2
  - [ ] Estado disabled cuando no hay inputs válidos

- [ ] **Output Panel**
  - [ ] AudioOutputPanel para audio (player + download)
  - [ ] TextOutputPanel para texto (readonly + copy)
  - [ ] Badge de estado (completed, etc.)

### 6.2 Checklist de Accesibilidad (a11y)

- [ ] **Focus Order**
  - [ ] Tab order lógico (header → controls → input → output → actions)
  - [ ] Focus visible en todos los elementos interactivos
  - [ ] Skip link disponible (opcional)

- [ ] **Keyboard Navigation**
  - [ ] Todos los botones accesibles via Enter/Space
  - [ ] Dropdowns navegables con flechas
  - [ ] Escape cierra modales/dropdowns
  - [ ] Cards seleccionables con Enter

- [ ] **Screen Reader**
  - [ ] Labels en todos los inputs (htmlFor)
  - [ ] aria-label en icon-only buttons
  - [ ] aria-live regions para estados dinámicos
  - [ ] aria-busy durante loading

- [ ] **Contraste**
  - [ ] Texto principal: ratio >= 4.5:1
  - [ ] Texto grande: ratio >= 3:1
  - [ ] Elementos interactivos: ratio >= 3:1
  - [ ] Focus ring visible

### 6.3 Checklist de Estados

| Estado | Componente Responsable | Criterio |
|--------|----------------------|----------|
| Loading inicial | ModuleShell + Skeleton | Skeleton o spinner centrado |
| Loading acción | ActionBar | Spinner + texto "Processing..." |
| Error general | StatusAlert (error) | Banner rojo, dismissible |
| Error de validación | Inline bajo input | Texto rojo, icono AlertCircle |
| Empty state | EmptyState | Ilustración + texto + CTA |
| No model selected | ModelUnavailableCard | Card con link a Models |
| Model not installed | ModelUnavailableCard | Badge "(install model)" + link |
| Engine unavailable | EngineCard disabled | Opacity 0.5, cursor not-allowed |
| CUDA not supported | ExecutionModeSwitch | Badge "CPU only" |
| API key missing | StatusAlert (warning) | Banner amarillo + link a Settings |
| Rate limited | StatusAlert (warning) | "Rate limited. Try again in X" |
| Quota exceeded | StatusAlert (error) | "Quota exceeded for this provider" |

### 6.4 Regression Tests Sugeridos

```typescript
// Ejemplo: test de consistencia de layout
describe('ModuleShell Consistency', () => {
  const modules = [
    'reader',
    'dictate',
    'ai-edit',
    'voice-changer',
    'music',
    'sfx',
    'transcribe',
    'audiobook',
  ];

  modules.forEach(module => {
    it(`${module} renders ModuleShell with correct slots`, async () => {
      render(<ModulePage module={module} />);

      // Header presente
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      // Si tiene modelos locales, ExecutionControls presente
      if (hasLocalModels(module)) {
        expect(screen.getByTestId('execution-mode-switch')).toBeInTheDocument();
      }

      // Engine selector presente
      expect(screen.getByTestId('engine-selector')).toBeInTheDocument();

      // ActionBar presente
      expect(screen.getByRole('button', { name: /generate|transform|start|apply/i })).toBeInTheDocument();
    });
  });
});
```

---

## Anexo A: Mapeo Módulo → Layout

| Módulo | Layout | Settings Position | Sidebar | Razón |
|--------|--------|-------------------|---------|-------|
| Text to Speech (page.tsx) | default | left | right (info) | Estándar de TTS |
| Reader | default | left | right (tips) | Similar a TTS |
| Speech to Text | split | left | none | Input/Output paralelo |
| Transcribe | default | right | none | Settings extensos |
| Voice Library | centered | none | none | Grid especial |
| Live Transcription | wide | none | none | Minimal |
| AI Text Editing | split | left | none | Input/Output paralelo |
| Audiobook Creator | centered | none | none | Dropzone simple |
| Voice Changer | default | left | right | Engine cards + tips |
| Music Generator | default | left | right | Similar |
| SFX Generator | default | left | right | Similar |
| Voice Isolator | default | left | right | Similar |
| Dubbing | default | left | right | Similar |

---

## Anexo B: Excepciones Justificadas

### Voice Library
**No usa ModuleShell estándar.**
**Razón:** Es un CRUD de recursos, no un módulo de procesamiento. Layout de grid de cards es apropiado.

### Live Transcription
**Layout minimal sin sidebar.**
**Razón:** Interfaz real-time donde el foco está en el transcript en vivo. Menos elementos = menos distracción.

### History
**No usa ModuleShell.**
**Razón:** Vista de lista/tabla, no de procesamiento.

### Models
**No usa ModuleShell.**
**Razón:** Vista de gestión de recursos (descargas).

### Settings
**No usa ModuleShell.**
**Razón:** Página de configuración global, no módulo de procesamiento.

---

## Changelog

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 0.1 | 2026-01-23 | Draft inicial con diagnóstico y propuesta |
