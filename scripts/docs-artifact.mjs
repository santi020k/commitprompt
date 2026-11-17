import { createHash } from "node:crypto";
import { appendFile, lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const validateIdentity = (revision, runId) => {
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "") || !/^[1-9]\d*$/u.test(runId ?? "")) {
    throw new Error("Docs artifacts require a full Git revision and a positive workflow run ID.");
  }
};

export const digestDocs = async (directory) => {
  if (!(await lstat(directory)).isDirectory()) throw new Error("Docs artifact root must be a directory.");

  const files = [];

  const visit = async (relative = "") => {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) files.push([name, sha256(await readFile(join(directory, name)))]);
      else throw new Error(`Docs artifact contains an unsupported file: ${name}`);
    }
  };

  await visit();

  if (!files.some(([name]) => name === "index.html")) throw new Error("Docs artifact has no index.html.");

  files.sort(([left], [right]) => {
    if (left === right) return 0;

    return left < right ? -1 : 1;
  });

  return sha256(JSON.stringify(files));
};

export const createDocsEvidence = async (directory, revision, runId) => {
  validateIdentity(revision, runId);

  const evidence = { schema: 1, revision, runId, digest: await digestDocs(join(directory, "dist")) };

  await writeFile(join(directory, "build-evidence.json"), `${JSON.stringify(evidence)}\n`);

  return evidence;
};

export const verifyDocsEvidence = async (directory, revision, runId, expectedDigest) => {
  validateIdentity(revision, runId);

  if (!/^[a-f0-9]{64}$/u.test(expectedDigest ?? "")) throw new Error("Missing trusted docs build digest.");

  const evidence = JSON.parse(await readFile(join(directory, "build-evidence.json"), "utf8"));

  if (evidence?.schema !== 1 || evidence.revision !== revision || evidence.runId !== runId ||
    evidence.digest !== expectedDigest || await digestDocs(join(directory, "dist")) !== expectedDigest) {
    throw new Error("Docs artifact does not match the verified revision, workflow run, or build digest.");
  }

  return evidence;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, artifactDirectory] = process.argv.slice(2);
  const directory = resolve(artifactDirectory ?? fileURLToPath(new URL("../apps/docs", import.meta.url)));
  const { GITHUB_SHA: revision, GITHUB_RUN_ID: runId, DOCS_BUILD_DIGEST: expectedDigest } = process.env;

  if (command === "create") {
    const evidence = await createDocsEvidence(directory, revision, runId);

    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `digest=${evidence.digest}\n`);

    console.log(`Recorded docs artifact for ${revision}.`);
  } else if (command === "verify") {
    await verifyDocsEvidence(directory, revision, runId, expectedDigest);

    console.log(`Verified docs artifact for ${revision}.`);
  } else {
    throw new Error("Usage: node scripts/docs-artifact.mjs <create|verify> [artifact-directory]");
  }
}
