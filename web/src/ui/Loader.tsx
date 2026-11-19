import { BrandMark } from "./brand";

/**
 * Loading states for lazily loaded screens. Both stay invisible for the first 150ms, so a fast
 * load shows nothing at all instead of a flash.
 */
export function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-label="Chargement de la page">
      <span className="route-progress" aria-hidden />
      <div className="sk sk-title skeleton" />
      <div className="sk sk-lead skeleton" />
      <div className="sk-rule" />
      <div className="sk-grid">
        <div className="sk sk-block skeleton" />
        <div className="sk sk-block skeleton" />
        <div className="sk sk-block skeleton" />
      </div>
      <div className="sk sk-wide skeleton" />
    </div>
  );
}

export function FullLoader({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="full-loader" role="status" aria-label={label}>
      <span className="route-progress" aria-hidden />
      <span className="full-loader-mark">
        <BrandMark size={36} />
      </span>
      <span className="full-loader-label">{label}…</span>
    </div>
  );
}
