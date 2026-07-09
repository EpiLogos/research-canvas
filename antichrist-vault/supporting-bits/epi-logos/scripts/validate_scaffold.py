#!/usr/bin/env python3
import json
from pathlib import Path
import re
import sys


# ROOT is the epi-logos/ plugin directory (two levels up from this script)
ROOT = Path(__file__).resolve().parent.parent

# Thought field lives at the repo root, one level above ROOT
THOUGHT_ROOT = ROOT.parent / "Thought"


REQUIRED_FILES = [
    ROOT / "README.md",
    ROOT / ".claude-plugin" / "plugin.json",
    ROOT / ".claude-plugin" / "marketplace.json",
    ROOT / ".claude-plugin" / "INSTALL.md",
    ROOT / ".codex" / "INSTALL.md",
    ROOT / "docs" / "specs" / "2026-04-03-epi-logos-plugin-ecology-first-pass-spec.md",
    ROOT / "resources" / "canon" / "source-and-method.md",
    ROOT / "resources" / "canon" / "topological-runtime-modes.md",
    ROOT / "resources" / "canon" / "positions-and-coherence-walk.md",
    ROOT / "resources" / "canon" / "lens-squares-and-orchestration.md",
    ROOT / "resources" / "canon" / "use-modalities-and-rubrics.md",
    ROOT / "resources" / "canon" / "thought-artifacts.md",
    ROOT / "resources" / "canon" / "session-reflection-and-compression.md",
    ROOT / "resources" / "pedagogy" / "README.md",
    ROOT / "resources" / "pedagogy" / "deep" / "00-throughline-and-argument-tree.md",
    ROOT / "resources" / "pedagogy" / "deep" / "01-source-paradox-and-topological-necessity.md",
    ROOT / "resources" / "pedagogy" / "deep" / "02-ql-modeling-question-shaping-and-tetralemma.md",
    ROOT / "resources" / "pedagogy" / "deep" / "03-mef-lenses-cmea-and-telos.md",
    ROOT / "resources" / "pedagogy" / "deep" / "04-psychoid-bridge-atom-archetype-and-quantity-quality.md",
    ROOT / "resources" / "pedagogy" / "deep" / "05-coordinate-system-passes-squares-and-runtime.md",
    ROOT / "resources" / "pedagogy" / "deep" / "06-pedagogical-paths-and-worked-openings.md",
    ROOT / "resources" / "pedagogy" / "deep" / "07-evolution-of-knowledge-and-consciousness.md",
    ROOT / "resources" / "pedagogy" / "deep" / "08-symbol-mathematics-and-topological-demonstration.md",
    ROOT / "resources" / "pedagogy" / "deep" / "09-dialogical-knowing-human-ai-and-operative-practice.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "README.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "01-l0-l0-prime-archetypal-number-and-questioning.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "02-l1-l1-prime-causation-and-phenomenality.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "03-l2-l2-prime-logic-and-alchemical-transformation.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "04-l3-l3-prime-process-history-and-creative-advance.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "05-l4-l4-prime-encounter-science-and-situated-knowing.md",
    ROOT / "resources" / "pedagogy" / "lenses" / "06-l5-l5-prime-speech-logos-and-incarnation.md",
    THOUGHT_ROOT / "README.md",
]

REQUIRED_SKILLS = [
    "using-epi-logos",
    "choose-modality",
    "choose-topological-mode",
    "engage-encounter-axis",
    "apply-tetralemma",
    "apply-cmea",
    "run-positional-coherence",
    "run-l4-prime-loop",
    "manage-thought-artifacts",
    "compress-thought-artifacts",
    "converse-pedagogically",
]

REQUIRED_COMMANDS = [
    "diagnose.md",
    "apply.md",
    "explore.md",
    "explain.md",
    "compress-thoughts.md",
]

REQUIRED_AGENTS = [
    "ql-cartographer.md",
    "mef-diagnostician.md",
]

THOUGHT_DIRS = [
    "Questions",
    "Traces",
    "Challenges",
    "Patterns",
    "Discovery",
    "Insight",
    "Being",
    "Thrownness",
    "Presence",
    "Temporality",
    "Care",
    "Releasement",
]

