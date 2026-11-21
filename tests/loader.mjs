// Lets `node --test` run the app's TypeScript directly: resolves the extension-less relative
// imports and the "@/" alias used in src/. Test-only; nothing here ships with the app.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withExtension(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (path.extname(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = path.join(root, "src", specifier.slice(2));
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base && !/\.(c|m)?(j|t)sx?$|\.json$/.test(base)) {
    const found = withExtension(base);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
