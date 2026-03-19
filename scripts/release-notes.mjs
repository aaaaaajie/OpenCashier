import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parsePublicChangelog(content) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const firstSectionIndex = normalized.search(/^## \[/m);

  if (firstSectionIndex === -1) {
    fail("Could not find any released sections in CHANGELOG.md.");
  }

  const referenceIndex = normalized.search(/^\[[^\]]+\]: /m);
  const sectionsPart = normalized
    .slice(firstSectionIndex, referenceIndex === -1 ? normalized.length : referenceIndex)
    .trim();

  return sectionsPart.split(/\n(?=## \[)/).map((raw) => {
    const match = raw.match(/^## \[([^\]]+)\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})$/m);

    if (!match) {
      fail(`Failed to parse released section header in CHANGELOG.md: ${raw.split("\n", 1)[0]}`);
    }

    return {
      version: match[1],
      date: match[2],
      raw: raw.trim()
    };
  });
}

function renderSummary(version) {
  const prerelease = version.includes("-");

  return [
    `- ${prerelease ? "This is a prerelease cut intended for external validation before the next stable release." : "This is the current stable OpenCashier release cut."}`,
    "- Included changes are sourced from the published changelog section below, not from raw commit history.",
    "- Review the upgrade notes and known limitations sections before adopting this version in a shared environment."
  ].join("\n");
}

function renderKnownLimitations(version) {
  const prerelease = version.includes("-");
  const lines = [
    "- OpenCashier is still in the `0.x` phase, so minor releases may continue to shape public behavior.",
    "- Provider availability, rollout state, and deployment expectations still follow the current README and integration guides."
  ];

  if (prerelease) {
    lines.unshift("- This build is marked as prerelease and should be treated as a validation cut rather than a long-term pinned target.");
  }

  return lines.join("\n");
}

function renderReleaseNotes(section) {
  const bodyLines = section.raw.split("\n").slice(1).join("\n").trim();

  return `# ${section.version}

## Summary

${renderSummary(section.version)}

## Included In This Release

Released on ${section.date}.

${bodyLines}

## Upgrade Notes

- None recorded for this cut.

## Known Limitations

${renderKnownLimitations(section.version)}
`;
}

function main() {
  const [version] = process.argv.slice(2).filter((arg) => arg !== "--");

  if (!version) {
    fail("Usage: node scripts/release-notes.mjs <version>");
  }

  const changelog = fs.readFileSync(CHANGELOG_PATH, "utf8");
  const section = parsePublicChangelog(changelog).find((entry) => entry.version === version);

  if (!section) {
    fail(`Could not find version ${version} in CHANGELOG.md.`);
  }

  process.stdout.write(renderReleaseNotes(section));
}

main();
