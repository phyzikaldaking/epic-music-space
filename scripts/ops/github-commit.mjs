// Stage, commit, and optionally push changes to GitHub.
//
// Usage:
//   node scripts/ops/github-commit.mjs --message <msg> [options] [-- <paths...>]
//
// Options:
//   --message <msg>   Commit message (required)
//   --push            Push the commit to the remote branch after committing
//   --branch <name>   Branch to push to (default: current branch)
//   --all             Stage all tracked and untracked changes (git add -A)
//                     This is the default when no paths are supplied.
//   -- <paths...>     Specific paths to stage (passed after a bare --)
//
// The script exits non-zero if there is nothing to commit.

import process from "node:process";
import { fail, info, runCommand } from "./lib.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextValue(argv, i, flag) {
  const val = argv[i + 1];
  if (val === undefined || val === "" || val.startsWith("--")) {
    fail(`${flag} requires a non-empty value.`);
  }
  return val;
}

function parseArgs(argv) {
  const args = { message: null, push: false, branch: null, all: false, paths: [] };
  let i = 0;
  let pastSeparator = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (pastSeparator) {
      args.paths.push(arg);
    } else if (arg === "--") {
      pastSeparator = true;
    } else if (arg === "--message" || arg === "-m") {
      args.message = nextValue(argv, i, "--message");
      i++;
    } else if (arg === "--push") {
      args.push = true;
    } else if (arg === "--all") {
      args.all = true;
    } else if (arg === "--branch") {
      args.branch = nextValue(argv, i, "--branch");
      i++;
    } else {
      fail(`Unknown argument: ${arg}\nRun with --help to see usage.`);
    }
    i++;
  }

  return args;
}

function currentBranch() {
  const result = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!result.ok) return null;
  return result.stdout.trim() || null;
}

function hasRemote(branch) {
  const result = runCommand("git", ["ls-remote", "--exit-code", "--heads", "origin", branch]);
  return result.ok;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage: node scripts/ops/github-commit.mjs --message <msg> [options] [-- <paths...>]

Options:
  -m, --message <msg>  Commit message (required)
  --push               Push the commit after committing
  --branch <name>      Branch to push to (default: current branch)
  --all                Stage all changes with git add -A (default when no paths given)
  -- <paths...>        Specific paths to stage

`);
  process.exit(0);
}

const args = parseArgs(argv);

if (!args.message) {
  fail("--message <msg> is required.");
}

// Stage files
if (args.paths.length > 0) {
  info(`Staging ${args.paths.length} path(s)...`);
  const addResult = runCommand("git", ["add", "--", ...args.paths]);
  if (!addResult.ok) {
    fail(`git add failed: ${addResult.stderr.trim() || addResult.stdout.trim()}`);
  }
} else {
  // Default: stage everything (git add -A).
  info("Staging all changes (git add -A)...");
  const addResult = runCommand("git", ["add", "-A"]);
  if (!addResult.ok) {
    fail(`git add -A failed: ${addResult.stderr.trim() || addResult.stdout.trim()}`);
  }
}

// Check if there is anything to commit.
const statusResult = runCommand("git", ["diff", "--cached", "--quiet"]);
if (statusResult.ok) {
  info("Nothing to commit — working tree is clean after staging.");
  process.exit(0);
}

// Commit.
info(`Committing with message: "${args.message}"`);
const commitResult = runCommand("git", ["commit", "-m", args.message]);
if (!commitResult.ok) {
  fail(`git commit failed: ${commitResult.stderr.trim() || commitResult.stdout.trim()}`);
}
info("PASS Committed.");
if (commitResult.stdout.trim()) {
  info(commitResult.stdout.trim());
}

// Push.
if (args.push) {
  const branch = args.branch ?? currentBranch();
  if (!branch) fail("Could not determine the current branch. Pass --branch <name>.");

  const pushArgs = ["push", "origin", branch];

  // If the remote tracking branch does not exist yet, set upstream.
  if (!hasRemote(branch)) {
    pushArgs.push("--set-upstream");
  }

  info(`Pushing branch "${branch}" to origin...`);
  const pushResult = runCommand("git", pushArgs);
  if (!pushResult.ok) {
    fail(`git push failed: ${pushResult.stderr.trim() || pushResult.stdout.trim()}`);
  }
  info(`PASS Pushed "${branch}" to origin.`);
  if (pushResult.stdout.trim()) {
    info(pushResult.stdout.trim());
  }
}
