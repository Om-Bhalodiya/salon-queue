import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import Header from '../components/Header';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import { isOnlineJoiningAllowed, STATUS } from '../lib/queueRules';

export default function Home() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];

  // State
  const [queueOpen, setQueueOpen] = useState(true);
  const [closingTime, setClosingTime] = useState('21:00');
  const [waitingCount, setWaitingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Track status modal state
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackPhone, setTrackPhone] = useState('');
  const [isSearchingPhone, setIsSearchingPhone] = useState(false);

  // Subscribe to config/settings
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    const unsubSettings = onSnapshot(
      doc(db, 'config', 'settings'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.queueOpen === 'boolean') setQueueOpen(data.queueOpen);
          if (data.closingTime) setClosingTime(data.closingTime);
        }
        setIsLoading(false);
        setIsError(false);
      },
      (err) => {
        console.error('Settings listener error:', err);
        setIsError(true);
        setIsLoading(false);
      }
    );

    // Subscribe to waiting count
    const q = query(
      collection(db, 'queue'),
      where('status', '==', STATUS.WAITING)
    );

    const unsubQueue = onSnapshot(
      q,
      (snapshot) => {
        setWaitingCount(snapshot.size);
      },
      (err) => {
        console.error('Queue count listener error:', err);
      }
    );

    return () => {
      unsubSettings();
      unsubQueue();
    };
  }, []);

  const { allowed: joiningAllowed, reason: joinBlockReason } =
    isOnlineJoiningAllowed(queueOpen, closingTime);

  const handleJoinClick = () => {
    if (!joiningAllowed) {
      if (joinBlockReason === 'closed') {
        showToast(t.errors.queueClosed, 'warning');
      } else {
        showToast(t.errors.cutoffPassed, 'warning');
      }
      return;
    }
    navigate('/join');
  };

  const handleTrackSubmit = async (e) => {
    e.preventDefault();
    const cleanPhone = trackPhone.trim();

    if (!/^\d{10}$/.test(cleanPhone)) {
      showToast(t.errors.invalidPhone, 'error');
      return;
    }

    setIsSearchingPhone(true);
    try {
      // Find latest entry for this phone that is in active or recent status
      const q = query(
        collection(db, 'queue'),
        where('phone', '==', cleanPhone),
        orderBy('createdAt', 'desc')
      );

      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        showToast(t.home.noActiveSpot, 'warning');
      } else {
        // Look for an active spot first
        const activeDoc = querySnap.docs.find((d) => {
          const st = d.data().status;
          return (
            st === STATUS.WAITING ||
            st === STATUS.CALLED ||
            st === STATUS.IN_CHAIR
          );
        });

        const targetDoc = activeDoc || querySnap.docs[0];
        setShowTrackModal(false);
        navigate(`/status/${targetDoc.id}`);
      }
    } catch (err) {
      console.error('Track status search error:', err);
      showToast(t.errors.actionFailed, 'error');
    } finally {
      setIsSearchingPhone(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal text-white flex flex-col justify-between">
      <Header isQueueOpen={queueOpen} />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">
        {/* Error banner if connection fails */}
        {isError && (
          <div className="w-full mb-6 p-4 rounded-2xl bg-red-950/80 border border-red-800 text-center flex flex-col items-center gap-2">
            <span className="text-xl">⚠️</span>
            <p className="text-sm text-red-200">{t.errors.networkError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-1 px-4 py-1.5 rounded-xl bg-red-900/60 hover:bg-red-800 text-xs font-semibold text-white border border-red-700"
            >
              {t.common.retry}
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gold/10 border border-gold/30 flex items-center justify-center text-4xl text-gold shadow-lg shadow-gold/10">
            💈
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gold tracking-tight mb-2">
            {t.salonName}
          </h2>
          <p className="text-white/70 text-base sm:text-lg max-w-sm mx-auto">
            {t.tagline}
          </p>
        </div>

        {/* Live Queue Badge Pill */}
        <div className="mb-8">
          {queueOpen ? (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-semibold shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {t.home.queueOpen} ·{' '}
                {t.home.waitingCount.replace('{count}', waitingCount)}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-300 text-sm font-semibold shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span>{t.home.queueClosed}</span>
            </div>
          )}
        </div>

        {/* Action Buttons Card */}
        <div className="w-full space-y-3.5">
          <button
            onClick={handleJoinClick}
            disabled={isLoading || !joiningAllowed}
            className={`w-full py-4 px-6 rounded-2xl font-bold text-lg text-charcoal shadow-lg transition-all duration-200 ${
              joiningAllowed
                ? 'bg-gold hover:brightness-110 active:scale-[0.99] shadow-gold/20'
                : 'bg-gold/40 cursor-not-allowed opacity-80'
            }`}
          >
            {t.home.joinQueueBtn}
          </button>

          <button
            onClick={() => setShowTrackModal(true)}
            className="w-full py-3.5 px-6 rounded-2xl font-semibold text-base text-gold bg-white/5 hover:bg-gold/10 active:bg-gold/20 border border-gold/40 transition-all duration-200"
          >
            {t.home.trackStatusBtn}
          </button>
        </div>

        {/* Online Cutoff / Closed Hint Note */}
        {!joiningAllowed && (
          <p className="text-xs text-amber-300/80 text-center mt-3 px-2">
            {joinBlockReason === 'closed'
              ? t.errors.queueClosed
              : t.errors.cutoffPassed}
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-white/40 border-t border-white/5">
        {t.home.hoursFooter.replace('{closingTime}', closingTime)}
      </footer>

      {/* Track Status Modal / Bottom Sheet */}
      {showTrackModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full sm:max-w-md bg-charcoal border border-gold/30 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gold">
                {t.home.trackModalTitle}
              </h3>
              <button
                onClick={() => setShowTrackModal(false)}
                className="text-white/50 hover:text-white p-1 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTrackSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-1.5 font-medium">
                  {t.join.phoneLabel}
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  pattern="[0-9]*"
                  value={trackPhone}
                  onChange={(e) =>
                    setTrackPhone(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder={t.home.phonePlaceholder}
                  className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold text-base"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTrackModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-medium text-sm transition"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={trackPhone.length !== 10 || isSearchingPhone}
                  className="flex-1 py-3 rounded-xl bg-gold text-charcoal font-bold text-sm hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {isSearchingPhone ? t.common.loading : t.home.lookupBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
