import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/700.css";
import "./landing.css";
import { ArrowRight, Fingerprint, Leaf, Lock, Star } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "../ui/motion";

/**
 * Public home page. Ported from the team's static design (Tailwind CDN) into scoped CSS:
 * same copy, structure, scroll reveals, marquee, floating hands and parallax.
 * « Connexion » and « Entrer dans l’expérience » lead to the login page.
 */

const AUDIENCES = ["Créateurs indépendants", "Comédiens voix", "Sociétés de production", "Festivals de cinéma", "Documentaristes", "Studios d'animation", "Distributeurs", "Archives et musées"];

/** Fades and lifts an element in the first time it enters the viewport. */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (setShown(true), io.disconnect())),
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`l-reveal ${shown ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Clock() {
  const fmt = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const t = setInterval(() => setTime(fmt()), 30000);
    return () => clearInterval(t);
  }, []);
  return <span>{time}</span>;
}

export default function Landing() {
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Sawti 360 | Le doublage de confiance";
    const html = document.documentElement;
    html.classList.add("l-smooth");
    return () => html.classList.remove("l-smooth");
  }, []);

  // One rAF-throttled scroll handler drives the nav state, hero parallax and the card parallax.
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      setScrolled(y > 50);
      if (reduced) return;
      if (hero.current && y < 1000) {
        hero.current.style.transform = `translateY(${y * 0.4}px)`;
        hero.current.style.opacity = String(Math.max(0, 1 - y / 600));
      }
      root.current?.style.setProperty("--l-up", `${y * -0.05}px`);
      root.current?.style.setProperty("--l-down", `${y * 0.05}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className="landing" ref={root}>
      <div className="l-noise" aria-hidden />

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
        {/* Hero */}
        <section className="l-hero">
          <div className="l-hero-bg" aria-hidden>
            <img src="https://framerusercontent.com/images/9zvwRJAavKKacVyhFCwHyXW1U.png?width=1536&height=1024" alt="" />
            <div className="l-hero-fade" />
          </div>
          <div className="l-hand l-hand-left" aria-hidden>
            <img src="https://framerusercontent.com/images/KNhiA5A2ykNYqNkj04Hk6BVg5A.png?width=1540&height=1320" alt="" />
          </div>
          <div className="l-hand l-hand-right" aria-hidden>
            <img src="https://framerusercontent.com/images/X89VFCABCEjjZ4oLGa3PjbOmsA.png?width=1542&height=1002" alt="" />
          </div>

          <div className="l-container l-hero-content">
            <div ref={hero} className="l-hero-inner">
              <Reveal>
                <h1 className="l-hero-title">
                  Sawti 360. <br />
                  <span>Le doublage de confiance.</span>
                </h1>
              </Reveal>
              <Reveal delay={200}>
                <p className="l-hero-lead">Chaque voix a un passeport, chaque œuvre sort avec son Passeport 360°. L'IA au service de l'audiovisuel culturel, sous contrôle humain.</p>
              </Reveal>
              <Reveal delay={400} className="l-hero-actions">
                <Link to="/connexion" className="l-pill">
                  <span>Entrer dans l'expérience</span>
                </Link>
                <div className="l-meta">
                  <Clock />
                  <span className="l-meta-sep" aria-hidden />
                  <span>Monde francophone</span>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Mission and marquee */}
        <section id="expertise" className="l-mission">
          <div className="l-container">
            <Reveal className="l-mission-text">
              <h2>Nous brisons la barrière de la langue pour que vos œuvres voyagent.</h2>
              <p>La technique seule ne suffit pas. Pour chaque projet culturel, nous garantissons le consentement, la transparence et la responsabilité des voix générées.</p>
            </Reveal>
          </div>
          <div className="l-marquee">
            <div className="l-marquee-fade left" aria-hidden />
            <div className="l-marquee-track">
              {[0, 1].map((set) => (
                <div key={set} className="l-marquee-set" aria-hidden={set === 1}>
                  {AUDIENCES.map((a) => (
                    <Fragment key={a}>
                      <span className="l-marquee-item">{a}</span>
                      <span className="l-marquee-icon" aria-hidden />
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
            <div className="l-marquee-fade right" aria-hidden />
          </div>
        </section>

        {/* Pillars */}
        <section id="features" className="l-features">
          <div className="l-container">
            <Reveal className="l-section-head">
              <h2>L'écosystème de confiance</h2>
              <p>Des modules pensés pour l'éthique et la sécurité.</p>
            </Reveal>
            <div className="l-feature-grid">
              {[
                { Icon: Fingerprint, title: "Journal d'audit", body: "Chaque décision est enregistrée dans un journal à chaîne de hachage : toute modification se voit, et l'on remonte à la source de chaque validation." },
                { Icon: Leaf, title: "Panneau énergie", body: "L'IA a un coût. La durée de chaque synthèse est mesurée et affichée ; l'énergie de l'inférence, calculée chez le fournisseur de voix, sera affichée quand elle pourra être mesurée, plutôt qu'estimée." },
                { Icon: Lock, title: "Coffre local", body: "Votre vidéo reste sur votre ordinateur, sauf si vous choisissez de l'envoyer. Seul l'audio nécessaire part vers les moteurs de transcription et de voix, dont les clés restent sur le serveur." },
              ].map(({ Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 100} className="l-feature">
                  <Icon className="l-feature-icon" aria-hidden />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Passport cards */}
        <section id="works" className="l-works">
          <div className="l-container l-works-inner">
            <Reveal className="l-works-head">
              <h2>
                Obtenez votre <br />
                <span>Passeport 360°</span>
              </h2>
            </Reveal>
            <div className="l-cards">
              <div className="l-par-down">
                <Reveal className="l-card l-card-accent">
                  <div className="l-card-top">
                    <span className="l-card-icon l-icon-turn">
                      <Star aria-hidden />
                    </span>
                    <span className="l-card-no">01</span>
                  </div>
                  <div>
                    <h3>
                      Doublage <br />
                      supervisé
                    </h3>
                    <p>L'IA transcrit les dialogues et propose une traduction contextuelle. Le créateur et l'adaptateur valident chaque réplique : rien n'est doublé sans leur accord.</p>
                  </div>
                  <div className="l-card-rule" />
                </Reveal>
              </div>
              <div className="l-par-up l-card-offset">
                <Reveal delay={150} className="l-card l-card-dark">
                  <div className="l-card-top">
                    <span className="l-card-icon l-icon-lift">
                      <ArrowRight aria-hidden style={{ transform: "rotate(-45deg)" } as CSSProperties} />
                    </span>
                    <span className="l-card-no">02</span>
                  </div>
                  <div>
                    <h3>
                      Passeport <br />
                      de voix
                    </h3>
                    <p>Un contrat numérique signé par chaque comédien. Le moteur de règles refuse toute génération sans licence valide, et une licence révoquée bloque la suite.</p>
                  </div>
                  <div className="l-card-rule" />
                </Reveal>
              </div>
            </div>
          </div>
          <div className="l-dots" aria-hidden />
        </section>

        {/* Journey */}
        <section id="process" className="l-process">
          <div className="l-container l-process-inner">
            <Reveal className="l-process-head">
              <h2>Le parcours d'une œuvre</h2>
              <p>De l'importation locale jusqu'à la distribution internationale.</p>
            </Reveal>
            <ol className="l-steps">
              {[
                { title: "Sécurité et transcription", hot: true, body: <>Le créateur importe son extrait : la vidéo reste dans le <strong>Coffre local</strong>. L'IA repère qui parle et transcrit la derja, avec un niveau de confiance pour chaque réplique.</> },
                { title: "Validation et traduction contextuelle", hot: false, body: <>L'IA propose une traduction basée sur un glossaire culturel. Le créateur et l'adaptateur corrigent et valident chaque réplique. <strong>Rien ne passe sans contrôle humain.</strong></> },
                { title: "Moteur de consentement", hot: false, body: <>L'attribution d'une voix synthétique est soumise au <strong>Passeport de Voix</strong>. Sans licence valide ou si les droits sont révoqués, le système bloque techniquement la génération.</> },
                { title: "Export du Passeport 360°", hot: true, body: <>L'œuvre est exportée avec la piste doublée, le label IA et son <strong>Passeport 360°</strong> vérifiable par QR code : il contient les voix, les licences et les validations humaines.</> },
              ].map((s, i) => (
                <li key={s.title}>
                  <Reveal className="l-step">
                    <span className={`l-step-no ${s.hot ? "hot" : ""}`}>{i + 1}</span>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-container l-footer-row">
          <p className="l-footer-mark" aria-hidden>
            SAWTI 360.
          </p>
          <p className="l-footer-copy">© 2026 Sawti 360. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
