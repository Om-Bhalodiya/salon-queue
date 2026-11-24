import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import Header from '../components/Header';
import PinGate from '../components/PinGate';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import { clearRoleAuth, updatePins } from '../lib/auth';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { STATUS } from '../lib/queueRules';

const timestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return new Date(value).getTime() || 0;
};

const isToday = (value) => {
  const date = new Date(timestampMillis(value));
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

export default function Admin() {
  return <PinGate role="owner"><AdminSettings /></PinGate>;
}

function AdminSettings() {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = labels[lang];
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [closingTime, setClosingTime] = useState('21:00');
  const [pins, setPins] = useState({ reception: '', barber: '', owner: '' });
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const unsubs = [
      onSnapshot(collection(db, 'services'), (snap) => setServices(snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))), () => setDisconnected(true)),
      onSnapshot(collection(db, 'barbers'), (snap) => setBarbers(snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))), () => setDisconnected(true)),
      onSnapshot(collection(db, 'queue'), (snap) => setQueue(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setDisconnected(true)),
      onSnapshot(doc(db, 'config', 'settings'), (snap) => { if (snap.exists()) { const data = snap.data(); setQueueOpen(data.queueOpen !== false); setClosingTime(data.closingTime || '21:00'); } setDisconnected(false); }, () => setDisconnected(true)),
      onSnapshot(doc(db, 'config', 'pins'), (snap) => { if (snap.exists()) setPins((current) => ({ ...current, ...snap.data() })); }, () => setDisconnected(true)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const stats = useMemo(() => {
    const served = queue.filter((item) => item.status === STATUS.DONE && isToday(item.finishedAt || item.createdAt));
    const waits = served.map((item) => Math.max(0, timestampMillis(item.startedAt || item.calledAt) - timestampMillis(item.createdAt)) / 60000).filter((wait) => Number.isFinite(wait));
    const noShows = queue.filter((item) => item.status === STATUS.NO_SHOW && isToday(item.noShowAt || item.createdAt));
    return { served: served.length, averageWait: waits.length ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length) : 0, noShows: noShows.length };
  }, [queue]);

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'config', 'settings'), { queueOpen, closingTime }, { merge: true });
      showToast(t.admin.settingsSaved, 'success');
    } catch { showToast(t.errors.saveFailed, 'error'); }
  };
  const toggleService = async (service) => {
    try { await updateDoc(doc(db, 'services', service.id), { active: service.active === false }); }
    catch { showToast(t.errors.actionFailed, 'error'); }
  };
  const toggleBarber = async (barber) => {
    try { await updateDoc(doc(db, 'barbers', barber.id), { onDuty: !barber.onDuty }); }
    catch { showToast(t.errors.actionFailed, 'error'); }
  };
  const savePins = async (event) => {
    event.preventDefault();
    if (!Object.values(pins).every((pin) => /^\d{4}$/.test(String(pin)))) { showToast(t.admin.pinValidation, 'error'); return; }
    try { await updatePins(pins); showToast(t.admin.pinsSaved, 'success'); }
    catch { showToast(t.errors.saveFailed, 'error'); }
  };
  const lock = () => { clearRoleAuth('owner'); window.location.reload(); };

  return <div className="min-h-screen bg-charcoal text-white">
    <Header title={t.admin.title} rightAction={<button onClick={lock} aria-label={t.common.lock} className="rounded-full border border-gold/30 bg-white/5 p-1.5 text-gold">&#128274;</button>} />
    {disconnected && <div className="border-b border-gold/40 bg-gold/10 px-4 py-2 text-center text-xs text-gold">{t.errors.connectionLost}</div>}
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <section><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.statsHeading}</h2><div className="grid grid-cols-3 gap-3"><StatCard label={t.admin.statsServed} value={stats.served} /><StatCard label={t.admin.statsAverageWait} value={`${stats.averageWait} ${t.minutesShort}`} /><StatCard label={t.admin.statsNoShows} value={stats.noShows} /></div></section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="text-lg font-bold text-gold">{t.admin.queueControlHeading}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="flex items-center justify-between rounded-xl border border-white/10 p-3"><span><span className="block font-semibold">{t.admin.onlineJoining}</span><span className="text-xs text-white/60">{queueOpen ? t.admin.queueIsOpen : t.admin.queueIsClosed}</span></span><Toggle checked={queueOpen} onChange={() => setQueueOpen((current) => !current)} label={t.admin.queueStatusLabel} /></label><label className="rounded-xl border border-white/10 p-3"><span className="block text-sm font-semibold">{t.admin.closingTimeLabel}</span><input type="time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} className="mt-2 w-full rounded-lg border border-gold/30 bg-charcoal px-3 py-2 text-gold" /></label></div><button onClick={saveSettings} className="mt-4 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-charcoal">{t.admin.saveSettings}</button></section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.servicesHeading}</h2>{services.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-white/60"><tr><th className="pb-2">{t.admin.colServiceEn}</th><th className="pb-2">{t.admin.colServiceGu}</th><th className="pb-2">{t.admin.colDuration}</th><th className="pb-2">{t.admin.colPrice}</th><th className="pb-2">{t.admin.serviceToggle}</th></tr></thead><tbody>{services.map((service) => <tr key={service.id} className="border-t border-white/10"><td className="py-3 font-semibold">{service.nameEN}</td><td className="py-3">{service.nameGU}</td><td className="py-3">{service.duration} {t.minutesShort}</td><td className="py-3">{t.currencySymbol}{service.price}</td><td className="py-3"><Toggle checked={service.active !== false} onChange={() => toggleService(service)} label={service.active !== false ? t.admin.servicesEnabled : t.admin.servicesDisabled} /></td></tr>)}</tbody></table></div> : <p className="text-sm text-white/60">{t.admin.noServices}</p>}</section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.barbersHeading}</h2>{barbers.length ? <div className="space-y-2">{barbers.map((barber) => <div key={barber.id} className="flex items-center justify-between rounded-xl border border-white/10 p-3"><span className="font-semibold">{lang === 'gu' ? barber.nameGU : barber.nameEN}</span><Toggle checked={barber.onDuty === true} onChange={() => toggleBarber(barber)} label={barber.onDuty ? t.admin.barberDutyOn : t.admin.barberDutyOff} /></div>)}</div> : <p className="text-sm text-white/60">{t.admin.noBarbers}</p>}</section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.pinsHeading}</h2><form onSubmit={savePins} className="grid gap-3 md:grid-cols-4">{['reception', 'barber', 'owner'].map((role) => <label key={role} className="text-sm"><span className="mb-1 block text-white/70">{t.admin[`${role}PinLabel`]}</span><input type="password" inputMode="numeric" maxLength={4} value={pins[role] || ''} onChange={(event) => setPins((current) => ({ ...current, [role]: event.target.value.replace(/\D/g, '') }))} className="w-full rounded-xl border border-white/20 bg-charcoal px-3 py-2 text-white focus:border-gold focus:outline-none" /></label>)}<button type="submit" className="self-end rounded-xl bg-gold px-4 py-2 font-bold text-charcoal">{t.admin.savePinsBtn}</button></form></section>
    </main>
  </div>;
}

function Toggle({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`relative h-7 w-12 rounded-full border transition ${checked ? 'border-gold bg-gold' : 'border-white/30 bg-white/10'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-charcoal transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} /></button>;
}

function StatCard({ label, value }) {
  return <div className="rounded-2xl border border-gold/30 bg-white/5 p-3 text-center"><div className="text-xl font-black text-gold sm:text-3xl">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/60 sm:text-xs">{label}</div></div>;
}
