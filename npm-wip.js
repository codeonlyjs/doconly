#!/usr/bin/env node

/**
 * npm-wip - quick "work in progress" editing of an already-installed npm module.
 *
 * Given an installed module name, this:
 *   1. Reads its package.json to find the git repo (and monorepo subdirectory, if any).
 *   2. Clones the repo into ./@wip/<name> (never touches package.json / package-lock.json).
 *   3. Replaces node_modules/<name> with a symlink into the clone.
 *   4. Links ./@wip/node_modules -> ./node_modules so the clone resolves its
 *      dependencies against the consuming project's node_modules (avoiding the
 *      classic `npm link` realpath problem).
 *
 * Running npm-wip again on a package that's already WIP-linked does NOT reclone -
 * it just re-links, so it's a safe recovery step if something (e.g. npm install)
 * has touched node_modules/<name>.
 *
 * Usage:
 *   npm-wip <module-name>            Set up WIP editing for an installed module
 *                                     (or relink it if already cloned - no reclone)
 *   npm-wip <module-name> --undo     Remove the WIP clone/link and reinstall via npm
 *   npm-wip --relink                 Relink every clone currently under ./@wip
 *                                     (recovery after npm install has meddled with links)
 *   npm-wip <module-name> --relink   Relink just this one package from its existing clone
 *
 * Examples:
 *   npm-wip @toptensoftware/sqlite
 *   npm-wip @toptensoftware/sqlite --undo
 *   npm-wip --relink
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

function die(msg) {
  console.error(`npm-wip: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`npm-wip: ${msg}`);
}

// Create a cross-platform directory symlink (junction on Windows, symlink elsewhere).
function symlinkDir(target, linkPath) {
  const type = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(path.resolve(target), path.resolve(linkPath), type);
}

// Remove a directory symlink/junction without following it into the target.
function removeDirLink(linkPath) {
  try {
    fs.unlinkSync(linkPath);
  } catch (err) {
    // Windows sometimes requires rmdir for junctions/dir-symlinks.
    if (err.code === "EPERM" || err.code === "EISDIR") {
      fs.rmdirSync(linkPath);
    } else {
      throw err;
    }
  }
}

// Normalize the "repository" field of package.json into { url, directory }.
function normalizeRepository(repository) {
  if (!repository) return null;

  let url = typeof repository === "string" ? repository : repository.url;
  const directory = typeof repository === "object" ? repository.directory : undefined;
  if (!url) return null;

  url = url.replace(/^git\+/, "");

  const shorthand = {
    github: "github.com",
    gitlab: "gitlab.com",
    bitbucket: "bitbucket.org",
  };
  for (const [prefix, host] of Object.entries(shorthand)) {
    const re = new RegExp(`^${prefix}:(.+)$`);
    const m = url.match(re);
    if (m) {
      url = `https://${host}/${m[1]}.git`;
      return { url, directory };
    }
  }

  // Bare "user/repo" shorthand (npm assumes GitHub).
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    url = `https://github.com/${url}.git`;
  }

  return { url, directory };
}

function modulePathFor(name) {
  return path.join("node_modules", ...name.split("/"));
}

// Read this package's entry from package-lock.json, if present.
function readLockEntry(name) {
  const lockPath = "package-lock.json";
  if (!fs.existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    return (lock.packages && lock.packages[`node_modules/${name}`]) || null;
  } catch {
    return null;
  }
}

// Figure out how to restore the real package: prefer exactly where the
// lockfile says it came from (a workspace link, a git url, a tarball url)
// over guessing "name@version" against the public registry - the package
// may never have been published there at all (git dependency, private
// registry, npm/pnpm/yarn workspace, etc).
function resolveRestoreInfo(name) {
  const entry = readLockEntry(name);
  if (entry) {
    if (entry.link && entry.resolved) {
      // npm workspaces: resolved is a path (relative to project root) to the
      // real workspace package - nothing to fetch, just relink directly.
      return { type: "link", target: entry.resolved };
    }
    if (entry.resolved && /^(git\+|git:)/.test(entry.resolved)) {
      // Git dependency. Deliberately NOT using `npm pack <git-url>` here -
      // several npm versions hit "GitFetcher requires an Arborist
      // constructor to pack a tarball", a known npm bug. Clone + checkout
      // ourselves instead.
      return { type: "git", url: entry.resolved };
    }
    if (entry.resolved && /^https?:/.test(entry.resolved)) {
      // Direct tarball url.
      return { type: "pack", spec: entry.resolved };
    }
    if (entry.version) {
      return { type: "pack", spec: `${name}@${entry.version}` };
    }
  }

  const pkgPath = "package.json";
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      if (pkg[field] && pkg[field][name]) {
        return { type: "pack", spec: `${name}@${pkg[field][name]}` };
      }
    }
  }

  return { type: "pack", spec: name };
}

// Split a git dependency spec like "git+ssh://git@host/repo.git#sha" into
// a plain clone url and an optional ref (commit/branch/tag) to check out.
function parseGitSpec(url) {
  let cloneUrl = url.replace(/^git\+/, "");
  let ref;
  const hashIdx = cloneUrl.indexOf("#");
  if (hashIdx !== -1) {
    ref = cloneUrl.slice(hashIdx + 1);
    cloneUrl = cloneUrl.slice(0, hashIdx);
  }
  return { cloneUrl, ref };
}

// Restore a git-dependency package the way npm itself would: clone it,
// check out the exact recorded ref, run `npm install` in the clone (so any
// "prepare"/build step produces its dist files, same as npm does for git
// deps), then copy the result (minus .git and its own node_modules) into
// place. Avoids `npm pack <git-url>`, which is broken in several npm versions.
function restoreFromGit(url, modulePath) {
  const { cloneUrl, ref } = parseGitSpec(url);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-wip-git-"));
  try {
    log(`cloning ${cloneUrl}...`);
    execSync(`git clone --quiet ${JSON.stringify(cloneUrl)} ${JSON.stringify(tmpDir)}`, { stdio: "inherit" });
    if (ref) {
      execSync(`git -C ${JSON.stringify(tmpDir)} checkout --quiet ${JSON.stringify(ref)}`, { stdio: "inherit" });
    }
    const hadLockfile = fs.existsSync(path.join(tmpDir, "package-lock.json"));
    try {
      log("running npm install in the clone");
      execSync("npm install", { cwd: tmpDir, stdio: "inherit" });
    } catch (err) {
      console.error(`npm-wip: warning - build step failed; restored package may be missing built files (${err.message})`);
    }
    fs.rmSync(path.join(tmpDir, ".git"), { recursive: true, force: true });
    fs.rmSync(path.join(tmpDir, "node_modules"), { recursive: true, force: true });
    if (!hadLockfile) {
      // npm install would have generated one fresh - not part of the original package.
      fs.rmSync(path.join(tmpDir, "package-lock.json"), { force: true });
    }
    fs.mkdirSync(modulePath, { recursive: true });
    fs.cpSync(tmpDir, modulePath, { recursive: true });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function wipPathFor(name) {
  return path.join("@wip", ...name.split("/"));
}

// A small registry recording, per WIP-linked package, which subdirectory of
// its clone is the actual npm package (for monorepos). We need this because
// once a package is WIP-linked, its original installed package.json (which
// had the "repository.directory" field) no longer exists to consult.
const metaPath = path.join("@wip", ".npm-wip.json");

function loadMeta() {
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  fs.mkdirSync("@wip", { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

function setMetaEntry(name, info) {
  const meta = loadMeta();
  meta[name] = info;
  saveMeta(meta);
}

function deleteMetaEntry(name) {
  const meta = loadMeta();
  delete meta[name];
  saveMeta(meta);
}

// Search a clone for a subdirectory whose package.json "name" matches, up to
// a few levels deep, skipping node_modules/.git. Used as a fallback when
// there's no metadata (e.g. clone predates --relink, or meta file was lost).
function findPackageDir(root, name, depth = 4) {
  if (depth < 0 || !fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
    const dir = path.join(root, entry.name);
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.name === name) return dir;
      } catch {
        // ignore unreadable package.json and keep searching
      }
    }
    const nested = findPackageDir(dir, name, depth - 1);
    if (nested) return nested;
  }
  return null;
}

// Figure out which directory inside a clone should be symlinked as the
// package: recorded metadata first, then the clone root itself if its
// package.json matches, then a search through subdirectories.
function resolveLinkTarget(name, wipPath) {
  const meta = loadMeta()[name];
  if (meta && meta.directory) {
    const target = path.join(wipPath, meta.directory);
    if (fs.existsSync(target)) return target;
  }
  if (meta && !meta.directory) {
    return wipPath;
  }

  const rootPkgPath = path.join(wipPath, "package.json");
  if (fs.existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      if (pkg.name === name) return wipPath;
    } catch {
      // fall through to search
    }
  }

  return findPackageDir(wipPath, name) || wipPath;
}

// Remove whatever currently occupies modulePath (real directory, valid
// symlink, or broken/dangling symlink left behind by npm install antics).
function clearModulePath(modulePath) {
  let lst;
  try {
    lst = fs.lstatSync(modulePath);
  } catch {
    return; // nothing there
  }
  if (lst.isSymbolicLink()) {
    removeDirLink(modulePath);
  } else {
    fs.rmSync(modulePath, { recursive: true, force: true });
  }
}

// (Re)create the node_modules/<name> symlink pointing at the existing clone
// under @wip. Does not clone or touch package.json - safe to call repeatedly.
function relinkOne(name) {
  const modulePath = modulePathFor(name);
  const wipPath = wipPathFor(name);

  if (!fs.existsSync(wipPath)) {
    die(`no clone found at ${wipPath} - nothing to relink. Run 'npm-wip ${name}' to set it up.`);
  }

  ensureWipNodeModulesLink();
  const linkTarget = resolveLinkTarget(name, wipPath);

  clearModulePath(modulePath);
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  symlinkDir(linkTarget, modulePath);

  log(`relinked ${modulePath} -> ${linkTarget}`);
}

// Find every package currently cloned under @wip, mirroring the same
// scope/name directory structure used by wipPathFor().
function discoverWipNames() {
  const names = [];
  if (!fs.existsSync("@wip")) return names;
  for (const entry of fs.readdirSync("@wip", { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join("@wip", entry.name);
      for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (sub.isDirectory()) names.push(`${entry.name}/${sub.name}`);
      }
    } else {
      names.push(entry.name);
    }
  }
  return names;
}

function relinkAll() {
  const names = discoverWipNames();
  if (names.length === 0) {
    log("no clones found under @wip - nothing to relink.");
    return;
  }
  let failures = 0;
  for (const name of names) {
    try {
      relinkOne(name);
    } catch (err) {
      failures++;
      console.error(`npm-wip: failed to relink ${name}: ${err.message}`);
    }
  }
  log(`relinked ${names.length - failures}/${names.length} package(s).`);
}

// Remove empty parent directories under @wip, stopping at @wip itself.
function pruneEmptyWipDirs(name) {
  let dir = path.dirname(wipPathFor(name));
  while (dir !== "@wip" && dir.startsWith("@wip")) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    } else {
      break;
    }
  }
}

function ensureWipNodeModulesLink() {
  const wipNodeModules = path.join("@wip", "node_modules");
  if (!fs.existsSync("@wip")) {
    fs.mkdirSync("@wip", { recursive: true });
  }
  if (!fs.existsSync(wipNodeModules)) {
    symlinkDir("node_modules", wipNodeModules);
    log("linked @wip/node_modules -> node_modules");
  }
}

function setup(name) {
  const modulePath = modulePathFor(name);
  const wipPath = wipPathFor(name);

  if (fs.existsSync(wipPath)) {
    // Already cloned (from an earlier run, possibly with the link broken by
    // npm install since then). Don't reclone - just make sure it's linked.
    log(`clone already exists at ${wipPath}; relinking (not recloning).`);
    relinkOne(name);
    return;
  }

  if (!fs.existsSync(modulePath)) {
    die(`module not found at ${modulePath} - is it installed? (npm install ${name})`);
  }
  if (fs.lstatSync(modulePath).isSymbolicLink()) {
    die(`${modulePath} is a WIP link but its clone (${wipPath}) is missing. Run 'npm-wip ${name} --undo' to clean up, then retry.`);
  }

  const pkgJsonPath = path.join(modulePath, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    die(`no package.json found in ${modulePath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

  const repo = normalizeRepository(pkg.repository);
  if (!repo || !repo.url) {
    die(`no usable "repository" field in ${pkgJsonPath}`);
  }

  fs.mkdirSync(path.dirname(wipPath), { recursive: true });

  log(`cloning ${repo.url} -> ${wipPath}`);
  execSync(`git clone ${repo.url} ${JSON.stringify(wipPath)}`, { stdio: "inherit" });

  const linkTarget = repo.directory ? path.join(wipPath, repo.directory) : wipPath;
  if (!fs.existsSync(linkTarget)) {
    die(`repository.directory "${repo.directory}" not found in cloned repo`);
  }
  setMetaEntry(name, { directory: repo.directory || null });

  relinkOne(name);

  log(`done. Edit files under ${linkTarget} directly.`);
  if (repo.directory) {
    log(`(monorepo: full repo is at ${wipPath}, package subdirectory is ${repo.directory})`);
  }
  if (!fs.existsSync(path.join(linkTarget, "node_modules")) && fs.existsSync(path.join(linkTarget, "package.json"))) {
    log(`note: ${linkTarget} has no node_modules of its own - if it needs dev-only deps, cd in and 'npm install'.`);
  }
}

function undo(name) {
  const modulePath = modulePathFor(name);
  const wipPath = wipPathFor(name);

  const hasLink = fs.existsSync(modulePath) && fs.lstatSync(modulePath).isSymbolicLink();
  if (!hasLink && !fs.existsSync(wipPath)) {
    die(`${name} is not currently WIP-linked.`);
  }

  if (hasLink) {
    removeDirLink(modulePath);
    log(`removed link ${modulePath}`);
  } else if (fs.existsSync(modulePath)) {
    // npm install (or similar) already replaced the link with a real copy -
    // nothing to unlink, just clean up the clone below.
    log(`${modulePath} is no longer a WIP link (already reinstalled) - cleaning up the clone.`);
  }

  if (fs.existsSync(wipPath)) {
    fs.rmSync(wipPath, { recursive: true, force: true });
    log(`removed clone ${wipPath}`);
  }
  deleteMetaEntry(name);
  pruneEmptyWipDirs(name);

  if (hasLink) {
    const info = resolveRestoreInfo(name);

    if (info.type === "link") {
      // npm workspace package - the lockfile points straight at the real
      // package directory, so just relink to it directly. Nothing to fetch,
      // and other WIP-linked packages are untouched either way.
      const target = path.resolve(info.target);
      if (!fs.existsSync(target)) {
        die(`workspace target ${target} (from package-lock.json) does not exist`);
      }
      fs.mkdirSync(path.dirname(modulePath), { recursive: true });
      symlinkDir(target, modulePath);
      log(`restored workspace link ${modulePath} -> ${target}`);
    } else if (info.type === "git") {
      log(`restoring ${info.url} (won't touch other packages)...`);
      restoreFromGit(info.url, modulePath);
      log(`restored ${modulePath} from ${info.url}`);
    } else {
      // Deliberately NOT using `npm install` here: even a scoped `npm install <name>`
      // still runs npm's full tree reconciliation (arborist), which re-examines every
      // installed package against the lockfile/registry - including any *other*
      // WIP-linked package - and "fixes" those too. Pulling the tarball directly and
      // extracting it only into this package's folder avoids touching anything else.
      log(`restoring ${info.spec} (won't touch other packages)...`);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-wip-"));
      try {
        execSync(`npm pack ${JSON.stringify(info.spec)} --pack-destination ${JSON.stringify(tmpDir)}`, {
          stdio: "inherit",
        });
        const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith(".tgz"));
        if (!tarball) {
          die(`npm pack did not produce a tarball for ${info.spec}`);
        }
        const tarballPath = path.join(tmpDir, tarball);

        fs.mkdirSync(modulePath, { recursive: true });
        execSync(`tar -xzf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(modulePath)} --strip-components=1`, {
          stdio: "inherit",
        });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      log(`restored ${modulePath} from ${info.spec}`);
    }
  }
  log("done.");
}

function main() {
  const args = process.argv.slice(2);
  const isUndo = args.includes("--undo");
  const isRelink = args.includes("--relink");
  const name = args.find((a) => !a.startsWith("--"));

  if (isRelink) {
    if (name) {
      relinkOne(name);
    } else {
      relinkAll();
    }
    return;
  }

  if (!name) {
    console.log("Usage: npm-wip <module-name> [--undo]");
    console.log("       npm-wip [<module-name>] --relink");
    process.exit(1);
  }

  if (isUndo) {
    undo(name);
  } else {
    setup(name);
  }
}

try {
  main();
} catch (err) {
  die(err.message);
}
