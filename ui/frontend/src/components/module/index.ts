// Module Shell Components
// These components provide a consistent layout and structure for all Whisperall modules

// === LAYOUT ===
export { ModuleShell } from './ModuleShell';
export type { ModuleLayout, LegacyLayout } from './ModuleShell';

export { ModuleHeader } from './ModuleHeader';
export { SettingsPanel } from './SettingsPanel';
export { SidebarPanel } from './SidebarPanel';

// === CONTROLS ===
export { ExecutionModeSwitch } from './ExecutionModeSwitch';
export type { ExecutionMode } from './ExecutionModeSwitch';

export { EngineCard } from './EngineCard';
export type { EngineCardProps } from './EngineCard';

export { EngineCardGrid } from './EngineCardGrid';
export type { EngineProvider } from './EngineCardGrid';

// === INPUT/OUTPUT ===
export { Dropzone } from './Dropzone';
export { AudioOutputPanel } from './AudioOutputPanel';
export { TextOutputPanel } from './TextOutputPanel';

// === FEEDBACK ===
export { ActionBar } from './ActionBar';
export { StatusAlert } from './StatusAlert';
export type { AlertVariant } from './StatusAlert';
export { EmptyState } from './EmptyState';
