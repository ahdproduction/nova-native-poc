// Resolve Nova CSS custom properties (light :root and .dark:root) to final values.
// Usage: bun resolve-tokens.ts <spark.css> <prefix> [<prefix> ...]
import { readFileSync } from 'node:fs';

const [file, ...prefixes] = process.argv.slice(2);
const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const light = new Map<string, string>();
const dark = new Map<string, string>();
const blockRe = /([^{}]+)\{([^{}]*)\}/g;
for (const m of css.matchAll(blockRe)) {
  const selector = m[1].trim();
  const target = selector === '.dark:root' ? dark : selector === ':root' ? light : null;
  if (!target) continue;
  for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target.set(d[1], d[2].trim());
}

function resolve(value: string, mode: 'light' | 'dark', depth = 0): string {
  if (depth > 20) return value;
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    const v = (mode === 'dark' ? dark.get(name) : undefined) ?? light.get(name);
    return v === undefined ? `var(${name})` : resolve(v, mode, depth + 1);
  });
}

const names = new Set([...light.keys(), ...dark.keys()]);
const out: Record<string, { light: string; dark: string }> = {};
for (const name of [...names].sort()) {
  if (!prefixes.some(p => name.startsWith(p))) continue;
  const base = light.get(name) ?? dark.get(name)!;
  out[name] = { light: resolve(base, 'light'), dark: resolve(dark.get(name) ?? base, 'dark') };
}
if (process.env.FORMAT !== 'tamber') {
  console.log(JSON.stringify(out, null, 1));
} else {
  // Colour tokens only; lengths are resolved into the Contract source.
  const isColour = (v: string) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(v);
  const lines = ['// Generated from @nova-design-system/nova-base dist/css/spark.css by tools/resolve-tokens.ts.', '// Do not edit by hand.', 'tamber nova', '', 'theme'];
  for (const [name, { light: l, dark: d }] of Object.entries(out)) {
    if (!isColour(l) || !isColour(d)) continue;
    const token = name.slice(2);
    lines.push(l === d ? `  ${token} = ${l}  scheme=fixed` : `  ${token} = light-dark(${l}, ${d})`);
  }
  // The platform's tint (focus ring, caret) is Nova's focus colour.
  if (out['--color-focus-brand']) lines.push('  AccentColor = color-focus-brand');
  console.log(lines.join('\n'));
}
