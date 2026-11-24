import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';

export default function Header({ titleKey }) {
  const { lang, toggleLang } = useLanguage();
  const t = labels[lang];

  const title = titleKey ? t[titleKey]?.title ?? t.salonName : t.salonName;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gold/20">
      <h1 className="text-gold text-xl font-bold truncate">{title}</h1>
      <button
        onClick={toggleLang}
        className="ml-3 shrink-0 px-3 py-1 text-sm rounded-full border border-gold/50 text-gold hover:bg-gold/10 active:bg-gold/20 transition"
      >
        {t.langToggle}
      </button>
    </header>
  );
}
