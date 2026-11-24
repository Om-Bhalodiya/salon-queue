import { useParams } from 'react-router-dom';
import Header from '../components/Header';
import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';

export default function Status() {
  const { id } = useParams();
  const { lang } = useLanguage();
  const t = labels[lang].status;

  return (
    <div className="min-h-screen bg-charcoal">
      <Header titleKey="status" />
      <main className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <h2 className="text-3xl font-bold text-gold mb-4">{t.title}</h2>
        <p className="text-white/50 font-mono text-sm">ID: {id}</p>
      </main>
    </div>
  );
}
