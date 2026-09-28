/**
 * postinstall patch for @eniac/flexcli <= 1.0.7.
 *
 * flexcli imports JSON with `assert { type: 'json' }` — import-assertion
 * syntax that Node removed in v22+ (it became `with { type: 'json' }`).
 * Upstream has not published a fix, so rewrite the one affected line after
 * every install. Safe to run repeatedly; errors are non-fatal.
 */
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "glob";

const files = await glob("node_modules/@eniac/flexcli/src/**/*.js");
for (const file of files) {
  const source = await readFile(file, "utf8");
  const patched = source.replaceAll(
    /assert\s*\{\s*type:\s*'json'\s*\}/g,
    "with { type: 'json' }"
  );
  if (patched !== source) {
    await writeFile(file, patched);
    console.log(`patched ${file}`);
  }
}
