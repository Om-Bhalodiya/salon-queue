import Header from '../components/Header';
import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';

export default function Reception() {
  const { lang } = useLanguage();
  const t = labels[lang].reception;

  return (
    <div className="min-h-screen bg-charcoal">
      <Header titleKey="reception" />
      <main className="flex items-center justify-center px-4 py-16">
        <h2 className="text-3xl font-bold text-gold">{t.title}</h2>
      </main>
    </div>
  );
}
