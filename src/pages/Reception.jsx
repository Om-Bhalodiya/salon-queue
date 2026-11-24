import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import Header from '../components/Header';
import PinGate from '../components/PinGate';
import StatusBadge from '../components/StatusBadge';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import { clearRoleAuth } from '../lib/auth';
import {
  STATUS,
  simulateQueueWaitTimes,
  callNextForBarber,
  callNextAvailable,
  autoAssign,
  hasActiveSpot,
} from '../lib/queueRules';

export default function Reception() {
  return (
    <PinGate role="reception">
      <ReceptionDashboard />
    </PinGate>
  );
}

function ReceptionDashboard() {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];

  // Live Firestore collections
  const [queue, setQueue] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState({ queueOpen: true, closingTime: '21:00' });
  const [filter, setFilter] = useState('all'); // all, waiting, called, in_chair, done, no_show

  // Walk-in modal state
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInBarber, setWalkInBarber] = useState('any');
  const [walkInServiceIds, setWalkInServiceIds] = useState([]);
  const [isSubmittingWalkIn, setIsSubmittingWalkIn] = useState(false);

  // Loading & error
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Subscribe to Queue, Barbers, Services, and Settings
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    // 1. Queue collection
    const unsubQueue = onSnapshot(
      collection(db, 'queue'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setQueue(list);
        setIsLoading(false);
        setIsDisconnected(false);
      },
      (err) => {
        console.error('Queue snapshot error:', err);
        setIsDisconnected(true);
      }
    );

    // 2. Barbers collection
    const unsubBarbers = onSnapshot(
      collection(db, 'barbers'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setBarbers(list);
      },
      (err) => console.error('Barbers snapshot error:', err)
    );

    // 3. Services collection
    const unsubServices = onSnapshot(
      collection(db, 'services'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setServices(list);
      },
      (err) => console.error('Services snapshot error:', err)
    );

    // 4. Settings doc
    const unsubSettings = onSnapshot(
      doc(db, 'config', 'settings'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data());
        }
      },
      (err) => console.error('Settings snapshot error:', err)
    );

    return () => {
      unsubQueue();
      unsubBarbers();
      unsubServices();
      unsubSettings();
    };
  }, []);

  // Compute live simulated wait times & expected barbers for every waiting customer
  const simulationResults = useMemo(() => {
    return simulateQueueWaitTimes(queue, barbers);
  }, [queue, barbers]);

  // Statistics calculation
  const stats = useMemo(() => {
    const waiting = queue.filter((e) => e.status === STATUS.WAITING).length;
    const inChair = queue.filter((e) => e.status === STATUS.IN_CHAIR).length;
    const doneToday = queue.filter((e) => e.status === STATUS.DONE).length;
    return { waiting, inChair, doneToday };
  }, [queue]);

  // Filtered queue list (sorted oldest first)
  const filteredQueue = useMemo(() => {
    const sorted = [...queue].sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      return aTime - bTime;
    });

    if (filter === 'all') return sorted;
    return sorted.filter((e) => e.status === filter);
  }, [queue, filter]);

  // Lock session handler
  const handleLock = () => {
    clearRoleAuth('reception');
    window.location.reload();
  };

  // Helper to trigger auto-assign and catch background errors
  const triggerAutoAssignSafe = async () => {
    try {
      await autoAssign(db);
    } catch (err) {
      console.warn('AutoAssign invocation notice:', err);
    }
  };

  // Call Next (Floating Action Button)
  const handleCallNext = async () => {
    const match = callNextAvailable(queue, barbers);
    if (!match) {
      showToast(t.errors.noBarberAvailable, 'warning');
      return;
    }

    try {
      await updateDoc(doc(db, 'queue', match.entry.id), {
        status: STATUS.CALLED,
        assignedBarber: match.barberName,
        calledAt: serverTimestamp(),
      });

      const msg = t.reception.calledNotification
        .replace('{customer}', match.entry.name)
        .replace('{barber}', match.barberName);
      showToast(msg, 'success');

      // Check if another customer can be auto-called
      await triggerAutoAssignSafe();
    } catch (err) {
      console.error('Call next error:', err);
      showToast(t.errors.actionFailed, 'error');
    }
  };

  // Call Next for a specific barber
  const handleCallForSpecificBarber = async (barberName) => {
    const candidate = callNextForBarber(queue, barberName);
    if (!candidate) {
      showToast(
        lang === 'gu'
          ? `${barberName} માટે કોઈ પ્રતીક્ષામાં નથી.`
          : `No one waiting for ${barberName}.`,
        'warning'
      );
      return;
    }

    try {
      await updateDoc(doc(db, 'queue', candidate.id), {
        status: STATUS.CALLED,
        assignedBarber: barberName,
        calledAt: serverTimestamp(),
      });

      const msg = t.reception.calledNotification
        .replace('{customer}', candidate.name)
        .replace('{barber}', barberName);
      showToast(msg, 'success');

      await triggerAutoAssignSafe();
    } catch (err) {
      console.error('Call specific barber error:', err);
      showToast(t.errors.actionFailed, 'error');
    }
  };

  // Per-ticket actions
  const handleNoShow = async (ticketId) => {
    try {
      await updateDoc(doc(db, 'queue', ticketId), {
        status: STATUS.NO_SHOW,
      });
      showToast(t.statusPage.noShowAlert, 'info');
      // Freeing this spot triggers autoAssign
      await triggerAutoAssignSafe();
    } catch (err) {
      showToast(t.errors.actionFailed, 'error');
    }
  };

  const handleCancelTicket = async (ticketId) => {
    try {
      await updateDoc(doc(db, 'queue', ticketId), {
        status: STATUS.CANCELLED,
      });
      showToast(t.statusPage.cancelledAlert, 'info');
      await triggerAutoAssignSafe();
    } catch (err) {
      showToast(t.errors.actionFailed, 'error');
    }
  };

  const handleReAdd = async (originalEntry) => {
    try {
      const newEntry = {
        name: originalEntry.name,
        phone: originalEntry.phone,
        services: originalEntry.services || [],
        totalDuration: originalEntry.totalDuration || 15,
        totalPrice: originalEntry.totalPrice || 0,
        barberPreference: originalEntry.barberPreference || 'any',
        assignedBarber: null,
        status: STATUS.WAITING,
        createdAt: serverTimestamp(),
        calledAt: null,
        startedAt: null,
        finishedAt: null,
        source: 'walk_in',
      };

      await addDoc(collection(db, 'queue'), newEntry);
      const msg = t.reception.reAddedNotification.replace('{customer}', originalEntry.name);
      showToast(msg, 'success');

      await triggerAutoAssignSafe();
    } catch (err) {
      showToast(t.errors.actionFailed, 'error');
    }
  };

  // Walk-in modal submission
  const handleWalkInSubmit = async (e) => {
    e.preventDefault();
    if (!walkInName.trim()) {
      showToast(t.errors.nameRequired, 'error');
      return;
    }
    const cleanPhone = walkInPhone.trim();
    if (!/^\d{10}$/.test(cleanPhone)) {
      showToast(t.errors.invalidPhone, 'error');
      return;
    }
    if (walkInServiceIds.length === 0) {
      showToast(t.errors.serviceRequired, 'error');
      return;
    }

    if (hasActiveSpot(queue, cleanPhone)) {
      showToast(t.errors.duplicatePhone, 'error');
      return;
    }

    setIsSubmittingWalkIn(true);
    try {
      const selectedSvcs = services.filter((s) => walkInServiceIds.includes(s.id));
      const dur = selectedSvcs.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
      const prc = selectedSvcs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

      const newWalkIn = {
        name: walkInName.trim(),
        phone: cleanPhone,
        services: walkInServiceIds,
        totalDuration: dur,
        totalPrice: prc,
        barberPreference: walkInBarber,
        assignedBarber: null,
        status: STATUS.WAITING,
        createdAt: serverTimestamp(),
        calledAt: null,
        startedAt: null,
        finishedAt: null,
        source: 'walk_in',
      };

      await addDoc(collection(db, 'queue'), newWalkIn);
      showToast(
        lang === 'gu' ? 'વોક-ઇન ગ્રાહક સફળતાપૂર્વક ઉમેરાયા!' : 'Walk-in customer added successfully!',
        'success'
      );

      // Reset form & close modal
      setWalkInName('');
      setWalkInPhone('');
      setWalkInBarber('any');
      setWalkInServiceIds([]);
      setShowWalkInModal(false);

      // Trigger auto-call in case an eligible barber is free
      await triggerAutoAssignSafe();
    } catch (err) {
      console.error('Add walk-in error:', err);
      showToast(t.errors.actionFailed, 'error');
    } finally {
      setIsSubmittingWalkIn(false);
    }
  };

  const toggleWalkInService = (id) => {
    setWalkInServiceIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 3) {
        showToast(
          lang === 'gu' ? 'મહત્તમ 3 સેવાઓ પસંદ કરી શકાય છે.' : 'You can select up to 3 services.',
          'warning'
        );
        return prev;
      }
      return [...prev, id];
    });
  };

  // Find who is currently serving for each barber card
  const barberServingMap = useMemo(() => {
    const map = {};
    for (const b of barbers) {
      const nameLower = (b.nameEN || '').toLowerCase();
      const current = queue.find(
        (e) =>
          (e.assignedBarber || '').toLowerCase() === nameLower &&
          (e.status === STATUS.CALLED || e.status === STATUS.IN_CHAIR)
      );
      map[nameLower] = current || null;
    }
    return map;
  }, [barbers, queue]);

  return (
    <div className="min-h-screen bg-charcoal text-white flex flex-col">
      {/* Header Bar */}
      <Header
        title={t.reception.title}
        isQueueOpen={settings.queueOpen}
        rightAction={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWalkInModal(true)}
              className="px-3 py-1 text-xs font-bold bg-gold text-charcoal rounded-full hover:brightness-110 active:scale-95 transition shadow-sm"
            >
              {t.reception.addWalkInBtn}
            </button>
            <button
              onClick={handleLock}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition"
              title={t.common.lock}
            >
              🔒
            </button>
          </div>
        }
      />

      {/* Disconnection Warning */}
      {isDisconnected && (
        <div className="bg-red-950/90 border-b border-red-800 text-red-200 text-xs py-2 px-4 text-center font-medium">
          {t.errors.connectionLost}
        </div>
      )}

      {/* Main Container - Optimized for Landscape Tablet */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Queue List (8 cols on lg) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          {/* Filter Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-white/10 text-xs font-semibold">
            {[
              { key: 'all', label: t.reception.filterAll },
              { key: STATUS.WAITING, label: t.reception.filterWaiting, count: stats.waiting },
              { key: STATUS.CALLED, label: t.reception.filterCalled },
              { key: STATUS.IN_CHAIR, label: t.reception.filterInChair },
              { key: STATUS.DONE, label: t.reception.filterDone },
              { key: STATUS.NO_SHOW, label: t.reception.filterNoShow },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-2 rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                  filter === tab.key
                    ? 'bg-white/10 text-gold border-b-2 border-gold font-bold'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full font-mono">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Queue List Cards */}
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
            {filteredQueue.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white/5 border border-white/10 text-white/40 flex flex-col items-center justify-center space-y-3">
                <span className="text-4xl">💈</span>
                <p className="text-sm">{t.reception.emptyQueue}</p>
              </div>
            ) : (
              filteredQueue.map((item) => {
                const sim = simulationResults.get(item.id) || {};
                const isOver60 = item.status === STATUS.WAITING && (sim.estimatedWait ?? 0) > 60;
                const barberDoc = barbers.find(
                  (b) => (b.nameEN || '').toLowerCase() === (item.assignedBarber || item.barberPreference || '').toLowerCase()
                );

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isOver60
                        ? 'bg-amber-950/30 border-amber-500/80 shadow-md shadow-amber-500/10'
                        : item.status === STATUS.CALLED
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Left: Info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white truncate">
                          {item.name}
                        </span>
                        <span className="text-xs font-mono text-white/50">
                          {item.phone}
                        </span>
                        <StatusBadge status={item.status} size="sm" />
                        {item.source === 'walk_in' && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                            Walk-in
                          </span>
                        )}
                      </div>

                      {/* Service Tags */}
                      <div className="flex gap-1.5 flex-wrap">
                        {item.services?.map((sId) => {
                          const sDoc = services.find((s) => s.id === sId);
                          return (
                            <span
                              key={sId}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-white/80 border border-white/5"
                            >
                              {sDoc ? (lang === 'gu' ? sDoc.nameGU : sDoc.nameEN) : sId}
                            </span>
                          );
                        })}
                        <span className="text-[11px] text-white/40 self-center">
                          {item.totalDuration} {t.minutesShort} · {t.currencySymbol}{item.totalPrice}
                        </span>
                      </div>

                      {/* Preference & Wait Time Details */}
                      <div className="flex items-center gap-3 text-xs text-white/60 pt-0.5">
                        <span>
                          {t.statusPage.assignedBarberHeading}:{' '}
                          <strong className="text-white">
                            {item.assignedBarber || (item.barberPreference === 'any' ? t.anyBarber : item.barberPreference)}
                          </strong>
                        </span>

                        {item.status === STATUS.WAITING && (
                          <>
                            <span>•</span>
                            <span>
                              {t.join.expectedBarber}:{' '}
                              <strong className="text-gold">
                                {sim.expectedBarber || '—'}
                              </strong>
                            </span>
                            <span>•</span>
                            <span
                              className={`font-semibold ${
                                isOver60 ? 'text-amber-300 font-bold animate-pulse' : 'text-emerald-400'
                              }`}
                            >
                              {sim.estimatedWait !== null
                                ? `${t.approxPrefix} ${sim.estimatedWait} ${t.minutesShort}`
                                : '—'}
                              {isOver60 && ' ⚠️ (> 60 min)'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                      {item.status === STATUS.WAITING && (
                        <>
                          <button
                            onClick={() => handleCallSpecificBarber(sim.expectedBarber || item.barberPreference)}
                            className="px-3 py-1.5 rounded-xl bg-gold text-charcoal font-bold text-xs hover:brightness-110 active:scale-95 transition shadow-sm"
                          >
                            {t.reception.actionCall}
                          </button>
                          <button
                            onClick={() => handleCancelTicket(item.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-950 text-red-300 border border-red-800 text-xs transition"
                          >
                            {t.reception.actionCancel}
                          </button>
                        </>
                      )}

                      {item.status === STATUS.CALLED && (
                        <>
                          <button
                            onClick={() => handleNoShow(item.id)}
                            className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800 text-xs font-semibold transition"
                          >
                            {t.reception.actionNoShow}
                          </button>
                          <button
                            onClick={() => handleCancelTicket(item.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-950 text-red-300 border border-red-800 text-xs transition"
                          >
                            {t.reception.actionCancel}
                          </button>
                        </>
                      )}

                      {item.status === STATUS.NO_SHOW && (
                        <button
                          onClick={() => handleReAdd(item)}
                          className="px-3 py-1.5 rounded-xl bg-gold/20 text-gold border border-gold/40 hover:bg-gold hover:text-charcoal text-xs font-bold transition"
                        >
                          {t.reception.actionReAdd}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Stats & Barber Status Cards (4 cols on lg) */}
        <div className="lg:col-span-4 flex flex-col space-y-5">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div>
              <div className="text-xl font-black text-amber-400">{stats.waiting}</div>
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                {t.reception.statsWaiting}
              </div>
            </div>
            <div className="border-x border-white/10">
              <div className="text-xl font-black text-sky-400">{stats.inChair}</div>
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                {t.reception.statsInChair}
              </div>
            </div>
            <div>
              <div className="text-xl font-black text-emerald-400">{stats.doneToday}</div>
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                {t.reception.statsDoneToday}
              </div>
            </div>
          </div>

          {/* Barber Cards */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase font-bold text-gold tracking-wider">
              {lang === 'gu' ? 'નાઈ સ્ટેશન સ્થિતિ' : 'Barbers On Duty'}
            </h3>

            <div className="space-y-2.5">
              {barbers.map((b) => {
                const bKey = (b.nameEN || '').toLowerCase();
                const servingEntry = barberServingMap[bKey];
                const displayName = lang === 'gu' ? b.nameGU : b.nameEN;

                return (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center font-bold text-gold text-sm">
                        {b.nameEN.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white flex items-center gap-2">
                          {displayName}
                          {b.onBreak && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/80 text-charcoal font-bold">
                              {t.join.onBreakBadge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/60">
                          {servingEntry ? (
                            <span className="text-sky-300 font-medium">
                              {servingEntry.status === STATUS.CALLED ? 'Called: ' : 'Serving: '}
                              <strong>{servingEntry.name}</strong>
                            </span>
                          ) : b.onBreak ? (
                            <span className="text-amber-400/80">Break</span>
                          ) : (
                            <span className="text-emerald-400 font-medium">Available</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!servingEntry && !b.onBreak && b.onDuty && (
                      <button
                        onClick={() => handleCallForSpecificBarber(b.nameEN)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-gold/20 hover:bg-gold hover:text-charcoal text-gold font-bold transition border border-gold/30"
                      >
                        Call
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Action Button: Call Next */}
      <button
        onClick={handleCallNext}
        className="fixed bottom-6 right-6 z-40 py-3.5 px-6 rounded-full bg-gold text-charcoal font-black text-sm sm:text-base shadow-2xl shadow-gold/40 hover:brightness-110 active:scale-95 transition-all duration-150 flex items-center gap-2 border-2 border-charcoal"
      >
        <span>⚡</span>
        <span>{t.reception.callNextFab}</span>
      </button>

      {/* Walk-in Modal */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-charcoal border border-gold/30 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-gold">
                {t.reception.walkInModalTitle}
              </h3>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-white/50 hover:text-white p-1 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-4">
              {/* Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    {t.join.nameLabel} *
                  </label>
                  <input
                    type="text"
                    required
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder={t.join.namePlaceholder}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 text-xs focus:outline-none focus:border-gold"
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
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder={t.join.phonePlaceholder}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 text-xs focus:outline-none focus:border-gold"
                  />
                </div>
              </div>

              {/* Services Picker */}
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  {t.join.selectServices} (Max 3)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {services.map((svc) => {
                    const isSelected = walkInServiceIds.includes(svc.id);
                    return (
                      <button
                        type="button"
                        key={svc.id}
                        onClick={() => toggleWalkInService(svc.id)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition ${
                          isSelected
                            ? 'bg-gold/20 border-gold text-white'
                            : 'bg-white/5 border-white/10 text-white/70 hover:border-white/20'
                        }`}
                      >
                        <div className="font-semibold truncate">
                          {lang === 'gu' ? svc.nameGU : svc.nameEN}
                        </div>
                        <div className="text-[10px] text-white/40">
                          {svc.duration}m · ₹{svc.price}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Barber Picker */}
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  {t.join.selectBarber}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setWalkInBarber('any')}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      walkInBarber === 'any'
                        ? 'bg-gold/20 border-gold text-gold'
                        : 'bg-white/5 border-white/10 text-white/60'
                    }`}
                  >
                    {t.anyBarber}
                  </button>
                  {barbers.filter((b) => b.onDuty).map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => setWalkInBarber(b.nameEN)}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                        walkInBarber === b.nameEN
                          ? 'bg-gold/20 border-gold text-gold'
                          : 'bg-white/5 border-white/10 text-white/60'
                      }`}
                    >
                      {lang === 'gu' ? b.nameGU : b.nameEN}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-medium text-xs transition"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWalkIn}
                  className="flex-1 py-2.5 rounded-xl bg-gold text-charcoal font-bold text-xs hover:brightness-110 active:brightness-95 disabled:opacity-40 transition"
                >
                  {isSubmittingWalkIn ? t.common.loading : t.common.add}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
