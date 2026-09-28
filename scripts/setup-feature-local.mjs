// Prepare an isolated local Supabase config; never use the production SMTP.
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("/tmp/nsp-supabase-tests/supabase");
await fs.mkdir(root, { recursive: true });
const config = (await fs.readFile("supabase/config.toml", "utf8"))
  .replace('project_id = "nsp-akce"', 'project_id = "nsp-feature-tests"')
  .replace(/\[auth\.email\.smtp\][\s\S]*?(?=\n\[|$)/, "")
  .replace(
    'site_url = "https://edudant.github.io/nsp-akce/"',
    'site_url = "http://127.0.0.1:5175/nsp-akce/"',
  );
await fs.writeFile(path.join(root, "config.toml"), config);
for (const dir of ["migrations", "functions", "templates"])
  await fs.cp("supabase/" + dir, path.join(root, dir), { recursive: true });
await fs.copyFile("supabase/seed.sql", path.join(root, "seed.sql"));
console.log(
  "Prepared isolated project in /tmp/nsp-supabase-tests; external SMTP disabled.",
);
