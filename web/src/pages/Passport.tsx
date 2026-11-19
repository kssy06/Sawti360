import { CircleCheck, CircleMinus, CircleX, Download, ExternalLink, FileBadge2, FileUp, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { shortHash } from "../core/canonical";
import { PLATFORM_PUBLIC_KEY } from "../core/crypto";
import { decodePassport, encodePassport, verifyPassport, type Passport360, type PassportFile } from "../core/passport";
import type { AuditEntry } from "../core/types";
import { CREATOR, currentProject, useStore } from "../state/store";
import { BrandMark } from "../ui/Shell";
import { frDate, toast } from "../ui/kit";

function verifyUrl(p: Passport360): string {
  return `${window.location.origin}/verifier#p=${encodePassport(p)}`;
}

function Dossier({ p }: { p: Passport360 }) {
  return (
    <div className="dossier">
      <section>
        <h3>Identité</h3>
        <dl className="dl">
          <dt>Œuvre</dt>
          <dd>{p.identite.titre}</dd>
          <dt>Version</dt>
          <dd>{p.identite.version}</dd>
          <dt>Signé le</dt>
          <dd>{frDate(p.identite.date, true)}</dd>
          <dt>Empreinte du texte validé</dt>
          <dd className="mono" title={p.identite.empreinte_texte_valide}>
            {shortHash(p.identite.empreinte_texte_valide, 20)}
          </dd>
        </dl>
      </section>
      <section>
        <h3>Voix</h3>
        <dl className="dl">
          {p.voix.map((v) => (
            <div key={v.personnage} className="dl-row">
              <dt>{v.personnage}</dt>
              <dd>
                {v.titulaire} · {v.nature}
                {v.licence ? (
                  <>
                    {" "}
                    · licence <span className="mono">{v.licence.license_id}</span> ({v.licence.statut === "active" ? "valide" : "révoquée"}, entraînement interdit)
                  </>
                ) : (
                  " · aucune licence"
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Transparence</h3>
        <dl className="dl">
          <dt>Label visible</dt>
          <dd>{p.transparence.label}</dd>
          <dt>Générique des voix</dt>
          <dd>{p.transparence.generique.join(" ; ")}</dd>
          <dt>Répliques générées</dt>
          <dd className="num">{p.transparence.repliques_generees}</dd>
        </dl>
      </section>
      <section>
        <h3>Responsabilité</h3>
        <dl className="dl">
          <dt>Validation humaine</dt>
          <dd>{p.responsabilite.validateur}</dd>
          <dt>Référent éthique</dt>
          <dd>{p.responsabilite.referent_ethique}</dd>
          <dt>Journal d’audit</dt>
          <dd className="num">
            {p.responsabilite.nombre_entrees} entrées, dont {p.responsabilite.nombre_refus} refus · tête <span className="mono">{shortHash(p.responsabilite.journal_empreinte_de_tete, 14)}</span>
          </dd>
        </dl>
      </section>
      <section>
        <h3>Langues, sécurité, planète</h3>
        <dl className="dl">
          <dt>Langues</dt>
          <dd>
            {p.langues.source} → {p.langues.cible} · qualité {p.langues.qualite}
          </dd>
          <dt>Sécurité</dt>
          <dd>
            {p.securite.traitement} · {p.securite.modele_voix}
          </dd>
          <dt>Durabilité</dt>
          <dd>
            {p.durabilite.caracteres_synthetises} caractères synthétisés · énergie {p.durabilite.energie}
          </dd>
        </dl>
      </section>
    </div>
  );
}

export default function Passport() {
  const project = useStore(currentProject);
  const passport = useStore((s) => s.passports[s.currentId] ?? null);
  const journal = useStore((s) => s.journal);
  const usage = useStore((s) => s.usage);
  const exportPassport = useStore((s) => s.exportPassport);
  const [qr, setQr] = useState("");
  const generated = usage.filter((u) => u.creator === CREATOR.name && u.project.startsWith(project.title)).length;
  const url = useMemo(() => (passport ? verifyUrl(passport) : ""), [passport]);

  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "L", margin: 0, color: { dark: "#121212", light: "#ffffff" } }).then(setQr);
  }, [url]);

  const download = () => {
    if (!passport) return;
    const file: PassportFile = { passeport: passport, journal };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `passeport-360-${project.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Passeport 360°</h1>
          <p className="lead">Le dossier signé qui accompagne chaque export : quelles voix, quels consentements, qui a validé, ce que l’IA a fait. Un festival le vérifie avec le QR, sans avoir à nous croire.</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              exportPassport();
              toast("Passeport signé et inscrit au journal", "ok");
            }}
          >
            <FileBadge2 />
            {passport ? "Signer à nouveau" : "Signer le passeport"}
          </button>
        </div>
      </div>

      {!passport ? (
        <div className="empty">
          <h2 className="h-sm">Aucun passeport signé pour l’instant</h2>
          <p>
            {generated
              ? `${generated} réplique${generated > 1 ? "s" : ""} générée${generated > 1 ? "s" : ""}. Signez le passeport pour figer l’état du doublage, des licences et du journal.`
              : "Générez d’abord au moins une réplique validée dans le Studio, puis signez le passeport ici."}
          </p>
          {!generated && (
            <Link to={`/studio/${project.id}`} className="btn btn-secondary btn-sm">
              Aller au Studio
            </Link>
          )}
        </div>
      ) : (
        <div className="passport">
          <Dossier p={passport} />
          <aside className="qr-card">
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR code de vérification du passeport" />
            <p className="hint">Scannez pour vérifier la signature. Le dossier voyage dans le lien lui-même : aucun serveur ne le reçoit.</p>
            <div className="stack">
              <a className="btn btn-secondary" href={url} target="_blank" rel="noreferrer">
                <ExternalLink />
                Ouvrir la vérification
              </a>
              <button className="btn btn-secondary" onClick={download}>
                <Download />
                Télécharger avec le journal (.json)
              </button>
            </div>
            <dl className="sum">
              <dt>Algorithme</dt>
              <dd>Ed25519</dd>
              <dt>Signature</dt>
              <dd className="mono">{shortHash(passport.signature!.valeur, 14)}</dd>
              <dt>Clé publique</dt>
              <dd className="mono">{shortHash(PLATFORM_PUBLIC_KEY, 14)}</dd>
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ---------- public verification page ---------- */

export function Verify() {
  const { hash } = useLocation();
  const [p, setP] = useState<Passport360 | null>(null);
  const [journal, setJournal] = useState<AuditEntry[] | undefined>();
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const m = hash.match(/p=([\w-]+)/);
    if (!m) return;
    try {
      setP(decodePassport(m[1]));
      setJournal(undefined);
      setError("");
    } catch {
      setError("Le lien est incomplet ou altéré : impossible de lire le passeport.");
    }
  }, [hash]);

  const readFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as PassportFile | Passport360;
      if ("passeport" in data) {
        setP(data.passeport);
        setJournal(data.journal);
      } else {
        setP(data);
        setJournal(undefined);
      }
      setError("");
    } catch {
      setError("Ce fichier n’est pas un Passeport 360° lisible.");
    }
  };

  const result = p ? verifyPassport(p, journal) : null;

  return (
    <div className="verify">
      <header className="verify-top">
        <Link to="/" className="brand">
          <BrandMark />
          <span>Sawti 360</span>
        </Link>
        <span className="muted">Vérification publique</span>
      </header>
      <main className="verify-main">
        <h1>Vérifier un Passeport 360°</h1>
        <p className="lead">Contrôlez qu’un doublage n’a pas été modifié depuis sa signature, et que chaque voix avait une licence valide. La vérification se fait dans votre navigateur.</p>

        {result && p && (
          <section className={`verdict ${result.valid ? "ok" : "bad"}`} aria-live="polite">
            <div className="verdict-head">
              {result.valid ? <ShieldCheck aria-hidden /> : <CircleX aria-hidden />}
              <div>
                <h2>{result.valid ? "Passeport authentique" : "Passeport invalide"}</h2>
                <p>
                  {p.identite.titre} · signé le {frDate(p.identite.date, true)}
                </p>
              </div>
            </div>
            <ul className="checks">
              {result.checks.map((c) => (
                <li key={c.id}>
                  {c.state === "ok" ? <CircleCheck className="c-ok" aria-hidden /> : c.state === "fail" ? <CircleX className="c-bad" aria-hidden /> : <CircleMinus className="c-skip" aria-hidden />}
                  <div>
                    <b>{c.label}</b>
                    <p>{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="verify-voices">
              {p.voix.map((v) => (
                <p key={v.personnage}>
                  <b>{v.personnage}</b> · {v.titulaire} · {v.licence ? `licence ${v.licence.license_id}, ${v.licence.statut === "active" ? "valide" : "révoquée"} à la signature` : "sans licence"}
                </p>
              ))}
              <p className="muted">{p.transparence.label}</p>
            </div>
            {p.donnees_de_demonstration && <p className="hint">Données de démonstration : profils fictifs, clé de démonstration publique.</p>}
          </section>
        )}
        {error && (
          <div className="line line-red" role="alert">
            <CircleX aria-hidden />
            {error}
          </div>
        )}

        <label
          className={`drop ${drag ? "drag" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void readFile(f);
          }}
        >
          <FileUp aria-hidden />
          <span>
            <b>Déposez le fichier .json du passeport</b>
            <span className="muted">ou cliquez pour le choisir. Le fichier complet permet aussi de vérifier la chaîne du journal d’audit.</span>
          </span>
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        <p className="hint">
          Clé publique de la plateforme (démonstration) : <span className="mono">{PLATFORM_PUBLIC_KEY}</span>
        </p>
      </main>
    </div>
  );
}
