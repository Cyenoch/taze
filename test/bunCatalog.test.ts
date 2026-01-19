import type { BunWorkspaceMeta, CheckOptions } from '../src/types'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vitest'
import { CheckPackages } from '../src'
import * as bunWorkspaces from '../src/io/bunWorkspaces'

// output that should be written to the package.json file
let output: string | undefined
vi.mock('node:fs/promises', async (importActual) => {
  return {
    ...await importActual(),
    readFile(path: string, _encoding?: string) {
      // For test files that don't exist (like /tmp/package.json), return default content
      if (path === '/tmp/package.json') {
        return Promise.resolve('{\n  "name": "test"\n}')
      }
      // For real fixture files, use the actual implementation
      return (importActual() as any).then((mod: any) => mod.readFile(path, _encoding))
    },
    writeFile(_path: string, data: string) {
      output = data.toString()
      return Promise.resolve()
    },
  }
})

vitest.mock('@antfu/ni', () => ({
  detect: vitest.fn().mockResolvedValue({ agent: 'npm', version: '1.0.0' }),
}))

vitest.mock('package-manager-detector', () => ({
  detect: vitest.fn().mockResolvedValue({ agent: 'npm', version: '1.0.0' }),
}))

vitest.mock('../src/utils/npm.ts', () => ({
  parseNpmConfig: vitest.fn().mockResolvedValue({}),
}))

vitest.mock('../src/io/resolves.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual as any,
    resolveDependency: vitest.fn().mockResolvedValue({
      name: 'react',
      currentVersion: '^18.2.0',
      source: 'bun-workspace',
      targetVersion: '^18.2.0',
      diff: null,
      resolveError: null,
      update: false,
      pkgData: {},
    }),
  }
})

beforeEach(() => {
  output = undefined
})

afterEach(() => {
  vitest.restoreAllMocks()
})