# Skills that must contain a bootstrap guard (all except the bootstrap itself)
BOOTSTRAP_REQUIRED_SKILLS = [
    "choose-modality",
    "choose-topological-mode",
    "engage-encounter-axis",
    "apply-tetralemma",
    "apply-cmea",
    "run-positional-coherence",
    "run-l4-prime-loop",
    "manage-thought-artifacts",
    "compress-thought-artifacts",
    "converse-pedagogically",
]

# The current bootstrap guard text used in child skills
BOOTSTRAP_GUARD = "> `using-epi-logos` runs first. If it hasn't been invoked this turn, go there now."


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    sys.exit(1)


def check_frontmatter(skill_path: Path) -> None:
    text = skill_path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail(f"{skill_path} missing frontmatter start")
    parts = text.split("---", 2)
    if len(parts) < 3:
        fail(f"{skill_path} missing complete frontmatter block")
    frontmatter = parts[1]
    if "name:" not in frontmatter or "description:" not in frontmatter:
        fail(f"{skill_path} frontmatter missing name or description")


def check_bootstrap_guard(skill_path: Path) -> None:
    text = skill_path.read_text(encoding="utf-8")
    if BOOTSTRAP_GUARD not in text:
        fail(f"{skill_path} missing bootstrap guard")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_header(path: Path) -> None:
    text = read_text(path).strip()
    if not text:
        fail(f"{path} is empty")
    if not text.startswith("# "):
        fail(f"{path} must start with a markdown heading")


def extract_command_skills(command_path: Path) -> list[str]:
    return re.findall(r"`epi-logos:([a-z0-9-]+)`", read_text(command_path))


def main() -> None:
    for file_path in REQUIRED_FILES:
        if not file_path.exists():
            fail(f"required file missing: {file_path}")
        check_header(file_path) if file_path.suffix == ".md" else None

    plugin_data = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
    if plugin_data.get("name") != "epi-logos":
        fail("plugin.json name must be 'epi-logos'")

    marketplace_data = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
    if not marketplace_data.get("plugins"):
        fail("marketplace.json must contain at least one plugin entry")

    seen_skills: set[str] = set()
    for skill_name in REQUIRED_SKILLS:
        skill_path = ROOT / "skills" / skill_name / "SKILL.md"
        if not skill_path.exists():
            fail(f"required skill missing: {skill_path}")
        check_frontmatter(skill_path)
        if skill_name in BOOTSTRAP_REQUIRED_SKILLS:
            check_bootstrap_guard(skill_path)
        seen_skills.add(skill_name)

    command_references: set[str] = set()
    for command_name in REQUIRED_COMMANDS:
        command_path = ROOT / "commands" / command_name
        if not command_path.exists():
            fail(f"required command missing: {command_path}")
        command_text = read_text(command_path)
        if "disable-model-invocation: true" not in command_text:
            fail(f"{command_path} must disable direct model invocation")
        refs = extract_command_skills(command_path)
        if not refs:
            fail(f"{command_path} must reference at least one epi-logos skill")
        for ref in refs:
            if ref not in seen_skills:
                fail(f"{command_path} references unknown skill: {ref}")
            command_references.add(ref)

    for agent_name in REQUIRED_AGENTS:
        agent_path = ROOT / "agents" / agent_name
        if not agent_path.exists():
            fail(f"required agent missing: {agent_path}")
        check_frontmatter(agent_path)

    if not THOUGHT_ROOT.exists():
        fail(f"Thought directory missing at: {THOUGHT_ROOT}")
    for name in THOUGHT_DIRS:
        readme = THOUGHT_ROOT / name / "README.md"
        if not readme.exists():
            fail(f"missing tracked Thought artifact directory or README: {readme}")
        check_header(readme)

    missing_from_commands = sorted(set(REQUIRED_SKILLS) - command_references)
    if missing_from_commands:
        fail(f"required skills not reachable from commands: {', '.join(missing_from_commands)}")

    print("Scaffold validation passed.")


if __name__ == "__main__":
    main()
