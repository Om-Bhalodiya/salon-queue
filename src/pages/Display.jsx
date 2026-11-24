import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';

export default function Display() {
  const { lang } = useLanguage();
  const t = labels[lang].display;

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center">
      <h2 className="text-4xl sm:text-6xl font-bold text-gold">{t.title}</h2>
    </div>
  );
}
