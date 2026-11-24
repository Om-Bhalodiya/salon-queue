import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import Header from '../components/Header';
import PinGate from '../components/PinGate';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { labels } from '../i18n/labels';
import { clearRoleAuth, updatePins } from '../lib/auth';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { STATUS } from '../lib/queueRules';

const timestampMillis = (value) => typeof value?.toMillis === 'function' ? value.toMillis() : typeof value?.seconds === 'number' ? value.seconds * 1000 : new Date(value || 0).getTime() || 0;
const isToday = (value) => { const date = new Date(timestampMillis(value)); const now = new Date(); return date.toDateString() === now.toDateString(); };
const blankService = { nameEN: '', nameGU: '', duration: '', price: '' };

export default function Admin() { return <PinGate role="owner"><AdminSettings /></PinGate>; }

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
  const [serviceForm, setServiceForm] = useState(null);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const error = () => setDisconnected(true);
    const unsubs = [
      onSnapshot(collection(db, 'services'), (snap) => setServices(snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))), error),
      onSnapshot(collection(db, 'barbers'), (snap) => setBarbers(snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))), error),
      onSnapshot(collection(db, 'queue'), (snap) => setQueue(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), error),
      onSnapshot(doc(db, 'config', 'settings'), (snap) => { if (snap.exists()) { const data = snap.data(); setQueueOpen(data.queueOpen !== false); setClosingTime(data.closingTime || '21:00'); } setDisconnected(false); }, error),
      onSnapshot(doc(db, 'config', 'pins'), (snap) => { if (snap.exists()) setPins((current) => ({ ...current, ...snap.data() })); }, error),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const stats = useMemo(() => {
    const served = queue.filter((item) => item.status === STATUS.DONE && isToday(item.finishedAt || item.createdAt));
    const waits = served.map((item) => Math.max(0, timestampMillis(item.startedAt || item.calledAt) - timestampMillis(item.createdAt)) / 60000).filter(Number.isFinite);
    return { served: served.length, averageWait: waits.length ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length) : 0, noShows: queue.filter((item) => item.status === STATUS.NO_SHOW && isToday(item.noShowAt || item.createdAt)).length };
  }, [queue]);

  const saveSettings = async () => { try { await setDoc(doc(db, 'config', 'settings'), { queueOpen, closingTime }, { merge: true }); showToast(t.admin.settingsSaved, 'success'); } catch { showToast(t.errors.saveFailed, 'error'); } };
  const toggleService = async (service) => { try { await updateDoc(doc(db, 'services', service.id), { active: service.active === false }); } catch { showToast(t.errors.actionFailed, 'error'); } };
  const toggleBarber = async (barber) => { try { await updateDoc(doc(db, 'barbers', barber.id), { onDuty: !barber.onDuty }); } catch { showToast(t.errors.actionFailed, 'error'); } };
  const savePins = async (event) => { event.preventDefault(); if (!Object.values(pins).every((pin) => /^\d{4}$/.test(String(pin)))) { showToast(t.admin.pinValidation, 'error'); return; } try { await updatePins(pins); showToast(t.admin.pinsSaved, 'success'); } catch { showToast(t.errors.saveFailed, 'error'); } };
  const saveService = async (event) => {
    event.preventDefault();
    const payload = { nameEN: serviceForm.nameEN.trim(), nameGU: serviceForm.nameGU.trim(), duration: Number(serviceForm.duration), price: Number(serviceForm.price) };
    if (!payload.nameEN || !payload.nameGU || !payload.duration || payload.price < 0) { showToast(t.errors.actionFailed, 'error'); return; }
    try {
      if (serviceForm.id) await updateDoc(doc(db, 'services', serviceForm.id), payload);
      else await addDoc(collection(db, 'services'), { ...payload, active: true, order: Math.max(0, ...services.map((service) => Number(service.order) || 0)) + 1 });
      setServiceForm(null);
    } catch { showToast(t.errors.saveFailed, 'error'); }
  };
  const removeService = async (service) => { try { await deleteDoc(doc(db, 'services', service.id)); } catch { showToast(t.errors.actionFailed, 'error'); } };
  const lock = () => { clearRoleAuth('owner'); window.location.reload(); };

  return <div className="min-h-screen bg-charcoal text-white">
    <Header title={t.admin.title} rightAction={<button onClick={lock} aria-label={t.common.lock} className="rounded-full border border-gold/30 bg-white/5 p-1.5 text-gold">&#128274;</button>} />
    {disconnected && <div className="border-b border-gold/40 bg-gold/10 px-4 py-2 text-center text-xs text-gold">{t.errors.connectionLost}</div>}
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <section><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.statsHeading}</h2><div className="grid grid-cols-3 gap-3"><StatCard label={t.admin.statsServed} value={stats.served} /><StatCard label={t.admin.statsAverageWait} value={`${stats.averageWait} ${t.minutesShort}`} /><StatCard label={t.admin.statsNoShows} value={stats.noShows} /></div></section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="text-lg font-bold text-gold">{t.admin.queueControlHeading}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="flex items-center justify-between rounded-xl border border-white/10 p-3"><span><span className="block font-semibold">{t.admin.onlineJoining}</span><span className="text-xs text-white/60">{queueOpen ? t.admin.queueIsOpen : t.admin.queueIsClosed}</span></span><Toggle checked={queueOpen} onChange={() => setQueueOpen((current) => !current)} label={t.admin.queueStatusLabel} /></label><label className="rounded-xl border border-white/10 p-3"><span className="block text-sm font-semibold">{t.admin.closingTimeLabel}</span><input type="time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} className="mt-2 w-full rounded-lg border border-gold/30 bg-charcoal px-3 py-2 text-gold" /></label></div><button onClick={saveSettings} className="mt-4 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-charcoal">{t.admin.saveSettings}</button></section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-gold">{t.admin.servicesHeading}</h2><button onClick={() => setServiceForm(blankService)} className="rounded-xl bg-gold px-3 py-2 text-sm font-bold text-charcoal">{t.admin.addServiceBtn}</button></div>{serviceForm && <ServiceForm form={serviceForm} setForm={setServiceForm} onSave={saveService} onCancel={() => setServiceForm(null)} t={t} />}{services.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-white/60"><tr><th className="pb-2">{t.admin.colServiceEn}</th><th className="pb-2">{t.admin.colServiceGu}</th><th className="pb-2">{t.admin.colDuration}</th><th className="pb-2">{t.admin.colPrice}</th><th className="pb-2">{t.admin.serviceToggle}</th><th className="pb-2">{t.admin.colActions}</th></tr></thead><tbody>{services.map((service) => <tr key={service.id} className="border-t border-white/10"><td className="py-3 font-semibold">{service.nameEN}</td><td className="py-3">{service.nameGU}</td><td className="py-3">{service.duration} {t.minutesShort}</td><td className="py-3">{t.currencySymbol}{service.price}</td><td className="py-3"><Toggle checked={service.active !== false} onChange={() => toggleService(service)} label={service.active !== false ? t.admin.servicesEnabled : t.admin.servicesDisabled} /></td><td className="py-3"><div className="flex gap-2"><button onClick={() => setServiceForm({ ...service })} className="text-xs font-bold text-gold">{t.common.edit}</button><button onClick={() => removeService(service)} className="text-xs font-bold text-white/70">{t.common.delete}</button></div></td></tr>)}</tbody></table></div> : <p className="text-sm text-white/60">{t.admin.noServices}</p>}</section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.barbersHeading}</h2>{barbers.length ? <div className="space-y-2">{barbers.map((barber) => <div key={barber.id} className="flex items-center justify-between rounded-xl border border-white/10 p-3"><span className="font-semibold">{lang === 'gu' ? barber.nameGU : barber.nameEN}</span><Toggle checked={barber.onDuty === true} onChange={() => toggleBarber(barber)} label={barber.onDuty ? t.admin.barberDutyOn : t.admin.barberDutyOff} /></div>)}</div> : <p className="text-sm text-white/60">{t.admin.noBarbers}</p>}</section>
      <section className="rounded-2xl border border-gold/30 bg-white/5 p-4"><h2 className="mb-3 text-lg font-bold text-gold">{t.admin.pinsHeading}</h2><form onSubmit={savePins} className="grid gap-3 md:grid-cols-4">{['reception', 'barber', 'owner'].map((role) => <label key={role} className="text-sm"><span className="mb-1 block text-white/70">{t.admin[`${role}PinLabel`]}</span><input type="password" inputMode="numeric" maxLength={4} value={pins[role] || ''} onChange={(event) => setPins((current) => ({ ...current, [role]: event.target.value.replace(/\D/g, '') }))} className="w-full rounded-xl border border-white/20 bg-charcoal px-3 py-2 text-white focus:border-gold focus:outline-none" /></label>)}<button type="submit" className="self-end rounded-xl bg-gold px-4 py-2 font-bold text-charcoal">{t.admin.savePinsBtn}</button></form></section>
    </main>
  </div>;
}

