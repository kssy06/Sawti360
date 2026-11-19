import { FolderPlus, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { accountOf, statusOf, useStore } from "../state/store";
import { Empty, PageHead, Segmented } from "../ui/kit";
import { useCrumbs } from "../ui/Shell";
import { ProjectRow } from "./ProjectRow";

type View = "tous" | "en-cours" | "termines";

export default function Projects() {
  const [params, setParams] = useSearchParams();
  const view = (params.get("vue") as View) ?? "tous";
  const label = view === "en-cours" ? "En cours" : view === "termines" ? "Terminés" : "Mes projets";
  useCrumbs([{ label: "Projets", to: "/projets" }, ...(view === "tous" ? [] : [{ label }])]);
  const account = useStore(accountOf);
  const all = useStore((s) => s.projects);
  const order = useStore((s) => s.order);
  const requests = useStore((s) => s.requests);
  const [q, setQ] = useState("");
  const mine = order.map((id) => all[id]).filter((p) => p && p.accountId === account?.id);
  const done = (id: string) => statusOf({ requests }, all[id]) === "termine";
  const counts = { tous: mine.length, "en-cours": mine.filter((p) => !done(p.id)).length, termines: mine.filter((p) => done(p.id)).length };
  const rows = mine
    .filter((p) => (view === "tous" ? true : view === "termines" ? done(p.id) : !done(p.id)))
    .filter((p) => `${p.title} ${p.subtitle}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHead
        title={label}
        lead="Chaque projet suit le même parcours : analyse, personnages, autorisations, voix, traduction, timeline, génération."
        actions={
          <Link to="/nouveau" className="btn btn-primary">
            <Plus />
            Nouveau projet
          </Link>
        }
      />
      <div className="lib-toolbar">
        <Segmented
          label="Filtrer les projets"
          value={view}
          onChange={(v) => setParams(v === "tous" ? {} : { vue: v })}
          options={[
            { value: "tous", label: "Tous", count: counts.tous },
            { value: "en-cours", label: "En cours", count: counts["en-cours"] },
            { value: "termines", label: "Terminés", count: counts.termines },
          ]}
        />
        <label className="input-icon">
          <Search aria-hidden />
          <span className="sr-only">Rechercher un projet</span>
          <input className="input" placeholder="Rechercher un projet" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty
          title={q ? "Aucun projet ne correspond" : view === "termines" ? "Aucun projet terminé" : "Aucun projet"}
          icon={FolderPlus}
          action={
            q ? (
              <button className="btn btn-secondary btn-sm" onClick={() => setQ("")}>
                Effacer la recherche
              </button>
            ) : (
              <Link to="/nouveau" className="btn btn-primary btn-sm">
                Importer une vidéo
              </Link>
            )
          }
        >
          {q ? "Essayez un autre titre." : "Les projets terminés apparaissent ici avec leur Passeport 360°."}
        </Empty>
      ) : (
        <div className="card plist-projects">
          {rows.map((p) => (
            <ProjectRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}
