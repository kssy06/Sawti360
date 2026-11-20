import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/700.css";
import "./landing.css";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Seal } from "../ui/brand";

/**
 * Public home page. Same sections and order as the team's design (concept, pillars, Passeport 360°,
 * journey), redrawn in the app's own type and palette: the hero shows the product itself, a
 * Passeport 360° as the platform issues it, instead of decorative artwork. Every claim on this page
 * matches what the app does and what its Centre de confiance states.
 * « Essayer le prototype » leads to the login page, where the demo accounts are.
 */

const AUDIENCES = ["Créateurs indépendants", "Comédiens voix", "Sociétés de production", "Festivals de cinéma", "Documentaristes", "Studios d’animation", "Distributeurs", "Archives et musées"];

const PILLARS = [
  {
    title: "Journal d’audit",
    body: "Chaque décision est inscrite dans un journal chaîné par hachage : on retrouve qui a validé chaque réplique, demandé chaque licence et lancé chaque génération.",
  },
  {
    title: "Panneau énergie",
    body: "La durée de chaque synthèse est mesurée et affichée. L’énergie de l’inférence, calculée chez le fournisseur de voix, sera affichée quand elle pourra être mesurée, plutôt qu’estimée.",
  },
  {
    title: "Coffre local",
    body: "Votre vidéo reste sur votre ordinateur, sauf si vous choisissez de l’envoyer. Seul l’audio nécessaire part vers les moteurs de transcription et de voix, dont les clés restent sur le serveur.",
  },
];

const STEPS = [
  { title: "Import et transcription", body: "Le créateur importe son extrait. L’IA repère qui parle et transcrit la derja, avec un niveau de confiance pour chaque réplique." },
  { title: "Traduction validée", body: "L’IA propose une traduction appuyée sur un glossaire culturel ; un second modèle signale les chiffres et les négations modifiés. Le créateur corrige et approuve chaque réplique." },
  { title: "Consentement des voix", body: "Chaque voix est soumise à son Passeport de voix. Sans licence valide, ou si les droits sont révoqués, la génération est bloquée." },
  { title: "Export et Passeport 360°", body: "La vidéo doublée sort avec le label IA et le QR code de son Passeport 360° : voix, licences, validations et journal, vérifiables par tous sans compte." },
];

