import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import Header from '../components/Header';
import PinGate from '../components/PinGate';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import { clearRoleAuth } from '../lib/auth';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { autoAssign, callNextForBarber, STATUS } from '../lib/queueRules';

const timestampMillis = (value) => {
  if (!value) return Date.now();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return new Date(value).getTime() || Date.now();
};

export default function Barber() {
  return <PinGate role="barber"><BarberStation /></PinGate>;
}

function BarberStation() {
  const { name = '' } = useParams();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];
  const [queue, setQueue] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [disconnected, setDisconnected] = useState(false);
  const routeName = decodeURIComponent(name);
  const barberKey = routeName.trim().toLowerCase();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const unsubs = [
      onSnapshot(collection(db, 'queue'), (snap) => { setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setDisconnected(false); }, () => setDisconnected(true)),
      onSnapshot(collection(db, 'barbers'), (snap) => setBarbers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDisconnected(true)),
      onSnapshot(collection(db, 'services'), (snap) => setServices(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDisconnected(true)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const barber = useMemo(() => barbers.find((item) => (item.nameEN || '').trim().toLowerCase() === barberKey), [barbers, barberKey]);
  const current = useMemo(() => queue.find((item) => (item.assignedBarber || '').trim().toLowerCase() === barberKey && [STATUS.CALLED, STATUS.IN_CHAIR].includes(item.status)), [queue, barberKey]);
  const next = useMemo(() => callNextForBarber(queue, barber?.nameEN || routeName), [queue, barber?.nameEN, routeName]);
  const displayName = barber?.[lang === 'gu' ? 'nameGU' : 'nameEN'] || routeName;
  const customerServices = (customer) => (customer?.services || []).map((id) => {
    const service = services.find((item) => item.id === id);
    return service ? (lang === 'gu' ? service.nameGU : service.nameEN) : id;
  });
  const statusText = barber?.onBreak ? t.barberPage.statusOnBreak : current ? t.barberPage.statusBusy : t.barberPage.statusAvailable;
  const elapsed = current ? Math.max(0, Math.floor((now - timestampMillis(current.status === STATUS.IN_CHAIR ? current.startedAt : current.calledAt)) / 60000)) : 0;

  const start = async () => {
    if (!current || current.status !== STATUS.CALLED) return;
    try { await updateDoc(doc(db, 'queue', current.id), { status: STATUS.IN_CHAIR, startedAt: serverTimestamp() }); }
    catch { showToast(t.errors.actionFailed, 'error'); }
  };
  const finish = async () => {
    if (!current || current.status !== STATUS.IN_CHAIR) return;
    try {
      await updateDoc(doc(db, 'queue', current.id), { status: STATUS.DONE, finishedAt: serverTimestamp() });
      await autoAssign(db);
    } catch { showToast(t.errors.actionFailed, 'error'); }
  };
  const toggleBreak = async () => {
    if (!barber || current) return;
    try {
      const becomingAvailable = barber.onBreak;
      await updateDoc(doc(db, 'barbers', barber.id), { onBreak: !barber.onBreak });
      if (becomingAvailable) await autoAssign(db);
    } catch { showToast(t.errors.actionFailed, 'error'); }
  };
  const lock = () => { clearRoleAuth('barber'); window.location.reload(); };

  return <div className="min-h-screen bg-charcoal text-white">
    <Header title={t.barberPage.barberLabel.replace('{name}', displayName)} rightAction={<><span className="hidden rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold sm:inline-flex">{statusText}</span><button onClick={lock} aria-label={t.common.lock} className="rounded-full border border-gold/30 bg-white/5 p-1.5 text-gold">&#128274;</button></>} />
    {disconnected && <div className="border-b border-gold/40 bg-gold/10 px-4 py-2 text-center text-xs text-gold">{t.errors.connectionLost}</div>}
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <div className="flex items-center justify-between sm:hidden"><h2 className="text-sm font-bold text-gold">{t.barberPage.barberLabel.replace('{name}', displayName)}</h2><span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-1 text-xs font-bold text-gold">{statusText}</span></div>
      <section className="rounded-3xl border border-gold/30 bg-white/5 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gold">{t.barberPage.currentCustomerHeading}</h2>
        {current ? <><div className="text-3xl font-black">{current.name}</div><div className="mt-3 flex flex-wrap gap-2">{customerServices(current).map((service, index) => <span key={`${service}-${index}`} className="rounded-lg border border-gold/30 bg-gold/10 px-2 py-1 text-xs">{service}</span>)}</div><div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm"><div className="rounded-xl bg-white/5 p-3 text-white/70">{t.barberPage.estimatedDuration.replace('{min}', current.totalDuration || 0)}</div><div className="rounded-xl bg-white/5 p-3 font-mono text-lg text-gold">{elapsed} {t.minutesShort}</div></div>{current.status === STATUS.CALLED ? <button onClick={start} className="mt-5 w-full rounded-2xl bg-gold py-4 font-bold text-charcoal">{t.barberPage.actionStart}</button> : <button onClick={finish} className="mt-5 w-full rounded-2xl bg-gold py-4 font-bold text-charcoal">{t.barberPage.actionFinish}</button>}</> : <p className="py-8 text-center text-white/60">{t.barberPage.noCustomerNow}</p>}
      </section>
      <button onClick={toggleBreak} disabled={!barber || Boolean(current)} className="w-full rounded-2xl border border-gold/50 bg-white/5 py-3 font-bold text-gold disabled:cursor-not-allowed disabled:opacity-40">{barber?.onBreak ? t.barberPage.actionBackFromBreak : t.barberPage.actionGoBreak}</button>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4"><h2 className="text-sm font-bold text-gold">{t.barberPage.upNextHeading}</h2>{next ? <p className="mt-2 text-sm">{t.barberPage.upNextCustomer.replace('{name}', next.name).replace('{services}', customerServices(next).join(' + '))}</p> : <p className="mt-2 text-sm text-white/60">{t.barberPage.noOneUpNext}</p>}</section>
    </main>
  </div>;
}
