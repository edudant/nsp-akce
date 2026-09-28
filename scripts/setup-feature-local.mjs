// Prepare an isolated local Supabase config; never use the production SMTP.
import fs from "node:fs/promises";
import path from "node:path";
const projectId = process.env.NSP_TEST_PROJECT_ID || "nsp-feature-tests";
if (!/^nsp-feature-tests(?:-[0-9]+-[0-9]+)?$/.test(projectId))
  throw new Error("Invalid isolated test project");
const portBase = Number(process.env.NSP_TEST_PORT_BASE || 54321);
if (!Number.isInteger(portBase) || portBase < 1024 || portBase > 65000)
  throw new Error("Invalid test port range");
const workdir = process.env.NSP_TEST_WORKDIR || "/tmp/nsp-supabase-tests";
const root = path.resolve(workdir, "supabase");
await fs.mkdir(root, { recursive: true });
const config = (await fs.readFile("supabase/config.toml", "utf8"))
  .replace('project_id = "nsp-akce"', `project_id = "${projectId}"`)
  .replace("port = 54321", `port = ${portBase}`)
  .replace("port = 54322", `port = ${portBase + 1}`)
  .replace("shadow_port = 54320", `shadow_port = ${portBase + 2}`)
  .replace("port = 54324", `port = ${portBase + 3}`)
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
  `Prepared isolated project in ${workdir}; external SMTP disabled.`,
);
