# Docker runtime

StackNext can run its collector and dashboard in one Docker container. Native
mode remains the default: Docker is optional, and every existing command works
without it.

Only the collector and dashboard move into the container. The Next.js dev
server, Playwright, the MCP server and the CLI stay on the host, and saved
regression records remain in the project's `.stacknext` directory.

## Requirements

- Docker Engine or Docker Desktop with a running daemon. Docker Compose is not
  required.
- The image must match the installed CLI version. The release workflow publishes
  `ghcr.io/<owner>/stacknext:<version>` for `linux/amd64` and `linux/arm64`.
- The application must already satisfy the normal StackNext requirements:
  Next.js 15/16 App Router, Node.js runtime, and a local `dev` script.

The Docker runtime is exercised by the Linux CI image build and integration
test. Docker Desktop on Windows and macOS is supported by the host-side design
but is not part of the recorded compatibility matrix.

## Enable Docker mode

Set the runtime in `stacknext.config.json`:

```json
{
  "runtime": {
    "mode": "docker"
  }
}
```

Or select it for one run:

```bash
npx stacknext dev --runtime docker
```

The command-line flag overrides the configuration. `--runtime native` forces
native mode even when the config selects Docker. `runtime.mode` defaults to
`native`, and Docker checks are skipped entirely in native mode.

The first Docker run pulls the image if it is not present locally. This is the
only new outbound request: StackNext still sends no telemetry, diagnostics or
regression records to a remote service. Pulling from GHCR follows normal Docker
registry behavior.

## What runs where

| Component | Host | Container |
| --- | --- | --- |
| `stacknext` CLI | Yes | No |
| Next.js dev server | Yes | No |
| Playwright and captured browser | Yes | No |
| MCP stdio server | Yes | No |
| Collector HTTP server | No | Yes |
| Dashboard static assets | No | Yes |
| Telemetry store (in memory) | No | Yes |
| `.stacknext/runs`, baselines and comparisons | Yes | Read-only mount |

The container does not receive the project source, `node_modules`, the Docker
socket or the host home directory. Only `<project>/.stacknext` is mounted, and it
is mounted read-only. The CLI writes captured runs, baselines and comparisons on
the host, so those records survive container restarts.

## Lifecycle

`stacknext dev --runtime docker`:

1. Checks the Docker CLI and daemon only because Docker mode was selected.
2. Resolves the image for the installed CLI version and pulls it when missing.
3. Removes a stale StackNext container for the same project, if one exists.
4. Chooses an available loopback port, starting at `dashboard.port`.
5. Creates or reuses the project's dedicated bridge network.
6. Writes the private runtime config to
   `.stacknext/docker/config.json` with mode `0600`.
7. Starts one container with project labels and a deterministic
   `stacknext-<project-hash>` name.
8. Waits for `GET /api/ping` and fails with bounded container logs if readiness
   times out.
9. Writes `.stacknext/run.json` with the normal runtime state plus
   `runtime.mode: "docker"`, the container id, image and host port.
10. Starts the app's own `dev` script on the host with the collector URL and
    bearer token.

On SIGINT/SIGTERM, the CLI stops the Next.js child, stops and removes the
container, removes the private Docker config and the project network, and
deletes `.stacknext/run.json`. An abnormal exit is cleaned up by the next
`stacknext dev` or by `stacknext stop`.

`stacknext stop` only manages Docker resources for the current project. It
removes containers and networks carrying the `stacknext.managed=true` and
matching `stacknext.project` labels, removes `.stacknext/docker`, and deletes
the runtime state. It refuses to stop a live native runtime, a live Docker
runtime, or a startup that still holds the project runtime lock; stop those with
SIGINT/SIGTERM instead.

Telemetry is in memory inside the container, so it is lost when the container
stops. Saved regression records are host files and are not removed by
`stacknext stop`.

## Networking and security

The collector listens on `0.0.0.0:4400` inside the container because Docker must
be able to reach it. The only published port is bound to host loopback:

```text
127.0.0.1:<host-port>:4400
```

