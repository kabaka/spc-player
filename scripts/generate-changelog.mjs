/**
 * Generates a markdown changelog from conventional commits since the last
 * git tag. Groups commits by type and outputs a formatted changelog.
 *
 * Usage: node scripts/generate-changelog.mjs [--tag <from-tag>]
 *
 * If --tag is not provided, defaults to the most recent git tag.
 * If no tags exist, includes all commits.
 */

import { execFileSync, execSync } from 'node:child_process';

const TYPE_LABELS = {
  feat: '🚀 Features',
  fix: '🐛 Bug Fixes',
  perf: '⚡ Performance',
  refactor: '♻️ Refactors',
  docs: '📝 Documentation',
  test: '✅ Tests',
  build: '📦 Build',
  ci: '🔧 CI/CD',
  style: '🎨 Style',
  chore: '🔩 Chores',
};

// Display order for sections
const TYPE_ORDER = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'build',
  'ci',
  'style',
  'chore',
];

function git(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function getLastTag() {
  try {
    return git('git describe --tags --abbrev=0');
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const tagIdx = args.indexOf('--tag');
  if (tagIdx !== -1 && args[tagIdx + 1]) {
    return args[tagIdx + 1];
  }
  return getLastTag();
}

function getCommits(fromTag) {
  const range = fromTag ? [`${fromTag}..HEAD`] : [];
  const format = '%H%x1f%s%x1f%b%x1e';

  let log;
  try {
    log = execFileSync(
      'git',
      ['--no-pager', 'log', ...range, `--format=${format}`],
      { encoding: 'utf-8' },
    ).trim();
  } catch {
    return [];
  }

  if (!log) return [];

  return log
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject, ...bodyParts] = entry.split('\x1f');
      const body = bodyParts.join('\x1f');
      return { hash: hash?.slice(0, 7), subject, body };
    })
    .filter((c) => c.hash && c.subject);
}

function parseConventionalCommit(subject) {
  // Match: type(scope)!: description  or  type!: description  or  type: description
  const match = subject.match(
    /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/,
  );
  if (!match) return null;

  const [, type, scope, breaking, description] = match;
  return {
    type: type.toLowerCase(),
    scope: scope || null,
    breaking: !!breaking,
    description,
  };
}

const fromTag = parseArgs();
const commits = getCommits(fromTag);

if (commits.length === 0) {
  console.log('No commits found since last tag.');
  process.exit(0);
}

// Group by type
const grouped = new Map();
const breakingChanges = [];

for (const commit of commits) {
  const parsed = parseConventionalCommit(commit.subject);
  if (!parsed) continue;

  if (parsed.breaking) {
    breakingChanges.push({ ...parsed, hash: commit.hash, body: commit.body });
  }

  if (!grouped.has(parsed.type)) {
    grouped.set(parsed.type, []);
  }
  grouped.get(parsed.type).push({ ...parsed, hash: commit.hash });
}

// Build markdown
const lines = [];

if (breakingChanges.length > 0) {
  lines.push('## ⚠️ Breaking Changes\n');
  for (const bc of breakingChanges) {
    const scope = bc.scope ? `**${bc.scope}:** ` : '';
    lines.push(`- ${scope}${bc.description} (${bc.hash})`);
    if (bc.body) {
      const breakingNote = bc.body
        .split('\n')
        .find((l) => l.startsWith('BREAKING CHANGE:'));
      if (breakingNote) {
        lines.push(`  ${breakingNote}`);
      }
    }
  }
  lines.push('');
}

for (const type of TYPE_ORDER) {
  const items = grouped.get(type);
  if (!items || items.length === 0) continue;

  const label = TYPE_LABELS[type] || type;
  lines.push(`## ${label}\n`);

  for (const item of items) {
    const scope = item.scope ? `**${item.scope}:** ` : '';
    lines.push(`- ${scope}${item.description} (${item.hash})`);
  }
  lines.push('');
}

const changelog = lines.join('\n');
console.log(changelog);
