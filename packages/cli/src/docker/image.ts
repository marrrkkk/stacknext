import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const DOCKER_IMAGE_ENV = 'STACKNEXT_DOCKER_IMAGE'
export const DOCKER_REPOSITORY_ENV = 'STACKNEXT_DOCKER_REPOSITORY'

const DEFAULT_IMAGE_NAME = 'stacknext'
const DEFAULT_REGISTRY = 'ghcr.io'

export interface DockerImageOptions {
  cliVersion: string
  env?: NodeJS.ProcessEnv
  /** Injectable for tests. Defaults to the @stacknext/cli package manifest. */
  repositoryUrl?: string | null
}

function packageManifestPath(): string {
  return fileURLToPath(new URL('../../package.json', import.meta.url))
}

async function readRepositoryUrl(): Promise<string | null> {
  try {
    const manifest = JSON.parse(await readFile(packageManifestPath(), 'utf8')) as {
      repository?: { url?: unknown } | string
      homepage?: unknown
    }
    if (typeof manifest.repository === 'string') return manifest.repository
    if (
      manifest.repository &&
      typeof manifest.repository === 'object' &&
      typeof manifest.repository.url === 'string'
    ) {
      return manifest.repository.url
    }
    return typeof manifest.homepage === 'string' ? manifest.homepage : null
  } catch {
    return null
  }
}

export function repositoryOwnerFromUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const match = /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:[#?].*)?$/i.exec(
    value.trim(),
  )
  return match?.[1] ?? null
}

function registryRepository(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error(`${DOCKER_REPOSITORY_ENV} must not be empty`)
  const first = trimmed.split('/', 1)[0] ?? ''
  return first.includes('.') || first.includes(':')
    ? trimmed
    : `${DEFAULT_REGISTRY}/${trimmed}`
}

function hasExplicitTagOrDigest(reference: string): boolean {
  if (reference.includes('@')) return true
  const last = reference.slice(reference.lastIndexOf('/') + 1)
  return last.includes(':')
}

export function validateDockerImageReference(reference: string): string {
  const value = reference.trim()
  if (value.length === 0) throw new Error('Docker image reference must not be empty')
  if (value.length > 255) throw new Error('Docker image reference is too long')
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@+-]*$/.test(value)) {
    throw new Error(
      `Invalid Docker image reference "${value}". Use a repository name with an optional tag or digest.`,
    )
  }
  if (value.includes('..')) {
    throw new Error(`Invalid Docker image reference "${value}": ".." is not allowed`)
  }
  return value
}

export function normalizeDockerImageReference(
  reference: string,
  cliVersion: string,
): string {
  const value = validateDockerImageReference(reference)
  return hasExplicitTagOrDigest(value) ? value : `${value}:${cliVersion}`
}

/**
 * Resolves the image that matches this CLI release. The repository owner comes
 * from the installed package manifest, never from a hard-coded account.
 */
export async function resolveDockerImage(
  options: DockerImageOptions,
): Promise<string> {
  const env = options.env ?? process.env
  const override = env[DOCKER_IMAGE_ENV]?.trim()
  if (override) return normalizeDockerImageReference(override, options.cliVersion)

  const repository = env[DOCKER_REPOSITORY_ENV]?.trim()
  if (repository) {
    return normalizeDockerImageReference(
      registryRepository(repository),
      options.cliVersion,
    )
  }

  const repositoryUrl =
    options.repositoryUrl === undefined
      ? await readRepositoryUrl()
      : options.repositoryUrl
  const owner = repositoryOwnerFromUrl(repositoryUrl)
  if (!owner) {
    throw new Error(
      `Could not determine the StackNext image repository from the package metadata. ` +
        `Set ${DOCKER_IMAGE_ENV}=ghcr.io/<owner>/stacknext:<version> or ${DOCKER_REPOSITORY_ENV}=<owner>/stacknext.`,
    )
  }
  return normalizeDockerImageReference(
    `${DEFAULT_REGISTRY}/${owner}/${DEFAULT_IMAGE_NAME}:${options.cliVersion}`,
    options.cliVersion,
  )
}
