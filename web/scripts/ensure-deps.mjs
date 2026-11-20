// Runs before `npm run dev` / `npm run build`: if a dependency listed in package.json is not
// installed (typical right after a `git pull` that added packages), run `npm install` once.
// Without it Vite fails with « Failed to resolve import "@supabase/supabase-js" ».
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = names.filter((n) => !existsSync(join(root, "node_modules", n, "package.json")));

if (missing.length) {
  console.log(`[sawti] ${missing.length} paquet(s) manquant(s) (${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}) : npm install`);
  execSync("npm install --no-audit --no-fund", { cwd: root, stdio: "inherit" });
}
