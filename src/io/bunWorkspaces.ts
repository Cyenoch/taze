import type { BunWorkspaceMeta, CommonOptions, RawDep } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import detectIndent from 'detect-indent'
import { resolve } from 'pathe'
import { dumpDependencies, parseDependency } from './dependencies'

function isValidCatalogObject(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  )
}

interface CatalogSource {
  catalog?: unknown
  catalogs?: unknown
}

function extractCatalogs(
  source: CatalogSource,
  location: 'top-level' | 'workspaces',
  existingNames: Set<string>,
  createEntry: (name: string, map: Record<string, string>, loc: 'top-level' | 'workspaces') => BunWorkspaceMeta,
): BunWorkspaceMeta[] {
  const result: BunWorkspaceMeta[] = []

  if (isValidCatalogObject(source.catalog) && !existingNames.has('bun-catalog:default')) {
    result.push(createEntry('bun-catalog:default', source.catalog, location))
    existingNames.add('bun-catalog:default')
  }

  if (isValidCatalogObject(source.catalogs)) {
    for (const [key, catalog] of Object.entries(source.catalogs)) {
      const name = `bun-catalog:${key}`
      if (!existingNames.has(name) && isValidCatalogObject(catalog)) {
        result.push(createEntry(name, catalog, location))
        existingNames.add(name)
      }
    }
  }

  return result
}

export async function loadBunWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
  existingRaw?: Record<string, unknown>,
): Promise<BunWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw = existingRaw ?? JSON.parse(await readFile(filepath, 'utf-8'))

  const catalogs: BunWorkspaceMeta[] = []

  function createBunWorkspaceEntry(
    name: string,
    map: Record<string, string>,
    catalogLocation: 'top-level' | 'workspaces',
  ): BunWorkspaceMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([pkg, version]) => parseDependency(pkg, version, 'bun-workspace', shouldUpdate))

    return {
      name,
      private: true,
      version: '',
      type: 'bun-workspace',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
      catalogLocation,
    } satisfies BunWorkspaceMeta
  }

  const existingNames = new Set<string>()

  // Extract top-level catalog/catalogs
  catalogs.push(...extractCatalogs(raw as CatalogSource, 'top-level', existingNames, createBunWorkspaceEntry))

  // Extract workspaces catalog/catalogs (skip duplicates from top-level)
  if (isValidCatalogObject(raw?.workspaces)) {
    catalogs.push(...extractCatalogs(raw.workspaces as CatalogSource, 'workspaces', existingNames, createBunWorkspaceEntry))
  }

  return catalogs
}

function setCatalogVersion(
  raw: Record<string, unknown>,
  location: 'top-level' | 'workspaces',
  catalogName: string,
  versions: Record<string, string>,
) {
  const target = location === 'top-level'
    ? raw
    : (raw.workspaces ??= {}) as Record<string, unknown>

  if (catalogName === 'default') {
    target.catalog = { ...(target.catalog as Record<string, string> || {}), ...versions }
  }
  else {
    const catalogs = (target.catalogs ??= {}) as Record<string, Record<string, string>>
    catalogs[catalogName] = { ...(catalogs[catalogName] || {}), ...versions }
  }
}

export async function writeBunWorkspace(
  pkg: BunWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'bun-workspace')

  if (!Object.keys(versions).length)
    return

  if (pkg.name.startsWith('bun-catalog:')) {
    const catalogName = pkg.name.replace('bun-catalog:', '')
    setCatalogVersion(pkg.raw, pkg.catalogLocation, catalogName, versions)
    await writeJSON(pkg, pkg.raw)
  }
}

async function writeJSON(pkg: BunWorkspaceMeta, data: Record<string, unknown>) {
  const actualContent = await readFile(pkg.filepath, 'utf-8')
  const fileIndent = detectIndent(actualContent).indent || '  '
  const content = JSON.stringify(data, null, fileIndent)
  return writeFile(pkg.filepath, `${content}\n`, 'utf-8')
}
