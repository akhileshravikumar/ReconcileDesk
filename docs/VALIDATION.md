# Package validation

Validated during package preparation on Linux using Node 24.19.0, npm 11.9.0,
and Python 3.12.14. The user's Windows environment reports Node 24.14.1,
npm 11.11.0, Python 3.13.2, and Docker Compose 5.3.0.

| Check | Result |
|---|---|
| Dependency installation and npm lockfile creation | Passed |
| Prisma client generation | Passed |
| ESLint | Passed |
| TypeScript checks for API and frontend | Passed |
| API and configuration tests | 10 passed |
| API compilation and frontend build | Passed |
| Built API process starts and responds to health request | Passed |
| Built API reports 503 when dependencies are unavailable | Passed |
| FastAPI tests | 2 passed |
| Compose YAML parsing and basic structure checks | Passed; not a Docker runtime check |
| Playwright browser tests | Not run; browser download produced an invalid archive |
| Docker image builds and full service startup | Not run; Docker is unavailable in the build environment |
| Live PostgreSQL migration and BullMQ queue round trip | Pending on the user's Docker environment |
| Windows PowerShell scripts and Python 3.13 runtime | Pending on the user's environment |

The Python test runner emitted a Starlette warning about its deprecated httpx
TestClient integration. Both tests passed; the warning is not hidden. The current
service does not make network calls to OpenAI.

The browser tests use mocked readiness responses. The live smoke command in
README.md separately verifies actual infrastructure. Neither test category is
claimed as successful until its command has run successfully.

Financial performance benchmarks and AI-quality reports remain empty templates.
No hypothetical portfolio outcome is presented as an achieved result.
