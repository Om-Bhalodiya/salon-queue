import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';
import { STATUS } from '../lib/queueRules';

/**
 * StatusBadge Component
 * Displays queue status with consistent colours and labels.
 *
 * @param {Object} props
 * @param {string} props.status - 'waiting' | 'called' | 'in_chair' | 'done' | 'cancelled' | 'no_show'
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 */
export default function StatusBadge({ status, size = 'md' }) {
  const { lang } = useLanguage();
  const t = labels[lang].status;

  const statusConfigs = {
    [STATUS.WAITING]: {
      text: t.waiting,
      colorClasses: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      dotColor: 'bg-amber-400',
    },
    [STATUS.CALLED]: {
      text: t.called,
      colorClasses: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 animate-pulse',
      dotColor: 'bg-emerald-400',
    },
    [STATUS.IN_CHAIR]: {
      text: t.in_chair,
      colorClasses: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
      dotColor: 'bg-sky-400',
    },
    [STATUS.DONE]: {
      text: t.done,
      colorClasses: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
      dotColor: 'bg-gray-400',
    },
    [STATUS.CANCELLED]: {
      text: t.cancelled,
      colorClasses: 'bg-red-500/15 text-red-300 border-red-500/30',
      dotColor: 'bg-red-400',
    },
    [STATUS.NO_SHOW]: {
      text: t.no_show,
      colorClasses: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      dotColor: 'bg-purple-400',
    },
  };

  const config = statusConfigs[status] || {
    text: status,
    colorClasses: 'bg-white/10 text-white/80 border-white/20',
    dotColor: 'bg-white/50',
  };

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-0.5 gap-1.5',
    md: 'text-sm px-3.5 py-1 gap-2',
    lg: 'text-base px-4 py-1.5 gap-2.5 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap shadow-sm ${
        config.colorClasses
      } ${sizeClasses[size] || sizeClasses.md}`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
      {config.text}
    </span>
  );
}