/** The product, as the hero's visual: the Passeport 360° of the example project « Bledi, épisode 5 ». */
function PassportPreview() {
  return (
    <figure className="l-pp" aria-label="Exemple de Passeport 360°">
      <div className="l-pp-head">
        <div>
          <span className="l-pp-kind">Passeport 360°</span>
          <b className="l-pp-title">Bledi, épisode 5</b>
          <span className="l-pp-meta">Série web · derja tunisienne → français</span>
        </div>
      </div>
      <span className="l-pp-seal">
        <Seal size={88} word="SIGNÉ" date="2026-11-14" label="Passeport 360° signé le 14 novembre 2026" />
      </span>
      <dl className="l-pp-rows">
        <div>
          <dt>Voix</dt>
          <dd>
            <span className="l-pp-voice">
              <i className="solid" aria-hidden />
              Selma · Lina M.
              <small>licence active</small>
            </span>
            <span className="l-pp-voice">
              <i className="dashed" aria-hidden />
              Hamza · Walid
              <small>voix générée par IA</small>
            </span>
          </dd>
        </div>
        <div>
          <dt>Validation humaine</dt>
          <dd>4 / 4 répliques approuvées</dd>
        </div>
        <div>
          <dt>Transparence</dt>
          <dd>Label IA au début · QR code à la fin</dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>
            <span className="l-pp-hash">Ed25519 · 9c41d2…e07b</span>
          </dd>
        </div>
      </dl>
      <figcaption className="l-pp-caption">Exemple · Passeport du projet de démonstration, signé par la plateforme</figcaption>
    </figure>
  );
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = "Sawti 360 | Le doublage de confiance";
    const html = document.documentElement;
    html.classList.add("l-smooth");
    return () => html.classList.remove("l-smooth");
  }, []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="landing">
      <nav className={`l-nav ${scrolled ? "is-scrolled" : ""}`} aria-label="Navigation principale">
        <div className="l-container l-nav-row">
          <a href="#top" className="l-logo">
            Sawti 360.
          </a>
          <div className="l-nav-links">
            <a href="#expertise">Le concept</a>
            <a href="#features">Les piliers</a>
            <a href="#works">Passeport 360°</a>
            <a href="#process">Le parcours</a>
          </div>
          <Link to="/connexion" className="l-cta">
            Connexion
          </Link>
        </div>
      </nav>

      <main id="top">
        {/* Hero: what it does for whom, and the proof it produces */}
        <section className="l-hero">
          <div className="l-container l-hero-grid">
            <div className="l-hero-text">
              <h1>Doublez vos vidéos de la derja tunisienne vers le français</h1>
              <p className="l-hero-lead">
                L’IA transcrit et traduit, vous approuvez chaque réplique, et chaque voix utilisée a son autorisation signée. Chaque œuvre sort avec son Passeport 360°, vérifiable par tous à partir d’un QR code.
              </p>
              <div className="l-hero-actions">
                <Link to="/connexion" className="l-btn">
                  Essayer le prototype
                  <ArrowRight aria-hidden />
                </Link>
                <Link to="/inscription" className="l-link">
                  Créer un compte
                </Link>
              </div>
            </div>
            <div className="l-hero-visual">
              <PassportPreview />
            </div>
          </div>
        </section>

        {/* Mission and audiences */}
        <section id="expertise" className="l-mission">
          <div className="l-container l-mission-grid">
            <h2>Nous brisons la barrière de la langue pour que vos œuvres voyagent.</h2>
            <div>
              <p>La technique seule ne suffit pas. Pour chaque projet culturel, nous garantissons le consentement, la transparence et la responsabilité des voix générées.</p>
              <ul className="l-audiences" aria-label="Pour qui">
                {AUDIENCES.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section id="features" className="l-features">
          <div className="l-container">
            <div className="l-section-head">
              <h2>L’écosystème de confiance</h2>
              <p>Des modules pensés pour l’éthique et la sécurité.</p>
            </div>
            <ul className="l-pillars">
              {PILLARS.map((p) => (
                <li key={p.title}>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Passport */}
        <section id="works" className="l-works">
          <div className="l-container l-works-grid">
            <div className="l-section-head">
              <h2>Obtenez votre Passeport 360°</h2>
              <p>Deux garanties, inscrites dans chaque export.</p>
            </div>
            <div className="l-works-items">
              <article>
                <h3>Doublage supervisé</h3>
                <p>L’IA transcrit les dialogues et propose une traduction qui tient compte du contexte et d’un glossaire. Vous validez chaque réplique : rien n’est doublé sans votre accord.</p>
              </article>
              <article>
                <h3>Passeport de voix</h3>
                <p>Chaque comédien signe une licence numérique : usages permis, thèmes refusés, tarif. Le moteur de règles refuse toute génération sans licence valide, et une licence révoquée bloque la suite.</p>
              </article>
            </div>
          </div>
        </section>

        {/* Journey */}
        <section id="process" className="l-process">
          <div className="l-container l-process-inner">
            <div className="l-section-head">
              <h2>Le parcours d’une œuvre</h2>
              <p>De l’import de l’extrait jusqu’à sa diffusion en français.</p>
            </div>
            <ol className="l-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="l-step-no" aria-hidden>
                    {i + 1}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-container l-footer-row">
          <p className="l-footer-brand">
            <span className="l-logo">Sawti 360.</span>
            <span>Le doublage de confiance</span>
          </p>
          <p className="l-footer-copy">© 2026 Sawti 360. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
