/**
 * AnimatedStepper — multi-step container with sliding steps, spring height and animated indicators.
 * Adapted from the team's AnimatedStepper (framer-motion) to this design system:
 *  - styling comes from styles.css tokens instead of Tailwind/shadcn classes;
 *  - indicator colours change through CSS (state classes), motion handles slide, height, connector fill
 *    and the active glow that glides between steps (layoutId);
 *  - steps can block « Continuer » until they are valid (`canContinue`) and hide the footer when they
 *    carry their own actions (`hideFooter`); only completed steps are clickable;
 *  - honours prefers-reduced-motion through MotionConfig.
 */
import { AnimatePresence, motion, MotionConfig, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import { Children, Fragment, isValidElement, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

export interface StepProps {
  title?: string;
  /** Short label under the indicator. Defaults to the title. */
  label?: string;
  /** « Continuer » stays disabled until this is true. */
  canContinue?: boolean;
  /** Hide the stepper footer on this step (the step has its own actions). */
  hideFooter?: boolean;
  /** Explains why « Continuer » is disabled. */
  hint?: ReactNode;
  children: ReactNode;
}

/** One step of the stepper. Rendered by AnimatedStepper; its props drive the footer. */
export function Step({ title, children }: StepProps) {
  return (
    <div className="astep-step">
      {title && <h2 className="astep-title">{title}</h2>}
      <div className="astep-body">{children}</div>
    </div>
  );
}

interface StepperProps {
  children: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  disableStepIndicators?: boolean;
  /** Maximum width of the card. */
  width?: number;
  className?: string;
}

export function AnimatedStepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  backButtonText = "Retour",
  nextButtonText = "Continuer",
  completeButtonText = "Terminer",
  disableStepIndicators = false,
  width = 640,
  className = "",
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const glowId = useId();
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<StepProps>[];
  const total = steps.length;
  const isCompleted = currentStep > total;
  const isLast = currentStep === total;
  const current = steps[currentStep - 1]?.props;

  const go = (next: number) => {
    setDirection(next > currentStep ? 1 : -1);
    setCurrentStep(next);
    if (next > total) onFinalStepCompleted();
    else onStepChange(next);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={`astep ${className}`} style={{ maxWidth: width }}>
        <ol className="astep-indicators" aria-label="Étapes">
          {steps.map((s, i) => {
            const n = i + 1;
            const status = currentStep === n ? "active" : currentStep < n ? "inactive" : "complete";
            const clickable = !disableStepIndicators && n < currentStep && !isCompleted;
            return (
              <Fragment key={n}>
                <li className={`astep-ind ${status}`}>
                  <button type="button" className="astep-dot" onClick={() => clickable && go(n)} disabled={!clickable} aria-current={status === "active" ? "step" : undefined} aria-label={`Étape ${n}${s.props.title ? ` : ${s.props.title}` : ""}`}>
                    {status === "complete" ? <Check aria-hidden /> : <span>{n}</span>}
                    {status === "active" && <motion.span layoutId={`glow-${glowId}`} className="astep-glow" transition={{ type: "spring", stiffness: 380, damping: 32 }} aria-hidden />}
                  </button>
                  <span className="astep-label">{s.props.label ?? s.props.title}</span>
                </li>
                {i < total - 1 && (
                  <li className="astep-connector" aria-hidden>
                    <motion.span initial={false} animate={{ scaleX: currentStep > n ? 1 : 0 }} transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }} />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>

        <StepContent isCompleted={isCompleted} step={currentStep} direction={direction}>
          {steps[currentStep - 1]}
        </StepContent>

        {!isCompleted && !current?.hideFooter && (
          <div className="astep-foot">
            {currentStep > 1 ? (
              <button type="button" className="btn btn-ghost" onClick={() => go(currentStep - 1)}>
                {backButtonText}
              </button>
            ) : (
              <span />
            )}
            <span className="astep-foot-end">
              {current?.canContinue === false && current.hint && <span className="hint">{current.hint}</span>}
              <button type="button" className="btn btn-primary btn-lg astep-next" onClick={() => go(currentStep + 1)} disabled={current?.canContinue === false}>
                {isLast ? completeButtonText : nextButtonText}
              </button>
            </span>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

const slide: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -24 : 24, opacity: 0 }),
};

/** Animates its height to the current step, which slides in from the direction of travel. */
function StepContent({ isCompleted, step, direction, children }: { isCompleted: boolean; step: number; direction: number; children: ReactNode }) {
  const [height, setHeight] = useState<number | "auto">("auto");
  return (
    <motion.div className="astep-content" animate={{ height: isCompleted ? 0 : height }} transition={{ type: "spring", damping: 26, stiffness: 210 }} style={{ position: "relative", overflow: "hidden" }}>
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        {!isCompleted && (
          <Slide key={step} direction={direction} onHeight={setHeight}>
            {children}
          </Slide>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Slide({ children, direction, onHeight }: { children: ReactNode; direction: number; onHeight: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the container height in step with content that grows inside a step (recordings, errors…).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);
  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}
