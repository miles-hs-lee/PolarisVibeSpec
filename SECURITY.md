# Security policy

## Supported versions

While Polaris Vibe Spec is pre-1.0, only the latest released version on `main`
is supported. After 1.0, the latest minor release line will receive fixes.

## Reporting a vulnerability

Please **do not** open public issues for security vulnerabilities.

Use one of:

1. **Private GitHub Security Advisory** (preferred):
   <https://github.com/miles-hs-lee/PolarisVibeSpec/security/advisories/new>
2. Email the maintainer (see commit history for the address).

Include:

- A clear description of the issue and its impact.
- Reproduction steps (commands, input, environment).
- Any suggested fix or mitigation, if you have one.

## What to expect

- **Acknowledgement** within 7 days of report.
- **Initial assessment** within 14 days (severity, scope, fix plan).
- **Fix or mitigation** released as soon as practical, coordinated with the
  reporter for disclosure timing.
- Reporters who follow this process will be credited in the release notes
  unless they request anonymity.

## Scope

In scope:

- The `pv` CLI and its dependencies.
- Code execution paths in `dist/` (e.g., a malicious graph.json that could
  cause arbitrary read/write outside `.polaris/`).
- Path traversal, injection, or escape issues in `pv` commands that touch
  the filesystem.

Out of scope:

- Vulnerabilities in user-supplied source code that PV merely reads (e.g.,
  the `bootstrap` content peek). PV reads at most 4KB per file and never
  executes user source.
- Vulnerabilities in third-party tools the bundled skill recommends
  invoking (`grep`, the user's coding agent).
