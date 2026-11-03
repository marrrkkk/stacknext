import { z } from 'zod'
import { stackNextConfigSchema } from '@stacknext/core'

const nextOtelVerboseStatusSchema = z
  .object({
    enabled: z.boolean(),
    source: z.enum(['config', 'environment', 'disabled', 'unknown']),
  })
  .strict()

/**
 * The private file handed to the container. It is mounted read-only and is
 * never passed on the Docker command line or in container environment values.
 */
export const dockerCollectorConfigSchema = z
  .object({
    version: z.literal(1),
    token: z.string().min(16),
    projectName: z.string().min(1).max(200),
    internalPort: z.number().int().min(1024).max(65535),
    publicPort: z.number().int().min(1024).max(65535),
    projectDir: z.string().min(1),
    config: stackNextConfigSchema,
    nextOtelVerbose: nextOtelVerboseStatusSchema,
  })
  .strict()

export type DockerCollectorConfig = z.infer<typeof dockerCollectorConfigSchema>

export const DOCKER_INTERNAL_PORT = 4400
export const DOCKER_CONFIG_FILE_NAME = 'config.json'
export const DOCKER_CONFIG_DIR_NAME = 'docker'
export const DOCKER_CONTAINER_CONFIG_PATH =
  '/data/.stacknext/docker/config.json'
