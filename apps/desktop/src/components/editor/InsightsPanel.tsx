import { useT } from '../../lib/i18n';

const ACTION_KEYS = ['insights.review', 'insights.share', 'insights.followUp'] as const;

export function InsightsPanel() {
  const t = useT();
  return (
    <aside className="w-[360px] bg-surface border-l border-edge flex-col hidden xl:flex" data-testid="insights-panel">
      <div className="p-5 border-b border-edge flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">auto_awesome</span>
        <h3 className="text-text font-bold text-lg">{t('insights.title')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="bg-base/50 rounded-xl p-4 border border-edge">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">{t('insights.summary')}</h4>
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('insights.placeholder')} <strong className="text-text">{t('insights.option')}</strong> {t('insights.optionEnd')}
          </p>
        </div>
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">{t('insights.topics')}</h4>
          <div className="flex flex-wrap gap-2">
            {['#Topic1', '#Topic2', '#Topic3'].map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full bg-edge/50 text-xs text-text-secondary border border-edge hover:border-primary hover:text-primary cursor-pointer transition-colors">{tag}</span>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">{t('insights.actions')}</h4>
          <div className="space-y-2">
            {ACTION_KEYS.map((key) => (
              <label key={key} className="flex items-start gap-3 p-3 rounded-lg hover:bg-base/50 cursor-pointer group transition-colors">
                <input type="checkbox" className="mt-1 rounded border-edge bg-base text-primary focus:ring-offset-0 focus:ring-0" />
                <span className="text-sm text-text-secondary group-hover:text-text">{t(key)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
