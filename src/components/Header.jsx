import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';

/**
 * Universal Header Component
 *
 * @param {Object} props
 * @param {string} [props.title] - Explicit custom title string
 * @param {boolean} [props.showBack=false] - Show back navigation button
 * @param {Function} [props.onBack] - Back button click handler
 * @param {React.ReactNode} [props.rightAction] - Optional extra action (e.g. lock button)
 * @param {boolean} [props.isQueueOpen] - Optional badge indicating queue status
 */
export default function Header({
  title,
  showBack = false,
  onBack,
  rightAction,
  isQueueOpen,
}) {
  const { lang, toggleLang } = useLanguage();
  const t = labels[lang];

  const displayTitle = title || t.salonName;

  return (
    <header className="sticky top-0 z-40 bg-charcoal/95 backdrop-blur-md border-b border-gold/20 px-4 py-3 sm:px-6">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Left: Back button or brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          {showBack && (
            <button
              onClick={onBack || (() => window.history.back())}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/20 text-gold transition border border-white/10"
              aria-label={t.common.back}
            >
              ←
            </button>
          )}
          <h1 className="text-gold text-lg sm:text-xl font-bold truncate tracking-wide">
            {displayTitle}
          </h1>

          {/* Optional status pill indicator if passed */}
          {typeof isQueueOpen === 'boolean' && (
            <span
              className={`hidden xs:inline-flex text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                isQueueOpen
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 border-red-500/30'
              }`}
            >
              {isQueueOpen ? t.home.queueOpen : t.home.queueClosed}
            </span>
          )}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 shrink-0">
          {rightAction}

          {/* Language Toggle Button */}
          <button
            onClick={toggleLang}
            className="px-3 py-1 text-xs font-semibold rounded-full border border-gold/50 text-gold hover:bg-gold/10 active:bg-gold/20 transition shadow-sm"
            title="Toggle English / ગુજરાતી"
          >
            {t.langToggle}
          </button>
        </div>
      </div>
    </header>
  );
}
