import { Check, CircleCheck, CircleX, FlaskConical, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { verifyChain } from "../core/audit";
import { voiceById } from "../core/catalog";
import { fmt } from "../core/credits";
import { PLATFORM_PUBLIC_KEY } from "../core/crypto";
import type { AuditEntry } from "../core/types";
import { BACKEND } from "../lib/backend";
import { loadJournal } from "../state/remote/journal";
import { useStore } from "../state/store";
import { ENGINE_TEXT, useEngineStatus } from "../ui/engine";
import { Callout, Empty, frDate, Hash, KV, PageHead, Prov, Tabs, toast, type ProvKind } from "../ui/kit";
import { useCrumbs } from "../ui/Shell";

type Tab = "apercu" | "journal" | "bench" | "energie" | "modeles";

const GATES: { title: string; gate: string; prov: ProvKind; note: string }[] = [
  { title: "Import local", gate: "Sécurité", prov: "real", note: "La vidéo est lue dans le navigateur ; empreinte SHA-256 calculée." },
  { title: "Séparation des pistes", gate: "Durabilité", prov: "planned", note: "Dialogue séparé de la musique et de l’ambiance." },
  { title: "Transcription", gate: "Diversité", prov: "sim", note: "Derja, français et mélange ; exemples préparés." },
  { title: "Identification des personnages", gate: "Contrôle humain", prov: "real", note: "Propositions de l’IA confirmées par le créateur." },
  { title: "Autorisations", gate: "Consentement", prov: "real", note: "Vivant ou décédé, consentement ou dossier familial. Contrôle IA simulé." },
  { title: "Traduction contextuelle", gate: "Robustesse", prov: "sim", note: "LLM 1 et LLM 2 simulés ; vérificateur de fidélité réel." },
  { title: "Approbation par réplique", gate: "Responsabilité", prov: "real", note: "Chaque approbation est inscrite au journal." },
  { title: "Choix de la voix", gate: "Consentement", prov: "real", note: "Moteur de règles et licences signées, refus par défaut." },
  { title: "Synthèse et mixage", gate: "Durabilité", prov: "real", note: "Synthèse réelle si le moteur est configuré ; mixage simulé." },
  { title: "Export et passeport", gate: "Toutes les portes", prov: "real", note: "Passeport 360° signé et sous-titres réels ; MP4 prévu." },
];

const MODULES: { title: string; principle: string; prov: ProvKind; note: string }[] = [
  { title: "Validation et bouton d’arrêt", principle: "Contrôle humain", prov: "real", note: "Rien n’est généré sans approbation explicite." },
  { title: "Passeport de voix et moteur de règles", principle: "Consentement", prov: "real", note: "Licences signées Ed25519, révocation, thèmes interdits." },
  { title: "Équité d’accès", principle: "Équité", prov: "planned", note: "Écarts par accent régional, offre gratuite étudiants." },
  { title: "Sawti-Bench", principle: "Diversité", prov: "planned", note: "Mesures par langue publiées quand elles existent." },
  { title: "Label, générique, QR", principle: "Transparence", prov: "real", note: "Label par format, Passeport 360° public." },
  { title: "Journal d’audit", principle: "Responsabilité", prov: "real", note: "Chaîne SHA-256, falsification détectée." },
  { title: "Garde-fous", principle: "Robustesse", prov: "real", note: "Filtre de contenu, personnalités bloquées ; équipe rouge prévue." },
  { title: "Coffre local", principle: "Sécurité des données", prov: "real", note: "Vidéo jamais envoyée ; clé du moteur côté serveur." },
  { title: "Panneau énergie", principle: "Durabilité", prov: "planned", note: "kWh et gCO₂ affichés « à mesurer » tant qu’ils ne sont pas mesurés." },
];

const ACTIONS: Record<string, string> = {
  LICENCE_SIGNEE: "Licence signée",
  LICENCE_REVOQUEE: "Licence révoquée",
  LICENCE_RETABLIE: "Licence rétablie",
  PASSEPORT_MIS_A_JOUR: "Passeport de voix modifié",
  TEXTE_VALIDE: "Réplique approuvée",
  VALIDATION_RETIREE: "Approbation retirée",
  GENERATION_AUTORISEE: "Génération autorisée",
  GENERATION_REFUSEE: "Génération refusée",
  GENERATION_LANCEE: "Génération lancée",
  PASSEPORT_EXPORTE: "Passeport 360° signé",
  VIDEO_IMPORTEE: "Vidéo importée",
  EXPORT: "Export",
  CONNEXION: "Connexion",
  COMPTE_CREE: "Compte créé",
  PERSONNAGE_CONFIRME: "Personnage confirmé",
  STATUT_DE_VIE_RENSEIGNE: "Statut de vie renseigné",
  CONSENTEMENT_DEMANDE: "Consentement demandé",
  CONSENTEMENT_ACCORDE: "Consentement accordé",
  CONSENTEMENT_REFUSE: "Consentement refusé",
  DOSSIER_FAMILIAL_RECU: "Dossier familial reçu",
  CONTROLE_COHERENCE: "Contrôle de cohérence",
  DOSSIER_FAMILIAL_VALIDE: "Dossier familial validé",
  VERIFICATION_COMPLEMENTAIRE_DEMANDEE: "Vérification complémentaire demandée",
  LICENCE_DEMANDEE: "Licence demandée",
  LICENCE_ACCEPTEE: "Licence acceptée",
  LICENCE_REFUSEE: "Licence refusée",
  PAIEMENT_CONFIRME: "Paiement confirmé",
  PAIEMENT_ECHOUE: "Paiement échoué",
  VOIX_ATTRIBUEE: "Voix attribuée",
  PASSEPORT_DE_VOIX_CREE: "Passeport de voix créé",
  PROFIL_PUBLIC_MIS_A_JOUR: "Profil public modifié",
};

const RED = /REFUS|REVOQU|INCOHERENCE|ECHOU|VERIFICATION$/;

function Journal() {
  const journal = useStore((s) => s.journal);
  useEffect(() => {
    if (BACKEND) void loadJournal(useStore.setState, true);
  }, []);
  const [tampered, setTampered] = useState<AuditEntry[] | null>(null);
  const [check, setCheck] = useState<ReturnType<typeof verifyChain> | null>(null);
  const [limit, setLimit] = useState(40);
  const shown = tampered ?? journal;
  const target = Math.max(0, journal.findIndex((e) => e.action === "GENERATION_REFUSEE" || e.action === "LICENCE_REVOQUEE"));
  const tamper = () => {
    setTampered(journal.map((e, i) => (i === target ? { ...e, decision: "OK", action: e.action === "LICENCE_REVOQUEE" ? "LICENCE_SIGNEE" : "GENERATION_AUTORISEE" } : e)));
    setCheck(null);
    toast(`Entrée ${target} modifiée en mémoire : vérifiez la chaîne`);
  };
  return (
    <div className="stack">
      <div className="row">
        <button className="btn btn-primary" onClick={() => setCheck(verifyChain(shown))}>
          <Check />
          Vérifier la chaîne
        </button>
        {tampered ? (
          <button className="btn btn-secondary" onClick={() => (setTampered(null), setCheck(null))}>
            <RotateCcw />
            Rétablir le journal
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={tamper} disabled={journal.length < 2}>
            <FlaskConical />
            Simuler une falsification
          </button>
        )}
        <span className="hint num">{journal.length} entrées</span>
        <span className="grow" />
        <Prov kind="real">SHA-256</Prov>
      </div>
      {check && (
        <Callout tone={check.ok ? "ok" : "bad"} icon={check.ok ? CircleCheck : CircleX} role="status" title={check.ok ? "Chaîne intacte" : `Chaîne rompue à l’entrée ${check.brokenAt}`}>
          {check.ok ? `Les ${shown.length} entrées sont liées ; aucune n’a été modifiée.` : "Son contenu ne correspond plus à son empreinte : la falsification est détectée."}
        </Callout>
      )}
      <div className="card chain">
        <div className="chain-row" style={{ color: "var(--ink-3)", fontWeight: 500 }}>
          <span>#</span>
          <span>Date</span>
          <span>Acteur</span>
          <span>Événement</span>
          <span>Décision</span>
          <span>Empreinte</span>
        </div>
        {[...shown]
          .reverse()
          .slice(0, limit)
          .map((e) => (
            <div key={e.index} className={`chain-row ${check && !check.ok && e.index === check.brokenAt ? "bad" : ""}`}>
              <span className="num muted">{e.index}</span>
              <span className="num">{frDate(e.timestamp, true)}</span>
              <span className="ellipsis">{e.actor}</span>
              <span className="ellipsis">{ACTIONS[e.action] ?? e.action}</span>
              <span>{e.decision ? <span className={`code ${RED.test(e.decision) || RED.test(e.action) ? "code-bad" : ""}`}>{e.decision}</span> : <span className="faint">—</span>}</span>
              <Hash value={e.entry_hash} n={8} />
            </div>
          ))}
      </div>
      {shown.length > limit && (
        <button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} onClick={() => setLimit((l) => l + 40)}>
          Afficher plus
        </button>
      )}
    </div>
  );
}

