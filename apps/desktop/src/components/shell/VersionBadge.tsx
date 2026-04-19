import { useState } from 'react';
import pkg from '../../../package.json';
import { useT } from '../../lib/i18n';
import { ChangelogModal } from './ChangelogModal';

type Props = { collapsed?: boolean };

export function VersionBadge({ collapsed = false }: Props) {
  const t = useT();
  const version = (pkg as { version?: string }).version ?? '0.0.0';
  const label = `v${version}`;
  const [open, setOpen] = useState(false);

  const trigger = collapsed ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={`${t('sidebar.version')} ${label}`}
      data-testid="version-badge"
      className="mx-auto mt-1 flex items-center justify-center rounded-md px-1.5 py-0.5 text-[9px] font-mono text-muted/60 hover:text-primary hover:bg-surface transition-colors"
    >
      {label}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      data-testid="version-badge"
      className="flex items-center justify-center gap-1.5 w-full mt-1 rounded-md py-1 text-[10px] font-mono text-muted/50 hover:text-primary hover:bg-surface transition-colors"
      title={t('sidebar.version')}
    >
      <span className="material-symbols-outlined text-[12px]">deployed_code</span>
      <span>{label}</span>
    </button>
  );

  return (
    <>
      {trigger}
      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  );
}