There is no `0.0.0.0` host publication, no remote bind and no Docker socket
mount. The existing Host, Origin, `Sec-Fetch-Site`, bearer-token, dashboard
session-cookie, CSP, security-header, payload-limit and two-layer redaction
checks are unchanged.

The container-internal listener is reachable only from containers attached to
the project's dedicated user-defined bridge network. StackNext creates
`stacknext-net-<project-hash>` with `stacknext.managed` and `stacknext.project`
labels and attaches only the collector. Other containers on Docker's default
bridge cannot reach it, and `stacknext stop` removes the network after the
container. Do not attach unrelated containers to this network; the bearer token,
session-cookie and origin checks still apply, but container-to-container traffic
on the project network is inside the Docker boundary. StackNext does not publish
the port on a host interface and does not add a Docker socket or remote context.

The container runs with:

- `--read-only`, with a small `noexec,nosuid` tmpfs at `/tmp`;
- `--cap-drop ALL`;
- `--security-opt no-new-privileges`;
- `--init`;
- a non-root user. On Linux and macOS the CLI uses the host uid/gid so the
  private mount is readable, and refuses to run as root. On Windows Docker
  Desktop the image's non-root `node` user is used.

The bearer token is written only to the `0600` config file inside the
read-only `.stacknext` mount and to `.stacknext/run.json`. It is not placed in
Docker command-line arguments, container environment values, image labels or
logs. The container entrypoint never prints it.

Docker itself is a privileged local service. A user who can control the Docker
daemon can inspect containers and mounts, so this runtime does not defend
against a compromised Docker host. It does keep StackNext from adding a Docker
socket, a remote listener or a project-wide mount.

## Image selection

The default image is derived from the installed `@stacknext/cli` package
repository metadata:

```text
ghcr.io/<repository-owner>/stacknext:<CLI_VERSION>
```

Use a locally built or alternate image without changing the package:

```bash
STACKNEXT_DOCKER_IMAGE=stacknext:local \
  npx stacknext dev --runtime docker
```

Or set only the repository; the CLI appends its own version:

```bash
STACKNEXT_DOCKER_REPOSITORY=acme/stacknext \
  npx stacknext dev --runtime docker
```

`STACKNEXT_DOCKER_IMAGE` accepts an explicit tag or digest and takes precedence.
If no tag is supplied, the CLI version is appended. Invalid references,
including values that start with `-` or contain shell metacharacters, are
rejected before Docker is invoked.

To build the production image from a checkout:

```bash
docker build -f docker/Dockerfile -t stacknext:local .
STACKNEXT_DOCKER_IMAGE=stacknext:local pnpm exec stacknext dev --runtime docker
```

The image is published by the release workflow. If the GHCR package is private,
authenticate the Docker CLI first with `docker login ghcr.io`. Public visibility
is a one-time package setting in GitHub; see [releasing](releasing.md#docker-image-publishing).

### Test a built image

Build the image and run the runtime integration checks against it:

```bash
docker build -f docker/Dockerfile -t stacknext:local .
node scripts/docker-integration.mjs --image stacknext:local --require-docker
```

The checks start one container with the same flags as `stacknext dev`, then
verify health, dashboard assets, authentication, telemetry ingest, read APIs,
SSE, the dedicated network, the read-only regression mount, loopback-only
publishing, container metadata, read-only filesystems, shutdown and project-file
integrity. They do not require the CLI or a Next.js app. Without
`--require-docker`, the script prints a skip message when Docker is unavailable.

## Limitations

- One StackNext container per project directory. There is no Compose stack and
  no separate dashboard container.
- Docker mode changes only where the collector runs. Next.js, Playwright, MCP and
  regression capture remain host processes.
- The container image is not built on demand by `stacknext dev`; it is pulled or
  must be supplied through `STACKNEXT_DOCKER_IMAGE`.
- In-memory telemetry does not survive a container restart. Regression records
  do, because they are host files.
- `stacknext stop` does not stop native processes and does not remove saved
  regression records.
- Docker Desktop file-sharing and permission prompts can prevent the container
  from reading the private mount. Keep the project inside a shared path and run
  as a non-root user.
- The collector still binds to loopback on the host. Do not add a remote Docker
  context or publish the port on a non-loopback interface.
