import Header from '../components/Header';
import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';

export default function Home() {
  const { lang } = useLanguage();
  const t = labels[lang].home;

  return (
    <div className="min-h-screen bg-charcoal">
      <Header />
      <main className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-gold mb-4">{t.title}</h2>
        <p className="text-white/70 text-lg">{t.subtitle}</p>
      </main>
    </div>
  );
}
