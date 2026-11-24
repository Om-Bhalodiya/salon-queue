import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import Header from '../components/Header';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import {
  hasActiveSpot,
  calculateEstimatedWait,
  isOnlineJoiningAllowed,
  autoAssign,
  STATUS,
} from '../lib/queueRules';

export default function Join() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];

  // Firestore collections data
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [closingTime, setClosingTime] = useState('00:00');
  const [activeQueue, setActiveQueue] = useState([]);

  // Form input state
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState('any'); // 'any' or barber nameEN
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Subscribe to Services, Barbers, Settings, and Queue
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoadingData(false);
      return;
    }

    // 1. Services
    const unsubServices = onSnapshot(
      collection(db, 'services'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })).filter((service) => service.active !== false);
        list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setServices(list);
        setSelectedServiceIds((selected) => selected.filter((id) => list.some((service) => service.id === id)));
        setIsLoadingData(false);
      },
      (err) => {
        console.error('Services listener error:', err);
        setIsLoadingData(false);
      }
    );

    // 2. Barbers
    const unsubBarbers = onSnapshot(
      collection(db, 'barbers'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setBarbers(list);
      },
      (err) => {
        console.error('Barbers listener error:', err);
      }
    );

    // 3. Settings
    const unsubSettings = onSnapshot(
      doc(db, 'config', 'settings'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.queueOpen === 'boolean') setQueueOpen(data.queueOpen);
          if (data.closingTime) setClosingTime(data.closingTime);
        }
      },
      (err) => {
        console.error('Settings listener error:', err);
      }
    );

    // 4. Live Queue for duplicate spot check & wait time
    const qQueue = query(
      collection(db, 'queue'),
      where('status', 'in', [STATUS.WAITING, STATUS.CALLED, STATUS.IN_CHAIR])
    );

    const unsubQueue = onSnapshot(
      qQueue,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setActiveQueue(list);
      },
      (err) => {
        console.error('Queue snapshot error:', err);
      }
    );

    return () => {
      unsubServices();
      unsubBarbers();
      unsubSettings();
      unsubQueue();
    };
  }, []);

  // Check queue open/cutoff rules
  const { allowed: joiningAllowed } = isOnlineJoiningAllowed(
    queueOpen,
    closingTime
  );

  // If queue is closed or cutoff passed when user is on /join, redirect back to /
  useEffect(() => {
    if (!isLoadingData && !joiningAllowed) {
      showToast(
        queueOpen ? t.errors.cutoffPassed : t.errors.queueClosed,
        'warning'
      );
      navigate('/', { replace: true });
    }
  }, [joiningAllowed, isLoadingData, navigate, queueOpen, showToast, t.errors.cutoffPassed, t.errors.queueClosed]);

  // Selected services calculation (Max 3 allowed)
  const selectedServices = useMemo(() => {
    return services.filter((s) => selectedServiceIds.includes(s.id));
  }, [services, selectedServiceIds]);

  const totalDuration = useMemo(() => {
    return selectedServices.reduce((acc, s) => acc + (Number(s.duration) || 0), 0);
  }, [selectedServices]);

  const totalPrice = useMemo(() => {
    return selectedServices.reduce((acc, s) => acc + (Number(s.price) || 0), 0);
  }, [selectedServices]);

  // Live estimated wait time & expected barber calculation preview
  const simulationPreview = useMemo(() => {
    // Construct a simulated waiting entry at the end of the current queue
    const simulatedEntry = {
      id: 'simulated_new_entry',
      status: STATUS.WAITING,
      createdAt: Date.now() + 99999999, // Future timestamp -> at end of queue
      totalDuration: totalDuration || 15,
      barberPreference: selectedBarber,
    };
    return calculateEstimatedWait(activeQueue, simulatedEntry, barbers);
  }, [activeQueue, totalDuration, selectedBarber, barbers]);

  const liveEstimatedWait = simulationPreview.estimatedWait;
  const expectedBarberName = simulationPreview.expectedBarber;

  // Service toggle with at most 3 services restriction
  const handleServiceToggle = (serviceId) => {
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId);
      }
      if (prev.length >= 3) {
        showToast(
          lang === 'gu'
            ? 'મહત્તમ 3 સેવાઓ પસંદ કરી શકાય છે.'
            : 'You can select up to 3 services.',
          'warning'
        );
        return prev;
      }
      return [...prev, serviceId];
    });
  };

  // Submit Join Queue
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validations
    if (selectedServiceIds.length === 0) {
      showToast(t.errors.serviceRequired, 'error');
      return;
    }
    if (!name.trim()) {
      showToast(t.errors.nameRequired, 'error');
      return;
    }
    const cleanPhone = phone.trim();
    if (!/^\d{10}$/.test(cleanPhone)) {
      showToast(t.errors.invalidPhone, 'error');
      return;
    }

    // Re-check cutoff
    const check = isOnlineJoiningAllowed(queueOpen, closingTime);
    if (!check.allowed) {
      showToast(
        check.reason === 'closed' ? t.errors.queueClosed : t.errors.cutoffPassed,
        'error'
      );
      navigate('/');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Duplicate phone check against Firestore
      const qDup = query(
        collection(db, 'queue'),
        where('phone', '==', cleanPhone),
        where('status', 'in', [STATUS.WAITING, STATUS.CALLED, STATUS.IN_CHAIR])
      );
      const dupSnap = await getDocs(qDup);

      if (!dupSnap.empty) {
        showToast(t.errors.duplicatePhone, 'error');
        setIsSubmitting(false);
        return;
      }

      // 2. Create queue doc
      const newEntry = {
        name: name.trim(),
        phone: cleanPhone,
        services: selectedServiceIds,
        totalDuration,
        totalPrice,
        barberPreference: selectedBarber,
        assignedBarber: null,
        status: STATUS.WAITING,
        createdAt: serverTimestamp(),
        calledAt: null,
        startedAt: null,
        finishedAt: null,
        source: 'online',
      };

      const docRef = await addDoc(collection(db, 'queue'), newEntry);

      // Trigger Auto-Call rule: if an eligible barber is free, auto-call immediately
      try {
        await autoAssign(db);
      } catch (assignErr) {
        console.warn('Auto-assign after join note:', assignErr);
      }

      navigate(`/status/${docRef.id}`);
    } catch (err) {
      console.error('Failed to join queue:', err);
      showToast(t.errors.actionFailed, 'error');
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    selectedServiceIds.length > 0 &&
    name.trim().length > 0 &&
    /^\d{10}$/.test(phone.trim());

  const onDutyBarbers = barbers.filter((b) => b.onDuty === true);
  const selectedBarberDoc = barbers.find(
    (b) => (b.nameEN || '').toLowerCase() === selectedBarber.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-charcoal text-white pb-12">
      <Header title={t.join.title} showBack onBack={() => navigate('/')} />

      <main className="max-w-xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Services Picker (Max 3) */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-gold tracking-wide">
                {t.join.selectServices}
              </h2>
              <span className="text-xs text-white/50">
                {selectedServiceIds.length}/3{' '}
                {lang === 'gu' ? 'પસંદ કરેલ' : 'selected'}
              </span>
            </div>

            {services.length === 0 && !isLoadingData ? (
              <p className="text-sm text-white/50 p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                {t.join.noServicesAvailable}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {services.map((service) => {
                  const isSelected = selectedServiceIds.includes(service.id);
                  const serviceName =
                    lang === 'gu' ? service.nameGU : service.nameEN;

                  return (
                    <button
                      type="button"
                      key={service.id}
                      onClick={() => handleServiceToggle(service.id)}
                      className={`text-left p-3.5 rounded-2xl border transition-all duration-150 flex justify-between items-center ${
                        isSelected
                          ? 'bg-gold/15 border-gold shadow-md shadow-gold/10'
                          : 'bg-white/5 border-white/10 hover:border-white/20 active:bg-white/10'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-white">
                          {serviceName}
                        </div>
                        <div className="text-xs text-white/50 mt-0.5">
                          {service.duration} {t.minutesShort} · {t.currencySymbol}
                          {service.price}
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-gold text-charcoal'
                            : 'border border-white/20 text-transparent'
                        }`}
                      >
                        ✓
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Barber Picker */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gold tracking-wide">
              {t.join.selectBarber}
            </h2>

            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {/* Option: Any Barber */}
              <button
                type="button"
                onClick={() => setSelectedBarber('any')}
                className={`flex-1 min-w-[100px] p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${
                  selectedBarber === 'any'
                    ? 'bg-gold/15 border-gold text-gold shadow-md shadow-gold/10'
                    : 'bg-white/5 border-white/10 hover:border-white/20 text-white/80'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl mb-1.5 border border-white/10">
                  ✂️
                </div>
                <span className="text-xs font-bold leading-tight">
                  {t.anyBarber}
                </span>
                <span className="text-[10px] text-white/50 mt-0.5">
                  {lang === 'gu' ? 'ઝડપી' : 'Fastest'}
                </span>
              </button>

              {/* On-Duty Barbers */}
              {onDutyBarbers.map((barber) => {
                const isSelected = selectedBarber === barber.nameEN;
                const barberDisplayName =
                  lang === 'gu' ? barber.nameGU : barber.nameEN;

                return (
                  <button
                    type="button"
                    key={barber.id}
                    onClick={() => setSelectedBarber(barber.nameEN)}
                    className={`flex-1 min-w-[100px] p-3 rounded-2xl border flex flex-col items-center text-center transition-all relative ${
                      isSelected
                        ? 'bg-gold/15 border-gold text-gold shadow-md shadow-gold/10'
                        : 'bg-white/5 border-white/10 hover:border-white/20 text-white/80'
                    }`}
                  >
                    {barber.onBreak && (
                      <span className="absolute -top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/90 text-charcoal">
                        {t.join.onBreakBadge}
                      </span>
                    )}
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold mb-1.5 border border-white/10">
                      {barber.nameEN.charAt(0)}
                    </div>
                    <span className="text-xs font-bold truncate max-w-full">
                      {barberDisplayName}
                    </span>
                    <span className="text-[10px] text-white/50 mt-0.5">
                      {barber.onBreak ? t.join.onBreakNotice : 'Available'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Warning note if selected barber is on break */}
            {selectedBarberDoc && selectedBarberDoc.onBreak && (
              <p className="text-xs text-amber-300/80 bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/50">
                ⚠️{' '}
                {lang === 'gu'
                  ? `${selectedBarberDoc.nameGU} હાલ બ્રેક પર છે. તમારો વારો આવતાં વધુ સમય લાગી શકે છે.`
                  : `${selectedBarberDoc.nameEN} is currently on a short break. You may wait longer.`}
              </p>
            )}
          </div>

          {/* Section 3: Customer Details */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gold tracking-wide">
              {t.join.customerInfo}
            </h2>

            <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  {t.join.nameLabel} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.join.namePlaceholder}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-charcoal border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  {t.join.phoneLabel} (10 digits) *
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  pattern="[0-9]*"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.join.phonePlaceholder}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-charcoal border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Live Summary Card */}
          <div className="p-4 rounded-2xl bg-gold/10 border border-gold/30 space-y-2.5">
            <h3 className="text-xs font-bold tracking-wider uppercase text-gold">
              {t.join.summaryTitle}
            </h3>

            <div className="flex justify-between text-xs text-white/80">
              <span>{t.join.selectedServices}:</span>
              <span className="font-medium text-white text-right max-w-[200px] truncate">
                {selectedServices.length > 0
                  ? selectedServices
                      .map((s) => (lang === 'gu' ? s.nameGU : s.nameEN))
                      .join(', ')
                  : '—'}
              </span>
            </div>

            <div className="flex justify-between text-xs text-white/80">
              <span>{t.join.totalDuration}:</span>
              <span className="font-semibold text-white">
                {totalDuration} {t.minutesShort}
              </span>
            </div>

            <div className="flex justify-between text-xs text-white/80">
              <span>{t.join.totalPrice}:</span>
              <span className="font-bold text-gold">
                {t.currencySymbol}
                {totalPrice}
              </span>
            </div>

            {/* When Any Barber is selected, show expected barber */}
            {selectedBarber === 'any' && (
              <div className="flex justify-between text-xs text-white/80">
                <span>{t.join.expectedBarber}:</span>
                <span className="font-semibold text-gold">
                  {expectedBarberName
                    ? (() => {
                        const bDoc = barbers.find(
                          (b) =>
                            b.nameEN.toLowerCase() ===
                            expectedBarberName.toLowerCase()
                        );
                        return bDoc
                          ? lang === 'gu'
                            ? bDoc.nameGU
                            : bDoc.nameEN
                          : expectedBarberName;
                      })()
                    : '—'}
                </span>
              </div>
            )}

            <div className="flex justify-between text-xs text-white/80 pt-1 border-t border-gold/20">
              <span>{t.join.estimatedWait}:</span>
              <span className="font-bold text-emerald-400">
                {liveEstimatedWait !== null
                  ? `${t.approxPrefix} ${liveEstimatedWait} ${t.minutesShort}`
                  : t.statusPage.waitUnavailable}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full py-4 px-6 rounded-2xl font-bold text-base text-charcoal bg-gold shadow-lg shadow-gold/20 hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
          >
            {isSubmitting ? t.common.submitting : t.join.joinBtn}
          </button>
        </form>
      </main>
    </div>
  );
}
