import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { STATUS, simulateQueueWaitTimes } from '../lib/queueRules';
import { labels } from '../i18n/labels';

const timestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return new Date(value).getTime() || 0;
};

export default function Display() {
  const t = labels.en;
  const [queue, setQueue] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState({ queueOpen: true });
  const [now, setNow] = useState(Date.now());
  const [disconnected, setDisconnected] = useState(false);
  const [flashingId, setFlashingId] = useState(null);
  const initialized = useRef(false);
  const previousQueue = useRef([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const unsubs = [
      onSnapshot(collection(db, 'queue'), (snap) => {
        const nextQueue = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (initialized.current) {
          const newlyCalled = nextQueue.find((item) => item.status === STATUS.CALLED && !previousQueue.current.some((old) => old.id === item.id && old.status === STATUS.CALLED));
          if (newlyCalled) {
            setFlashingId(newlyCalled.id);
            window.setTimeout(() => setFlashingId(null), 5000);
          }
        }
        initialized.current = true;
        previousQueue.current = nextQueue;
        setQueue(nextQueue);
        setDisconnected(false);
      }, () => setDisconnected(true)),
      onSnapshot(collection(db, 'barbers'), (snap) => setBarbers(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setDisconnected(true)),
      onSnapshot(collection(db, 'services'), (snap) => setServices(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setDisconnected(true)),
      onSnapshot(doc(db, 'config', 'settings'), (snap) => { if (snap.exists()) setSettings(snap.data()); }, () => setDisconnected(true)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const waitTimes = useMemo(() => simulateQueueWaitTimes(queue, barbers, now), [queue, barbers, now]);
  const waiting = useMemo(() => queue.filter((item) => item.status === STATUS.WAITING).sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)), [queue]);
  const serviceNames = (customer) => (customer?.services || []).map((id) => services.find((service) => service.id === id)?.nameEN || id).join(' + ');
  const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now);

  return <div className="min-h-screen overflow-hidden bg-charcoal px-5 py-5 text-white lg:px-10 lg:py-7">
    <header className="flex items-center justify-between border-b border-gold/30 pb-4">
      <div><h1 className="text-2xl font-black tracking-wide text-gold lg:text-4xl">{t.salonName}</h1><p className="mt-1 text-sm text-white/70 lg:text-lg">{t.display.title}</p></div>
      <div className="flex items-center gap-3"><span className="font-mono text-xl text-white lg:text-3xl">{clock}</span><span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-sm font-bold text-gold">{settings.queueOpen ? t.home.queueOpen : t.home.queueClosed}</span>{disconnected && <span className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold">{t.errors.connectionLost}</span>}</div>
    </header>
    <main className="mx-auto max-w-7xl py-6">
      <section><h2 className="mb-3 text-xl font-bold text-gold lg:text-3xl">{t.display.nowServingHeading}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{barbers.filter((barber) => barber.onDuty).map((barber) => {
        const customer = queue.find((item) => (item.assignedBarber || '').toLowerCase() === (barber.nameEN || '').toLowerCase() && [STATUS.CALLED, STATUS.IN_CHAIR].includes(item.status));
        const elapsed = customer?.status === STATUS.IN_CHAIR ? Math.max(0, Math.floor((now - timestampMillis(customer.startedAt)) / 60000)) : 0;
        return <article key={barber.id} className={`rounded-2xl border p-4 ${customer ? 'border-gold bg-gold/10' : 'border-white/15 bg-white/5'} ${customer?.id === flashingId ? 'animate-pulse border-gold bg-gold/30' : ''}`}><div className="text-sm font-bold text-gold lg:text-lg">{barber.nameEN}</div>{customer ? <><div className="mt-2 text-2xl font-black lg:text-3xl">{customer.name}</div><div className="mt-1 text-sm text-white/70 lg:text-base">{serviceNames(customer)}</div><div className="mt-3 font-mono text-gold">{customer.status === STATUS.CALLED ? t.status.called : `${elapsed}${t.minutesShort}`}</div></> : <div className="mt-6 text-xl text-white/60">{t.display.availableChair}</div>}</article>;
      })}</div></section>
      <section className="mt-7"><h2 className="mb-3 text-xl font-bold text-gold lg:text-3xl">{t.display.upNextHeading}</h2>{waiting.length ? <div className="grid gap-3 md:grid-cols-5">{waiting.slice(0, 5).map((customer, index) => { const estimate = waitTimes.get(customer.id); return <article key={customer.id} className="rounded-2xl border border-gold/30 bg-white/5 p-4"><div className="text-sm font-bold text-gold">{index + 1}</div><div className="mt-1 text-lg font-bold">{customer.name}</div><div className="mt-1 text-sm text-white/70">{serviceNames(customer)}</div><div className="mt-3 text-sm text-gold">{estimate?.estimatedWait == null ? '—' : `${t.approxPrefix} ${estimate.estimatedWait} ${t.minutesShort}`}</div></article>; })}</div> : <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-center text-white/60">{t.display.noOneWaitingTV}</div>}</section>
      <section className="mt-7"><h2 className="mb-3 text-xl font-bold text-gold lg:text-3xl">{t.display.queueListHeading}</h2><div className="grid gap-2 md:grid-cols-2">{waiting.slice(5).map((customer, index) => <div key={customer.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><span className="font-bold text-gold">{index + 6}</span><span className="font-bold">{customer.name}</span><span className="ml-auto text-sm text-white/60">{serviceNames(customer)}</span></div>)}</div></section>
    </main>
    <footer className="mt-4 overflow-hidden whitespace-nowrap border-t border-gold/20 py-3 text-center text-sm text-gold">{t.display.footerTicker}</footer>
  </div>;
}