describe('bun catalog integration', () => {
  it('should detect and process bun workspaces catalogs when bun.lockb exists', async () => {
    const options: CheckOptions = {
      cwd: `${process.cwd()}/test/fixtures/bun-catalog`,
    }
    const result = await CheckPackages(options, {})

    expect(result.packages.map(p => p.name)).toMatchInlineSnapshot(`
      [
        "bun-catalog:default",
        "bun-catalog:react17",
        "bun-catalog:react18",
        "@taze/bun-monorepo-example",
      ]
    `)

    // Verify catalogLocation is set correctly for workspaces catalogs
    const bunWorkspacePkgs = result.packages.filter(p => p.type === 'bun-workspace') as BunWorkspaceMeta[]
    expect(bunWorkspacePkgs.every(p => p.catalogLocation === 'workspaces')).toBe(true)

    expect(
      result.packages.flatMap(p => ({
        name: p.name,
        packages: p.resolved.map(r => [r.name, r.targetVersion]),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "bun-catalog:default",
          "packages": [
            [
              "react",
              "^18.2.0",
            ],
            [
              "react-dom",
              "^18.2.0",
            ],
          ],
        },
        {
          "name": "bun-catalog:react17",
          "packages": [
            [
              "react",
              "^17.0.2",
            ],
            [
              "react-dom",
              "^17.0.2",
            ],
          ],
        },
        {
          "name": "bun-catalog:react18",
          "packages": [
            [
              "react",
              "^18.2.0",
            ],
            [
              "react-dom",
              "^18.2.0",
            ],
          ],
        },
        {
          "name": "@taze/bun-monorepo-example",
          "packages": [
            [
              "express",
              "4.12.x",
            ],
            [
              "lodash",
              "^4.13.19",
            ],
            [
              "multer",
              "^0.1.8",
            ],
            [
              "react-bootstrap",
              "^0.22.6",
            ],
            [
              "webpack",
              "~1.9.10",
            ],
            [
              "@types/lodash",
              "^4.14.0",
            ],
            [
              "typescript",
              "3.5",
            ],
          ],
        },
      ]
    `)
  })

  it('should detect and process top-level bun catalogs when bun.lockb exists', async () => {
    const options: CheckOptions = {
      cwd: `${process.cwd()}/test/fixtures/bun-catalog-top-level`,
    }
    const result = await CheckPackages(options, {})

    expect(result.packages.map(p => p.name)).toMatchInlineSnapshot(`
      [
        "bun-catalog:default",
        "bun-catalog:react17",
        "bun-catalog:react18",
        "@taze/bun-top-level-catalog-example",
      ]
    `)

    // Verify catalogLocation is set correctly
    const bunWorkspacePkgs = result.packages.filter(p => p.type === 'bun-workspace') as BunWorkspaceMeta[]
    expect(bunWorkspacePkgs.every(p => p.catalogLocation === 'top-level')).toBe(true)

    expect(
      result.packages.flatMap(p => ({
        name: p.name,
        packages: p.resolved.map(r => [r.name, r.targetVersion]),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "bun-catalog:default",
          "packages": [
            [
              "react",
              "^18.2.0",
            ],
            [
              "react-dom",
              "^18.2.0",
            ],
          ],
        },
        {
          "name": "bun-catalog:react17",
          "packages": [
            [
              "react",
              "^17.0.2",
            ],
            [
              "react-dom",
              "^17.0.2",
            ],
          ],
        },
        {
          "name": "bun-catalog:react18",
          "packages": [
            [
              "react",
              "^18.2.0",
            ],
            [
              "react-dom",
              "^18.2.0",
            ],
          ],
        },
        {
          "name": "@taze/bun-top-level-catalog-example",
          "packages": [
            [
              "express",
              "4.12.x",
            ],
            [
              "lodash",
              "^4.13.19",
            ],
            [
              "@types/lodash",
              "^4.14.0",
            ],
            [
              "typescript",
              "3.5",
            ],
          ],
        },
      ]
    `)
  })

  it('should load both top-level and workspaces catalogs with top-level priority', async () => {
    const options: CheckOptions = {
      cwd: `${process.cwd()}/test/fixtures/bun-catalog-mixed`,
    }
    const result = await CheckPackages(options, {})

    // Should have top-level default catalog (not workspaces default)
    // Should have top-level react17 (not workspaces react17)
    // Should have workspaces testing catalog (unique to workspaces)
    expect(result.packages.map(p => p.name)).toMatchInlineSnapshot(`
      [
        "bun-catalog:default",
        "bun-catalog:react17",
        "bun-catalog:testing",
        "@taze/bun-mixed-catalog-example",
      ]
    `)

    // Verify catalogLocation is set correctly
    const bunWorkspacePkgs = result.packages.filter(p => p.type === 'bun-workspace') as BunWorkspaceMeta[]

    // Default and react17 should be from top-level
    const defaultCatalog = bunWorkspacePkgs.find(p => p.name === 'bun-catalog:default')
    expect(defaultCatalog?.catalogLocation).toBe('top-level')

    const react17Catalog = bunWorkspacePkgs.find(p => p.name === 'bun-catalog:react17')
    expect(react17Catalog?.catalogLocation).toBe('top-level')

    // Testing should be from workspaces (unique to workspaces)
    const testingCatalog = bunWorkspacePkgs.find(p => p.name === 'bun-catalog:testing')
    expect(testingCatalog?.catalogLocation).toBe('workspaces')

    // Verify top-level default catalog has react/react-dom (not lodash/express from workspaces)
    expect(defaultCatalog?.deps.map(d => d.name)).toEqual(['react', 'react-dom'])

    // Verify top-level react17 catalog has the correct version (^17.0.2, not ^17.0.1)
    expect(react17Catalog?.deps.find(d => d.name === 'react')?.currentVersion).toBe('^17.0.2')
  })

  it('should filter out array-type catalogs', async () => {
    // This tests that invalid catalog structures (arrays instead of objects) are ignored
    const options: CheckOptions = {
      cwd: `${process.cwd()}/test/fixtures/bun-catalog`,
    }
    const result = await CheckPackages(options, {})

    // All catalogs should be valid objects, not arrays
    const bunWorkspacePkgs = result.packages.filter(p => p.type === 'bun-workspace') as BunWorkspaceMeta[]
    expect(bunWorkspacePkgs.length).toBeGreaterThan(0)
    bunWorkspacePkgs.forEach((pkg) => {
      expect(pkg.deps).toBeDefined()
      expect(Array.isArray(pkg.deps)).toBe(true)
    })
  })
})

describe('bun catalog write functionality', () => {
  it('should update default catalog in package.json', async () => {
    const packageJsonRaw = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
        catalogs: {
          react17: {
            'react': '^17.0.2',
            'react-dom': '^17.0.2',
          },
        },
      },
    }

    const pkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [
        // testing purpose - simulate updated versions
        { name: 'react', targetVersion: '^18.3.1', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
        { name: 'react-dom', targetVersion: '^18.3.1', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
      ],
      raw: packageJsonRaw,
      filepath: '/tmp/package.json',
      type: 'bun-workspace',
      private: false,
      version: '',
      relative: '',
      deps: [],
      catalogLocation: 'workspaces',
    }

    await bunWorkspaces.writeBunWorkspace(pkg, {})

    expect(output).toContain('"react": "^18.3.1"')
    expect(output).toContain('"react-dom": "^18.3.1"')

    // Verify the JSON structure is maintained
    const writtenJson = JSON.parse(output!)
    expect(writtenJson.workspaces.catalog.react).toBe('^18.3.1')
    expect(writtenJson.workspaces.catalog['react-dom']).toBe('^18.3.1')

    // Ensure other catalogs are preserved
    expect(writtenJson.workspaces.catalogs.react17.react).toBe('^17.0.2')
  })

  it('should update named catalog in package.json', async () => {
    const packageJsonRaw = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
        catalogs: {
          react17: {
            'react': '^17.0.2',
            'react-dom': '^17.0.2',
          },
          react18: {
            'react': '^18.2.0',
            'react-dom': '^18.2.0',
          },
        },
      },
    }

    const pkg: BunWorkspaceMeta = {
      name: 'bun-catalog:react17',
      resolved: [
        // testing purpose - simulate updated versions
        { name: 'react', targetVersion: '^17.0.3', source: 'bun-workspace', update: true, currentVersion: '^17.0.2', diff: 'patch' } as any,
        { name: 'react-dom', targetVersion: '^17.0.3', source: 'bun-workspace', update: true, currentVersion: '^17.0.2', diff: 'patch' } as any,
      ],
      raw: packageJsonRaw,
      filepath: '/tmp/package.json',
      type: 'bun-workspace',
      private: false,
      version: '',
      relative: '',
      deps: [],
      catalogLocation: 'workspaces',
    }

    await bunWorkspaces.writeBunWorkspace(pkg, {})

    // Verify the JSON structure is updated correctly
    const writtenJson = JSON.parse(output!)
    expect(writtenJson.workspaces.catalogs.react17.react).toBe('^17.0.3')
    expect(writtenJson.workspaces.catalogs.react17['react-dom']).toBe('^17.0.3')

    // Ensure default catalog and other catalogs are preserved
    expect(writtenJson.workspaces.catalog.react).toBe('^18.2.0')
    expect(writtenJson.workspaces.catalogs.react18.react).toBe('^18.2.0')
  })

  it('should handle empty updates gracefully', async () => {
    const packageJsonRaw = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: {
          react: '^18.2.0',
        },
      },
    }

    const pkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [], // No updates
      raw: packageJsonRaw,
      filepath: '/tmp/package.json',
      type: 'bun-workspace',
      private: false,
      version: '',
      relative: '',
      deps: [],
      catalogLocation: 'workspaces',
    }

    await bunWorkspaces.writeBunWorkspace(pkg, {})

    // Should not write anything when there are no updates
    expect(output).toBeUndefined()
  })

  it('should update top-level default catalog in package.json', async () => {
    const packageJsonRaw = {
      name: '@test/bun-workspace',
      catalog: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
      },
      catalogs: {
        react17: {
          'react': '^17.0.2',
          'react-dom': '^17.0.2',
        },
      },
    }

    const pkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [
        { name: 'react', targetVersion: '^18.3.1', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
        { name: 'react-dom', targetVersion: '^18.3.1', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
      ],
      raw: packageJsonRaw,
      filepath: '/tmp/package.json',
      type: 'bun-workspace',
      private: false,
      version: '',
      relative: '',
      deps: [],
      catalogLocation: 'top-level',
    }

    await bunWorkspaces.writeBunWorkspace(pkg, {})

    expect(output).toContain('"react": "^18.3.1"')
    expect(output).toContain('"react-dom": "^18.3.1"')

    // Verify the JSON structure is maintained
    const writtenJson = JSON.parse(output!)
    expect(writtenJson.catalog.react).toBe('^18.3.1')
    expect(writtenJson.catalog['react-dom']).toBe('^18.3.1')

    // Ensure other catalogs are preserved
    expect(writtenJson.catalogs.react17.react).toBe('^17.0.2')

    // Ensure no workspaces object is created
    expect(writtenJson.workspaces).toBeUndefined()
  })

  it('should update top-level named catalog in package.json', async () => {
    const packageJsonRaw = {
      name: '@test/bun-workspace',
      catalog: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
      },
      catalogs: {
        react17: {
          'react': '^17.0.2',
          'react-dom': '^17.0.2',
        },
        react18: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
      },
    }

    const pkg: BunWorkspaceMeta = {
      name: 'bun-catalog:react17',
      resolved: [
        { name: 'react', targetVersion: '^17.0.3', source: 'bun-workspace', update: true, currentVersion: '^17.0.2', diff: 'patch' } as any,
        { name: 'react-dom', targetVersion: '^17.0.3', source: 'bun-workspace', update: true, currentVersion: '^17.0.2', diff: 'patch' } as any,
      ],
      raw: packageJsonRaw,
      filepath: '/tmp/package.json',
      type: 'bun-workspace',
      private: false,
      version: '',
      relative: '',
      deps: [],
      catalogLocation: 'top-level',
    }

    await bunWorkspaces.writeBunWorkspace(pkg, {})

    // Verify the JSON structure is updated correctly
    const writtenJson = JSON.parse(output!)
    expect(writtenJson.catalogs.react17.react).toBe('^17.0.3')
    expect(writtenJson.catalogs.react17['react-dom']).toBe('^17.0.3')

    // Ensure default catalog and other catalogs are preserved
    expect(writtenJson.catalog.react).toBe('^18.2.0')
    expect(writtenJson.catalogs.react18.react).toBe('^18.2.0')

    // Ensure no workspaces object is created
    expect(writtenJson.workspaces).toBeUndefined()
  })
})