function ServiceForm({ form, setForm, onSave, onCancel, t }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form onSubmit={onSave} className="mb-4 grid gap-2 rounded-xl border border-gold/30 bg-charcoal/50 p-3 md:grid-cols-4"><label className="text-xs text-white/70">{t.admin.serviceNameEn}<input required value={form.nameEN} onChange={(event) => update('nameEN', event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-charcoal px-2 py-2 text-white" /></label><label className="text-xs text-white/70">{t.admin.serviceNameGu}<input required value={form.nameGU} onChange={(event) => update('nameGU', event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-charcoal px-2 py-2 text-white" /></label><label className="text-xs text-white/70">{t.admin.colDuration}<input required min="1" type="number" value={form.duration} onChange={(event) => update('duration', event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-charcoal px-2 py-2 text-white" /></label><label className="text-xs text-white/70">{t.admin.colPrice}<input required min="0" type="number" value={form.price} onChange={(event) => update('price', event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-charcoal px-2 py-2 text-white" /></label><div className="flex gap-2 md:col-span-4"><button className="rounded-lg bg-gold px-3 py-2 text-sm font-bold text-charcoal">{form.id ? t.admin.serviceFormEdit : t.admin.serviceFormAdd}</button><button type="button" onClick={onCancel} className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white">{t.common.cancel}</button></div></form>;
}

function Toggle({ checked, onChange, label }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`relative h-7 w-12 rounded-full border transition ${checked ? 'border-gold bg-gold' : 'border-white/30 bg-white/10'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-charcoal transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} /></button>; }
function StatCard({ label, value }) { return <div className="rounded-2xl border border-gold/30 bg-white/5 p-3 text-center"><div className="text-xl font-black text-gold sm:text-3xl">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/60 sm:text-xs">{label}</div></div>; }
