import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const scanRoots = [join(root, "app"), join(root, "components")];
const forbiddenRuntimeImports = [
  /^import\s+(?!type\b)[^;\n]*from\s+["']@usejunction\/db["']/m,
  /^import\s+(?!type\b)[^;\n]*from\s+["']@\/auth["']/m,
  /^import\s+(?!type\b)[^;\n]*from\s+["']next\/headers["']/m,
  /^import\s+(?!type\b)[^;\n]*from\s+["']@\/lib\/workspace-context["']/m,
  /^import\s+(?!type\b)[^;\n]*from\s+["']@\/lib\/rbac["']/m,
];
const failures = [];

function visit(path) {
  for (const name of readdirSync(path)) {
    const file = join(path, name);
    if (statSync(file).isDirectory()) visit(file);
    else if (/\.(?:ts|tsx)$/.test(name)) check(file);
  }
}

function check(file) {
  const source = readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["'];/.test(source);
  if (isClient) {
    for (const rule of forbiddenRuntimeImports) {
      if (rule.test(source)) failures.push(`${relative(root, file)} imports a server-only module from a Client Component`);
    }
  }
  if (file.endsWith("page.tsx") && /(requireWorkspaceRole|\bauth\(\)|prisma\.)/.test(source)) {
    failures.push(`${relative(root, file)} performs request-time auth or database work`);
  }
}

for (const path of scanRoots) visit(path);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Client/server import boundaries verified.");
