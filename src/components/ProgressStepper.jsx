import { useLanguage } from '../context/LanguageContext';
import { labels } from '../i18n/labels';
import { STATUS } from '../lib/queueRules';

/**
 * ProgressStepper Component
 * Displays the 4-step queue progress: Waiting -> Called -> In Chair -> Done.
 *
 * @param {Object} props
 * @param {string} props.currentStatus - 'waiting' | 'called' | 'in_chair' | 'done' | 'cancelled' | 'no_show'
 */
export default function ProgressStepper({ currentStatus }) {
  const { lang } = useLanguage();
  const t = labels[lang].status;

  const STEPS = [
    { key: STATUS.WAITING, label: t.waiting, stepNum: 1 },
    { key: STATUS.CALLED, label: t.called, stepNum: 2 },
    { key: STATUS.IN_CHAIR, label: t.in_chair, stepNum: 3 },
    { key: STATUS.DONE, label: t.done, stepNum: 4 },
  ];

  const statusOrder = {
    [STATUS.WAITING]: 1,
    [STATUS.CALLED]: 2,
    [STATUS.IN_CHAIR]: 3,
    [STATUS.DONE]: 4,
  };

  const isTerminalNegative =
    currentStatus === STATUS.CANCELLED || currentStatus === STATUS.NO_SHOW;

  const currentStepNum = statusOrder[currentStatus] || 1;

  if (isTerminalNegative) {
    return (
      <div className="w-full py-3 px-4 rounded-2xl bg-white/5 border border-red-500/20 text-center">
        <span className="text-sm font-semibold text-red-300">
          {currentStatus === STATUS.CANCELLED ? t.cancelled : t.no_show}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full py-4 px-2 sm:px-4">
      <div className="relative flex items-center justify-between">
        {/* Background track line */}
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-white/10 -z-0" />

        {/* Active progress fill line */}
        <div
          className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-gold transition-all duration-500 -z-0"
          style={{
            width: `${((currentStepNum - 1) / (STEPS.length - 1)) * 100}%`,
            maxWidth: 'calc(100% - 3rem)',
          }}
        />

        {STEPS.map((step) => {
          const isCompleted = currentStepNum > step.stepNum;
          const isCurrent = currentStepNum === step.stepNum;

          return (
            <div
              key={step.key}
              className="flex flex-col items-center relative z-10"
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 border-2 ${
                  isCurrent
                    ? 'bg-gold text-charcoal border-gold shadow-lg shadow-gold/30 scale-110'
                    : isCompleted
                    ? 'bg-gold/20 text-gold border-gold/60'
                    : 'bg-charcoal text-white/40 border-white/20'
                }`}
              >
                {isCompleted ? '✓' : step.stepNum}
              </div>
              <span
                className={`text-[11px] sm:text-xs mt-2 text-center transition-colors font-medium ${
                  isCurrent
                    ? 'text-gold font-bold'
                    : isCompleted
                    ? 'text-white/80'
                    : 'text-white/40'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
