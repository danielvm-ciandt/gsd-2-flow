#!/usr/bin/env node
'use strict'
/**
 * gsd-postinstall.cjs
 *
 * Self-contained postinstall hook for the release branch.
 * Lives at the package root so npm always finds it, regardless of how
 * it resolves sub-directory paths during a GitHub install.
 *
 * Does one thing: creates node_modules/@gsd/* and node_modules/@gsd-build/*
 * symlinks pointing to the shipped packages/ directories so that
 * dist/loader.js can resolve @gsd/* imports.
 *
 * Intentionally inlines the logic from:
 *   scripts/lib/workspace-manifest.cjs
 *   scripts/link-workspace-packages.cjs
 * to avoid any sub-directory resolution issues.
 */

const { existsSync, mkdirSync, symlinkSync, cpSync, lstatSync, readlinkSync, unlinkSync, readdirSync, readFileSync, statSync } = require('fs')
const { resolve, join } = require('path')

// #region agent log
try { require('http').request({hostname:'127.0.0.1',port:7747,path:'/ingest/93b5b814-87f1-410d-aca8-f5619ce3c0c6',method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fe5872'}}, r => r.resume()).end(JSON.stringify({sessionId:'fe5872',location:'gsd-postinstall.cjs:1',message:'gsd-postinstall.cjs started',data:{cwd:process.cwd(),dirname:__dirname},timestamp:Date.now(),hypothesisId:'H-A'})); } catch(e) {}
// #endregion

const REPO_ROOT = __dirname
const PACKAGES_DIR = join(REPO_ROOT, 'packages')

function getLinkablePackages() {
  if (!existsSync(PACKAGES_DIR)) return []
  const entries = readdirSync(PACKAGES_DIR)
  const out = []
  for (const dir of entries) {
    const pkgPath = join(PACKAGES_DIR, dir)
    if (!statSync(pkgPath).isDirectory()) continue
    const pkgJsonPath = join(pkgPath, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    let pkg
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    } catch { continue }
    const gsd = pkg.gsd
    if (!gsd || gsd.linkable !== true) continue
    if (!gsd.scope || !gsd.name) continue
    if (gsd.scope !== '@gsd' && gsd.scope !== '@gsd-build') continue
    out.push({
      scope: gsd.scope,
      name: gsd.name,
      path: pkgPath,
    })
  }
  out.sort((a, b) => `${a.scope}/${a.name}`.localeCompare(`${b.scope}/${b.name}`))
  return out
}

const scopeDirs = {
  '@gsd': join(REPO_ROOT, 'node_modules', '@gsd'),
  '@gsd-build': join(REPO_ROOT, 'node_modules', '@gsd-build'),
}

for (const scopeDir of Object.values(scopeDirs)) {
  if (!existsSync(scopeDir)) mkdirSync(scopeDir, { recursive: true })
}

let linked = 0
let copied = 0

for (const pkg of getLinkablePackages()) {
  const source = pkg.path
  const scopeDir = scopeDirs[pkg.scope]
  if (!scopeDir) continue
  const target = join(scopeDir, pkg.name)

  if (existsSync(target)) {
    try {
      const stat = lstatSync(target)
      if (stat.isSymbolicLink()) {
        const linkTarget = readlinkSync(target)
        if (resolve(join(scopeDir, linkTarget)) === source || linkTarget === source) continue
        unlinkSync(target)
      } else {
        continue
      }
    } catch { continue }
  }

  let symlinkOk = false
  try {
    symlinkSync(source, target, 'junction')
    symlinkOk = true
    linked++
  } catch {}

  if (!symlinkOk) {
    try {
      cpSync(source, target, { recursive: true })
      copied++
    } catch {}
  }
}

// #region agent log
try { require('http').request({hostname:'127.0.0.1',port:7747,path:'/ingest/93b5b814-87f1-410d-aca8-f5619ce3c0c6',method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fe5872'}}, r => r.resume()).end(JSON.stringify({sessionId:'fe5872',location:'gsd-postinstall.cjs:end',message:'workspace linking complete',data:{linked,copied,packages:getLinkablePackages().length},timestamp:Date.now(),hypothesisId:'H-A'})); } catch(e) {}
// #endregion

if (linked > 0) process.stderr.write(`  Linked ${linked} workspace package${linked !== 1 ? 's' : ''}\n`)
if (copied > 0) process.stderr.write(`  Copied ${copied} workspace package${copied !== 1 ? 's' : ''} (symlinks unavailable)\n`)