export default function Trust() {
  useCrumbs([{ label: "Centre de confiance" }]);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("onglet") as Tab) ?? "apercu";
  const usage = useStore((s) => s.usage);
  const engine = useEngineStatus();
  const measured = usage.filter((u) => u.ms !== undefined);

  return (
    <>
      <PageHead
        title="Centre de confiance"
        lead="Les dix portes du parcours, les neuf modules de la couche de confiance, le journal d’audit et les mesures. Chaque élément dit s’il est réel, simulé ou prévu."
      />
      <Tabs
        label="Sections"
        value={tab}
        onChange={(t) => setParams(t === "apercu" ? {} : { onglet: t })}
        tabs={[
          { value: "apercu", label: "Portes et modules" },
          { value: "journal", label: "Journal d’audit" },
          { value: "bench", label: "Sawti-Bench" },
          { value: "energie", label: "Énergie" },
          { value: "modeles", label: "Modèles et sécurité" },
        ]}
      />
      <div style={{ marginTop: 24 }} key={tab} className="tab-panel">
        {tab === "apercu" && (
          <div className="stack-lg">
            <section>
              <div className="section-head">
                <h2>Dix portes de confiance</h2>
                <span className="hint">Une porte par étape du parcours.</span>
              </div>
              <div className="gates">
                {GATES.map((g, i) => (
                  <div key={g.title} className="gate">
                    <span className="row-between">
                      <span className="num">{String(i + 1).padStart(2, "0")}</span>
                      <Prov kind={g.prov} />
                    </span>
                    <b>{g.title}</b>
                    <span className="hint">{g.gate}</span>
                    <p>{g.note}</p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="section-head">
                <h2>Neuf modules de la couche de confiance</h2>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Principe</th>
                      <th>Ce qu’il fait ici</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => (
                      <tr key={m.title}>
                        <td style={{ fontWeight: 500 }}>{m.title}</td>
                        <td className="muted">{m.principle}</td>
                        <td>{m.note}</td>
                        <td>
                          <Prov kind={m.prov} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        {tab === "journal" && <Journal />}
        {tab === "bench" && (
          <div className="stack-lg">
            <Callout tone="plain" title="Aucune valeur n’est inventée.">
              Sawti-Bench mesurera le WER de la transcription et la qualité de traduction par langue et par accent. Les barres restent vides tant que les mesures n’existent pas ; les écarts seront publiés, même défavorables.
            </Callout>
            <div className="card">
              <div className="card-body bench">
                {["Derja tunisienne (Tunis)", "Derja tunisienne (Sfax)", "Derja tunisienne (Sud)", "Français", "Arabe standard", "Amazigh (si données)"].map((l) => (
                  <div key={l} className="bench-row">
                    <span>{l}</span>
                    <span className="bench-bar" aria-hidden />
                    <span className="muted">WER à mesurer</span>
                  </div>
                ))}
              </div>
            </div>
            <Prov kind="planned">mesures en préparation</Prov>
          </div>
        )}
        {tab === "energie" && (
          <div className="stack-lg">
            <Callout tone="plain">
              <b>Mesuré ici :</b> la durée de chaque génération vue du navigateur et la taille de l’audio reçu. <b>Pas encore mesuré :</b> l’énergie de l’inférence, qui a lieu chez le fournisseur de voix et n’est pas publiée par requête. Elle est affichée « à mesurer » plutôt qu’estimée.
            </Callout>
            {measured.length === 0 ? (
              <Empty title="Aucune génération mesurée">Générez une réplique (aperçu audio ou génération complète) : sa durée et sa taille apparaîtront ici.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Voix</th>
                      <th className="r">Caractères</th>
                      <th className="r">Durée mesurée</th>
                      <th className="r">Audio reçu</th>
                      <th>Énergie</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {measured.map((u) => (
                      <tr key={u.id}>
                        <td>{frDate(u.at, true)}</td>
                        <td>{voiceById(u.voice_id)?.name}</td>
                        <td className="r">{fmt.format(u.chars)}</td>
                        <td className="r">{fmt.format(u.ms!)} ms</td>
                        <td className="r">{fmt.format(Math.round((u.bytes ?? 0) / 1024))} Ko</td>
                        <td className="muted">à mesurer</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === "modeles" && (
          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <h3>Modèles et versions</h3>
              </div>
              <div className="card-body-tight">
                <KV
                  rows={[
                    ["Synthèse vocale", <span>ElevenLabs eleven_multilingual_v2 <Prov kind="real" /></span>],
                    ["Voix", "Voix de synthèse prédéfinies, n’imitant aucune personne réelle"],
                    ["Transcription derja", <span>Non branchée <Prov kind="sim" /></span>],
                    ["Traduction LLM 1 et vérification LLM 2", <span>Non branchées <Prov kind="sim" /></span>],
                    ["Contrôle du dossier familial", <span>Non branché <Prov kind="sim" /></span>],
                    ["Vérificateur de fidélité", <span>Règles : chiffres et négations <Prov kind="real" /></span>],
                    ["Filtre de contenu", <span>Lignes rouges et thèmes par titulaire <Prov kind="real" /></span>],
                  ]}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h3>Sécurité et confidentialité</h3>
              </div>
              <div className="card-body-tight">
                <KV
                  rows={[
                    ["Vidéo source", "Lue dans le navigateur, jamais téléversée"],
                    ["Clé du moteur de voix", "Uniquement côté serveur"],
                    ["Double contrôle", "Moteur de règles dans le navigateur puis à nouveau sur le serveur"],
                    ["Signature", "Ed25519, clé de démonstration publique"],
                    ["Clé publique", <Hash value={PLATFORM_PUBLIC_KEY} n={12} />],
                    ["Moteur de voix", engine === "loading" ? "…" : ENGINE_TEXT[engine]],
                  ]}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
