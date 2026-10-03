import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { posixPath } from "./kit-root.js";

export interface ProposedRule {
  area: "backend" | "frontend" | "testing" | "common";
  evidence: string[];
  suggestion: string;
  templateOnly: boolean;
}

export function analyzeProjectRules(target: string): ProposedRule[] {
  const evidence: ProposedRule[] = [];
  const files = listFiles(target, 400);
  const hasControllers = files.some((file) => /controller/i.test(file));
  const hasServices = files.some((file) => /service/i.test(file));
  const hasRepos = files.some((file) => /repository/i.test(file));
  if (hasControllers && hasServices && hasRepos) {
    evidence.push({
      area: "backend",
      evidence: files.filter((file) => /controller|service|repository/i.test(file)).slice(0, 5),
      suggestion: "El repo parece usar Controller → Service → Repository. Citar estos archivos en las reglas de proyecto.",
      templateOnly: false,
    });
  } else {
    evidence.push({
      area: "backend",
      evidence: [],
      suggestion: "TEMPLATE: no se encontró capa Controller/Service/Repository. No generar reglas de arquitectura inventadas; completar tras revisión humana.",
      templateOnly: true,
    });
  }
  const hasReact = files.some((file) => file.endsWith(".tsx")) || hasDep(target, "react");
  if (hasReact) {
    evidence.push({
      area: "frontend",
      evidence: files.filter((file) => file.endsWith(".tsx")).slice(0, 5),
      suggestion: "Hay componentes React. No introducir otro store si ya existe un mecanismo de estado.",
      templateOnly: false,
    });
  } else {
    evidence.push({
      area: "frontend",
      evidence: [],
      suggestion: "TEMPLATE frontend: aplicar sólo si el rol/stack lo amerita.",
      templateOnly: true,
    });
  }
  const hasTests = files.some((file) => /\.(test|spec)\./.test(file));
  evidence.push({
    area: "testing",
    evidence: files.filter((file) => /\.(test|spec)\./.test(file)).slice(0, 5),
    suggestion: hasTests
      ? "Reutilizar el runner de tests existente; no generar tests triviales que copien la implementación."
      : "TEMPLATE: no hay tests detectados. El verify marcará test como NOT_AVAILABLE, nunca PASS.",
    templateOnly: !hasTests,
  });
  return evidence;
}

export function writeAnalysis(target: string, rules: ProposedRule[]): string {
  const dir = join(target, ".ai");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "proposed-rules.md");
  const body = `# Propuesta de reglas (revisión humana requerida)\n\n${rules
    .map((rule) => `## ${rule.area}\n${rule.templateOnly ? "_template_\n" : ""}${rule.suggestion}\n\nEvidencia:\n${rule.evidence.map((e) => `- \`${e}\``).join("\n") || "- (sin archivos)"}\n`)
    .join("\n")}`;
  writeFileSync(path, body, "utf8");
  return path;
}

function hasDep(target: string, name: string): boolean {
  const pkg = join(target, "package.json");
  if (!existsSync(pkg)) return false;
  const json = JSON.parse(readFileSync(pkg, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return Boolean(json.dependencies?.[name] || json.devDependencies?.[name]);
}

function listFiles(root: string, limit: number): string[] {
  const out: string[] = [];
  walk(root, root, out, limit);
  return out;
}

function walk(root: string, dir: string, out: string[], limit: number): void {
  if (out.length >= limit || !existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".ai"].includes(entry)) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) walk(root, abs, out, limit);
    else out.push(posixPath(relative(root, abs)));
    if (out.length >= limit) return;
  }
}
