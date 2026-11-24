import { useState, useEffect } from 'react';
import { isRoleAuthenticated, verifyPin, clearRoleAuth } from '../lib/auth';
import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';
import { useToast } from '../context/ToastContext';

/**
 * Reusable PIN Gate Component
 * Protects staff routes (/reception, /barber/:name, /admin).
 *
 * @param {Object} props
 * @param {'reception' | 'barber' | 'owner'} props.role
 * @param {React.ReactNode} props.children
 * @param {string} [props.title] - Optional override title
 */
export default function PinGate({ role, children, title }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { lang, toggleLang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];

  useEffect(() => {
    setIsAuthenticated(isRoleAuthenticated(role));
  }, [role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setIsLoading(true);
    try {
      const isValid = await verifyPin(role, pin);
      if (isValid) {
        setIsAuthenticated(true);
        setPin('');
      } else {
        showToast(t.errors.wrongPin, 'error');
        setPin('');
      }
    } catch (err) {
      showToast(t.errors.actionFailed, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDigitClick = (digit) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const roleTitleMap = {
    reception: t.reception.pinPrompt,
    barber: t.barberPage.pinPrompt,
    owner: t.admin.pinPrompt,
  };

  const promptTitle = title || roleTitleMap[role] || 'Enter PIN';

  return (
    <div className="min-h-screen bg-charcoal text-white flex flex-col justify-between p-4">
      <header className="flex justify-between items-center py-2 max-w-sm mx-auto w-full">
        <span className="text-gold font-bold">{t.salonName}</span>
        <button
          onClick={toggleLang}
          className="px-3 py-1 text-xs rounded-full border border-gold/40 text-gold hover:bg-gold/10"
        >
          {t.langToggle}
        </button>
      </header>

      <main className="flex flex-col items-center justify-center max-w-xs mx-auto w-full my-auto">
        <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-2xl mb-4 text-gold">
          🔒
        </div>
        <h2 className="text-xl font-bold text-gold text-center mb-1">{promptTitle}</h2>
        <p className="text-xs text-white/50 mb-6 text-center">
          Default test PIN: {role === 'reception' ? '1111' : role === 'barber' ? '2222' : '3333'}
        </p>

        {/* PIN masked display dots */}
        <div className="flex gap-3 mb-6 justify-center">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                pin.length > idx
                  ? 'bg-gold border-gold scale-110'
                  : 'bg-white/5 border-white/20'
              }`}
            />
          ))}
        </div>

        {/* Number Pad for Mobile/Tablet */}
        <div className="grid grid-cols-3 gap-3 w-full mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigitClick(String(num))}
              className="h-14 rounded-2xl bg-white/5 hover:bg-gold/20 active:bg-gold/30 text-xl font-semibold border border-white/10 transition-colors"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-lg flex items-center justify-center border border-white/10 text-white/70"
            aria-label="Delete"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={() => handleDigitClick('0')}
            className="h-14 rounded-2xl bg-white/5 hover:bg-gold/20 active:bg-gold/30 text-xl font-semibold border border-white/10"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin('')}
            className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-medium border border-white/10 text-white/60"
          >
            Clear
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || isLoading}
          className="w-full py-3.5 px-4 rounded-xl font-bold bg-gold text-charcoal hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md"
        >
          {isLoading ? t.common.loading : t.common.confirm}
        </button>
      </main>

      <footer className="text-center text-xs text-white/30 py-2">
        {t.salonName} Staff Portal
      </footer>
    </div>
  );
}
