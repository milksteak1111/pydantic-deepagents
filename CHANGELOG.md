# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.12] - 2025-01-16

### Changed

- Updated `pydantic-ai-backend` dependency to `>=0.0.4` for persistent storage support
- `__version__` now dynamically reads from package metadata (pyproject.toml) via `importlib.metadata`

### Documentation

- Added persistent storage documentation to `docs/examples/docker-sandbox.md`:
  - `volumes` parameter for DockerSandbox
  - `workspace_root` parameter for SessionManager
- Added `workspace_root` documentation to `docs/examples/docker-runtimes.md`:
  - Configuration options section
  - New "Persistent Storage with workspace_root" section with examples
  - Directory structure diagram
- Updated `docs/examples/full-app.md` with `workspace_root` in SessionManager example
- Updated `examples/full_app/app.py` to use `workspace_root` for persistent user files
