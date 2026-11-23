import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDocsEvidence, verifyDocsEvidence } from "./docs-artifact.mjs";

const revision = "a".repeat(40);
const runId = "123";

const fixture = async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "commitprompt-artifact-"));

  context.after(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, "dist", "_astro"), { recursive: true });

  await writeFile(join(directory, "dist", "index.html"), "<html>PostLens</html>");

  await writeFile(join(directory, "dist", "_astro", "page.js"), "export const ready = true;");

  return directory;
};

test("a copied build verifies without rebuilding and evidence stays outside deployed assets", async (context) => {
  const directory = await fixture(context);
  const evidence = await createDocsEvidence(directory, revision, runId);
  const copy = join(directory, "download");

  await mkdir(copy);

  await cp(join(directory, "dist"), join(copy, "dist"), { recursive: true });

  await cp(join(directory, "build-evidence.json"), join(copy, "build-evidence.json"));

  assert.deepEqual(await verifyDocsEvidence(copy, revision, runId, evidence.digest), evidence);

  await assert.rejects(readFile(join(copy, "dist", "build-evidence.json")), { code: "ENOENT" });
});

test("a different revision, workflow, or trusted digest cannot reuse an artifact", async (context) => {
  const directory = await fixture(context);
  const { digest } = await createDocsEvidence(directory, revision, runId);

  for (const args of [["b".repeat(40), runId, digest], [revision, "124", digest], [revision, runId, "b".repeat(64)], [revision, runId, ""]]) {
    await assert.rejects(verifyDocsEvidence(directory, ...args));
  }
});

for (const mutation of ["change", "add", "remove", "symlink", "manifest"]) {
  test(`rejects ${mutation} after a successful build`, async (context) => {
    const directory = await fixture(context);
    const { digest } = await createDocsEvidence(directory, revision, runId);

    if (mutation === "change") await writeFile(join(directory, "dist", "index.html"), "changed");

    if (mutation === "add") await writeFile(join(directory, "dist", "unexpected.txt"), "extra");

    if (mutation === "remove") await rm(join(directory, "dist", "_astro", "page.js"));

    if (mutation === "symlink") await symlink("index.html", join(directory, "dist", "link.html"));

    if (mutation === "manifest") await writeFile(join(directory, "build-evidence.json"), "null");

    await assert.rejects(verifyDocsEvidence(directory, revision, runId, digest));
  });
}

test("missing output and invalid provenance cannot produce evidence", async (context) => {
  const directory = await fixture(context);

  await assert.rejects(createDocsEvidence(directory, "main", runId));

  await assert.rejects(createDocsEvidence(directory, revision, "0"));

  await rm(join(directory, "dist", "index.html"));

  await assert.rejects(createDocsEvidence(directory, revision, runId), /no index.html/u);
});


test("deployment verifies the producer artifact without rebuilding", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const job = workflow.split("  deploy-docs:\n")[1].split("  gate:\n")[0];

  assert.match(job, /artifact-ids: \$\{\{ needs.full.outputs.artifact-id \}\}/u);

  assert.match(job, /DOCS_BUILD_DIGEST: \$\{\{ needs.full.outputs.digest \}\}/u);

  assert.match(job, /run: node scripts\/docs-artifact.mjs verify/u);

  assert.doesNotMatch(job, /pnpm run docs:build/u);

  assert.ok(job.indexOf("docs-artifact.mjs verify") < job.indexOf("Fetch production secrets"));

  assert.match(workflow, /name: docs-\$\{\{ github.sha \}\}-\$\{\{ github.run_attempt \}\}/u);
});

test("deployment does not wait for the Windows smoke that required checks still enforce", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const job = workflow.split("  deploy-docs:\n")[1].split("  gate:\n")[0];
  const gate = workflow.split("  gate:\n")[1].split("  report-dispatched-validation:")[0];

  assert.match(job, /needs: \[changes, impact, full, compatibility\]/u);

  assert.doesNotMatch(job, /needs\.windows/u);

  assert.match(gate, /needs: \[changes, metadata, impact, full, compatibility, windows, deploy-docs\]/u);
});

test("required checks reject selected skips and malformed outputs", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const gate = workflow.split("  gate:\n")[1].split("  report-dispatched-validation:")[0];
  const script = gate.split("        run: |\n")[1];

  const success = {
    METADATA: "success", IMPACT: "success", CHANGES: "success", FULL: "success", COMPATIBILITY: "success",
    WINDOWS: "success", DEPLOY: "success", MODE: "full", PACKAGE: "true", DOCS: "true",
    GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
  };

  const run = overrides => spawnSync("bash", ["-e", "-c", script], {
    env: { PATH: process.env.PATH, ...success, ...overrides }, encoding: "utf8",
  }).status;

  assert.equal(run({}), 0);

  for (const job of ["METADATA", "IMPACT", "CHANGES", "FULL", "COMPATIBILITY", "WINDOWS", "DEPLOY"]) {
    for (const result of ["skipped", "cancelled", "failure"]) assert.equal(run({ [job]: result }), 1);
  }

  assert.equal(run({ MODE: "affected", PACKAGE: "false", COMPATIBILITY: "skipped", WINDOWS: "skipped" }), 0);

  assert.equal(run({ GITHUB_EVENT_NAME: "pull_request", DEPLOY: "skipped" }), 0);

  for (const output of ["MODE", "PACKAGE", "DOCS"]) {
    for (const value of ["", "unknown"]) assert.equal(run({ [output]: value }), 1);
  }
});
