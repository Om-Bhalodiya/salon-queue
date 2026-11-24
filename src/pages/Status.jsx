import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import ProgressStepper from '../components/ProgressStepper';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import {
  STATUS,
  getPositionInQueue,
  calculateEstimatedWait,
  isValidTransition,
} from '../lib/queueRules';

export default function Status() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];

  // Firestore live states
  const [entry, setEntry] = useState(null);
  const [allQueue, setAllQueue] = useState([]);
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Cancel dialog state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // 1. Live listener on the customer's specific ticket doc
  useEffect(() => {
    if (!id || !isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, 'queue', id);
    const unsubDoc = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setIsNotFound(true);
          setEntry(null);
        } else {
          setIsNotFound(false);
          setEntry({ id: docSnap.id, ...docSnap.data() });
        }
        setIsLoading(false);
        setIsDisconnected(false);
      },
      (err) => {
        console.error('Customer ticket listener error:', err);
        setIsDisconnected(true);
        setIsLoading(false);
      }
    );

    // 2. Live listener on all active queue entries (for position & wait calculation)
    const qQueue = query(
      collection(db, 'queue'),
      where('status', 'in', [STATUS.WAITING, STATUS.CALLED, STATUS.IN_CHAIR])
    );
    const unsubQueue = onSnapshot(
      qQueue,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllQueue(list);
      },
      (err) => {
        console.error('Queue list listener error:', err);
      }
    );

    // 3. Live listener on Services
    const unsubServices = onSnapshot(
      collection(db, 'services'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setServices(list);
      },
      (err) => console.error('Services listener error:', err)
    );

    // 4. Live listener on Barbers
    const unsubBarbers = onSnapshot(
      collection(db, 'barbers'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBarbers(list);
      },
      (err) => console.error('Barbers listener error:', err)
    );

    return () => {
      unsubDoc();
      unsubQueue();
      unsubServices();
      unsubBarbers();
    };
  }, [id]);

  // Derived calculations
  const position = useMemo(() => {
    if (!entry || entry.status !== STATUS.WAITING) return null;
    return getPositionInQueue(allQueue, entry);
  }, [allQueue, entry]);

  const estimatedWait = useMemo(() => {
    if (!entry || entry.status !== STATUS.WAITING) return null;
    return calculateEstimatedWait(allQueue, entry, barbers);
  }, [allQueue, entry, barbers]);

  // Service details mapping
  const selectedServiceDetails = useMemo(() => {
    if (!entry || !entry.services) return [];
    return entry.services.map((svcId) => {
      const match = services.find((s) => s.id === svcId);
      if (match) {
        return {
          id: svcId,
          name: lang === 'gu' ? match.nameGU : match.nameEN,
          duration: match.duration,
          price: match.price,
        };
      }
      return { id: svcId, name: svcId, duration: 0, price: 0 };
    });
  }, [entry, services, lang]);

  // Preferred or assigned barber lookup
  const preferredBarberDoc = useMemo(() => {
    if (!entry || !entry.barberPreference || entry.barberPreference === 'any') {
      return null;
    }
    return barbers.find(
      (b) =>
        (b.nameEN || '').toLowerCase() === entry.barberPreference.toLowerCase()
    );
  }, [entry, barbers]);

  const assignedBarberDoc = useMemo(() => {
    if (!entry || !entry.assignedBarber) return null;
    return barbers.find(
      (b) =>
        (b.nameEN || '').toLowerCase() === entry.assignedBarber.toLowerCase()
    );
  }, [entry, barbers]);

  // Cancel action handler
  const handleCancel = async () => {
    if (!entry) return;
    if (!isValidTransition(entry.status, STATUS.CANCELLED)) {
      showToast(t.errors.actionFailed, 'error');
      return;
    }

    setIsCancelling(true);
    try {
      await updateDoc(doc(db, 'queue', entry.id), {
        status: STATUS.CANCELLED,
      });
      setShowCancelModal(false);
      showToast(t.statusPage.cancelledAlert, 'info');
      navigate('/');
    } catch (err) {
      console.error('Failed to cancel ticket:', err);
      showToast(t.errors.actionFailed, 'error');
      setIsCancelling(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-charcoal text-white flex flex-col justify-between">
        <Header title={t.statusPage.title} />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-12 h-12 rounded-full border-2 border-gold border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-white/60 font-medium">{t.common.loading}</p>
        </main>
      </div>
    );
  }

  // Not found state
  if (isNotFound || !entry) {
    return (
      <div className="min-h-screen bg-charcoal text-white flex flex-col justify-between">
        <Header title={t.statusPage.title} />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl mb-4 text-white/40">
            🔍
          </div>
          <h2 className="text-xl font-bold text-gold mb-2">
            {t.errors.ticketNotFound}
          </h2>
          <p className="text-xs text-white/50 mb-6">
            Ticket ID: <span className="font-mono text-white/70">{id}</span>
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm bg-gold text-charcoal hover:brightness-110 shadow-md transition"
          >
            {t.statusPage.backHomeBtn}
          </button>
        </main>
      </div>
    );
  }

  // ----------------------------------------------------
  // FULL-SCREEN GOLD "IT'S YOUR TURN!" STATE
  // Shown when customer has been called by reception/barber
  // ----------------------------------------------------
  if (entry.status === STATUS.CALLED) {
    const barberDisplayName = assignedBarberDoc
      ? lang === 'gu'
        ? assignedBarberDoc.nameGU
        : assignedBarberDoc.nameEN
      : entry.assignedBarber || (lang === 'gu' ? 'નાઈ' : 'Barber');

    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-500 via-gold to-yellow-600 text-charcoal flex flex-col justify-between p-6 animate-in fade-in duration-300">
        <header className="flex justify-between items-center max-w-md mx-auto w-full">
          <span className="text-xs font-black tracking-widest uppercase opacity-75">
            {t.salonName}
          </span>
          <span className="text-xs font-mono font-bold bg-charcoal/10 px-2.5 py-1 rounded-full">
            #{entry.id.slice(-5).toUpperCase()}
          </span>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto w-full my-auto py-8">
          <div className="w-28 h-28 rounded-full bg-charcoal text-gold flex items-center justify-center text-5xl mb-6 shadow-2xl animate-bounce">
            💈
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3 text-charcoal leading-tight">
            {t.statusPage.yourTurnAlert}
          </h1>

          <p className="text-base sm:text-lg font-bold text-charcoal/80 mb-6 max-w-xs">
            {t.statusPage.yourTurnSub}
          </p>

          {/* Assigned Barber Highlight Card */}
          <div className="w-full bg-charcoal text-white rounded-3xl p-5 shadow-2xl border border-charcoal/20 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gold font-bold">
              {t.statusPage.assignedBarberHeading}
            </div>
            <div className="text-2xl font-black text-white">
              {barberDisplayName}
            </div>
            <div className="text-xs text-white/60 pt-1 border-t border-white/10 flex justify-between">
              <span>{t.join.totalDuration}:</span>
              <span className="font-semibold text-white">
                {entry.totalDuration} {t.minutesShort}
              </span>
            </div>
          </div>
        </main>

        <footer className="text-center text-xs font-bold text-charcoal/70 py-2">
          {t.tagline}
        </footer>
      </div>
    );
  }

  // Normal Status View (Waiting, In Chair, Done, Cancelled, No-show)
  return (
    <div className="min-h-screen bg-charcoal text-white pb-12">
      <Header title={t.statusPage.title} />

      {/* Disconnect Warning Banner */}
      {isDisconnected && (
        <div className="bg-amber-950/90 border-b border-amber-800 text-amber-200 text-xs py-2 px-4 text-center font-medium">
          {t.errors.connectionLost}
        </div>
      )}

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Token Header Pill */}
        <div className="flex items-center justify-between text-xs text-white/50 px-1">
          <span>
            {t.statusPage.ticketIdLabel}:{' '}
            <span className="font-mono text-white/80 font-semibold">
              #{entry.id.slice(-6).toUpperCase()}
            </span>
          </span>
          <span>{entry.name}</span>
        </div>

        {/* Status Badge + Progress Stepper */}
        <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center gap-3">
          <StatusBadge status={entry.status} size="lg" />
          <ProgressStepper currentStatus={entry.status} />
        </div>

        {/* ---------------------------------------------------- */}
        {/* "START COMING" BANNER (WHEN POSITION === 2)           */}
        {/* ---------------------------------------------------- */}
        {entry.status === STATUS.WAITING && position === 2 && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/20 via-gold/20 to-amber-500/20 border-2 border-gold text-center space-y-1 shadow-lg shadow-gold/10 animate-pulse">
            <div className="text-2xl">🚶‍♂️💨</div>
            <h3 className="text-sm font-black text-gold">
              {t.statusPage.startComingHeading}
            </h3>
            <p className="text-xs text-white/80">
              {t.statusPage.startComingDesc}
            </p>
          </div>
        )}

        {/* In Chair State Alert */}
        {entry.status === STATUS.IN_CHAIR && (
          <div className="p-5 rounded-3xl bg-sky-950/40 border border-sky-500/30 text-center space-y-2">
            <div className="text-3xl">✂️</div>
            <h3 className="text-base font-bold text-sky-300">
              {t.statusPage.inChairAlert}
            </h3>
            {assignedBarberDoc && (
              <p className="text-xs text-white/70">
                {t.statusPage.assignedBarberHeading}:{' '}
                <span className="font-bold text-white">
                  {lang === 'gu'
                    ? assignedBarberDoc.nameGU
                    : assignedBarberDoc.nameEN}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Done State Alert */}
        {entry.status === STATUS.DONE && (
          <div className="p-6 rounded-3xl bg-emerald-950/40 border border-emerald-500/30 text-center space-y-3">
            <div className="text-4xl">💈✨</div>
            <h3 className="text-lg font-bold text-emerald-300">
              {t.statusPage.doneAlert}
            </h3>
            <button
              onClick={() => navigate('/')}
              className="mt-2 py-3 px-6 rounded-2xl font-bold text-sm bg-gold text-charcoal hover:brightness-110 transition shadow-md"
            >
              {t.statusPage.backHomeBtn}
            </button>
          </div>
        )}

        {/* Cancelled / No-show State Alerts */}
        {entry.status === STATUS.CANCELLED && (
          <div className="p-5 rounded-3xl bg-red-950/40 border border-red-500/30 text-center space-y-3">
            <div className="text-3xl">❌</div>
            <h3 className="text-sm font-bold text-red-300">
              {t.statusPage.cancelledAlert}
            </h3>
            <button
              onClick={() => navigate('/')}
              className="py-2.5 px-5 rounded-xl font-semibold text-xs bg-white/10 hover:bg-white/20 text-white transition"
            >
              {t.statusPage.backHomeBtn}
            </button>
          </div>
        )}

        {entry.status === STATUS.NO_SHOW && (
          <div className="p-5 rounded-3xl bg-purple-950/40 border border-purple-500/30 text-center space-y-3">
            <div className="text-3xl">⚠️</div>
            <h3 className="text-sm font-bold text-purple-300">
              {t.statusPage.noShowAlert}
            </h3>
            <button
              onClick={() => navigate('/')}
              className="py-2.5 px-5 rounded-xl font-semibold text-xs bg-white/10 hover:bg-white/20 text-white transition"
            >
              {t.statusPage.backHomeBtn}
            </button>
          </div>
        )}

        {/* Position & Estimated Wait Cards (Only when WAITING) */}
        {entry.status === STATUS.WAITING && (
          <div className="grid grid-cols-2 gap-3">
            {/* Position Card */}
            <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
                {t.statusPage.positionHeading}
              </span>
              <span className="text-4xl font-extrabold text-gold tracking-tight">
                #{position ?? '—'}
              </span>
              <span className="text-[10px] text-white/40 mt-1">
                {t.statusPage.positionText.replace('{pos}', position ?? '—')}
              </span>
            </div>

            {/* Estimated Wait Card */}
            <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
                {t.statusPage.estimatedWaitHeading}
              </span>
              <span className="text-2xl font-extrabold text-emerald-400 tracking-tight">
                {estimatedWait !== null
                  ? `${t.approxPrefix} ${estimatedWait} ${t.minutesShort}`
                  : '—'}
              </span>
              <span className="text-[10px] text-white/40 mt-1">
                {estimatedWait !== null
                  ? t.statusPage.estimatedWaitText.replace(
                      '{wait}',
                      `${estimatedWait} ${t.minutesShort}`
                    )
                  : t.statusPage.waitUnavailable}
              </span>
            </div>
          </div>
        )}

        {/* Preferred Barber on Break Notice */}
        {entry.status === STATUS.WAITING &&
          preferredBarberDoc &&
          preferredBarberDoc.onBreak && (
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex items-start gap-2.5">
              <span className="text-lg shrink-0">⚠️</span>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {t.statusPage.barberBreakNotice.replace(
                  '{name}',
                  lang === 'gu'
                    ? preferredBarberDoc.nameGU
                    : preferredBarberDoc.nameEN
                )}
              </p>
            </div>
          )}

        {/* Barber Preference Card */}
        <div className="p-4 rounded-3xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-xs uppercase tracking-wider text-white/50 font-bold">
            {t.statusPage.assignedBarberHeading}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center text-lg text-gold font-bold">
                {preferredBarberDoc
                  ? preferredBarberDoc.nameEN.charAt(0)
                  : '✂️'}
              </div>
              <div>
                <div className="font-bold text-sm text-white">
                  {preferredBarberDoc
                    ? lang === 'gu'
                      ? preferredBarberDoc.nameGU
                      : preferredBarberDoc.nameEN
                    : t.anyBarber}
                </div>
                <div className="text-[11px] text-white/40">
                  {preferredBarberDoc
                    ? preferredBarberDoc.onBreak
                      ? t.join.onBreakBadge
                      : 'On Duty'
                    : t.join.anyBarberDesc}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Services List */}
        <div className="p-4 rounded-3xl bg-white/5 border border-white/10 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-wider text-white/50 font-bold">
              {t.statusPage.servicesHeading}
            </span>
            <span className="text-xs text-white/50">
              {entry.totalDuration} {t.minutesShort} · {t.currencySymbol}
              {entry.totalPrice}
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {selectedServiceDetails.map((s) => (
              <div
                key={s.id}
                className="py-2 flex justify-between items-center text-xs"
              >
                <span className="font-medium text-white/90">{s.name}</span>
                <span className="text-white/40">
                  {s.duration} {t.minutesShort} · {t.currencySymbol}
                  {s.price}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel Button (Visible ONLY when WAITING) */}
        {entry.status === STATUS.WAITING && (
          <div className="pt-2">
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider text-red-300 border border-red-500/40 hover:bg-red-950/40 active:bg-red-950/60 transition"
            >
              {t.statusPage.cancelSpotBtn}
            </button>
          </div>
        )}
      </main>

      {/* Confirmation Modal for Cancel */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-charcoal border border-red-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800 text-red-300 flex items-center justify-center text-2xl mx-auto">
              ⚠️
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-white">
                {t.statusPage.cancelConfirmTitle}
              </h3>
              <p className="text-xs text-white/60">
                {t.statusPage.cancelConfirmDesc}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-medium text-xs transition"
              >
                {t.common.no}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs transition disabled:opacity-40"
              >
                {isCancelling ? t.common.loading : t.common.yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
