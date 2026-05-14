# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual `SKILL.md` files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| improve accessibility, a11y audit, WCAG compliance, screen reader support, keyboard navigation | accessibility | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\accessibility\SKILL.md |
| creating, opening, or preparing PRs for review | branch-pr | C:\Users\Asistente\.config\opencode\skills\branch-pr\SKILL.md |
| PRs over 400 lines, stacked PRs, review slices | chained-pr | C:\Users\Asistente\.config\opencode\skills\chained-pr\SKILL.md |
| writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs | cognitive-doc-design | C:\Users\Asistente\.config\opencode\skills\cognitive-doc-design\SKILL.md |
| PR feedback, issue replies, reviews, Slack messages, or GitHub comments | comment-writer | C:\Users\Asistente\.config\opencode\skills\comment-writer\SKILL.md |
| libraries, frameworks, API references, setup questions, code examples | context7-mcp | C:\Users\Asistente\.claude\skills\context7-mcp\SKILL.md |
| building polished React/HTML/CSS UI, pages, dashboards, landing pages, styling/beautifying UI | frontend-design | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\frontend-design\SKILL.md |
| Go tests, go test coverage, Bubbletea teatest, golden files | go-testing | C:\Users\Asistente\.config\opencode\skills\go-testing\SKILL.md |
| InsForge app code with @insforge/sdk: database CRUD, auth, storage, functions, AI, realtime, payments, email | insforge | C:\Users\Asistente\.agents\skills\insforge\SKILL.md |
| InsForge infrastructure: projects, SQL, migrations, RLS, functions, storage buckets, deployments, secrets, logs, backend branches | insforge-cli | C:\Users\Asistente\.agents\skills\insforge-cli\SKILL.md |
| InsForge errors, SDK errors, HTTP 4xx/5xx, function failures, slow DB, auth/RLS failures, realtime issues, deploy failures | insforge-debug | C:\Users\Asistente\.agents\skills\insforge-debug\SKILL.md |
| external auth providers into InsForge, JWT RLS, OKX x402 payments | insforge-integrations | C:\Users\Asistente\.agents\skills\insforge-integrations\SKILL.md |
| creating GitHub issues, bug reports, or feature requests | issue-creation | C:\Users\Asistente\.config\opencode\skills\issue-creation\SKILL.md |
| judgment day, dual review, adversarial review, juzgar | judgment-day | C:\Users\Asistente\.config\opencode\skills\judgment-day\SKILL.md |
| Node.js servers, REST APIs, GraphQL backends, microservices | nodejs-backend-patterns | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\nodejs-backend-patterns\SKILL.md |
| Node.js architecture decisions, async patterns, security, framework selection | nodejs-best-practices | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\nodejs-best-practices\SKILL.md |
| improve SEO, meta tags, structured data, sitemap optimization | seo | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\seo\SKILL.md |
| new skills, agent instructions, documenting AI usage patterns | skill-creator | C:\Users\Asistente\.config\opencode\skills\skill-creator\SKILL.md |
| styling React/Vue/Svelte components, responsive layouts, Tailwind CSS | tailwind-css-patterns | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\tailwind-css-patterns\SKILL.md |
| complex TypeScript types, generics, conditional/mapped/template types, compile-time safety | typescript-advanced-types | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\typescript-advanced-types\SKILL.md |
| React composition, compound components, render props, context providers, component architecture | vercel-composition-patterns | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\vercel-composition-patterns\SKILL.md |
| React/Next.js performance, data fetching, bundle optimization, performance refactors | vercel-react-best-practices | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\vercel-react-best-practices\SKILL.md |
| Vite projects, vite.config.ts, Vite plugins, libraries, SSR, Rolldown migration | vite | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.claude\skills\vite\SKILL.md |
| implementation, commit splitting, chained PRs, keeping tests/docs with code | work-unit-commits | C:\Users\Asistente\.config\opencode\skills\work-unit-commits\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### accessibility
- Target WCAG 2.2 AA; keep content perceivable, operable, understandable, and robust.
- Images need useful `alt`; decorative images use empty alt or presentation role.
- Icon-only controls must have accessible names; hide decorative SVGs with `aria-hidden`.
- Maintain contrast: 4.5:1 normal text, 3:1 large text and UI graphics.
- Never rely on color alone; pair errors/status with text or icons.
- Preserve keyboard access, visible focus, and no keyboard traps.
- Form fields need labels, `aria-invalid`, and error text connected by `aria-describedby`.

### branch-pr
- Every PR must link an approved issue with `Closes/Fixes/Resolves #N`.
- Add exactly one `type:*` label matching the PR type.
- Use branch names matching `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)/[a-z0-9._-]+$`.
- Use Conventional Commits; never add `Co-Authored-By` trailers.
- PR body needs summary, changes table, test plan, and checked contributor checklist.
- Run required checks before merge and shellcheck modified shell scripts.

### chained-pr
- Split PRs over 400 changed lines unless maintainer approves `size:exception`.
- One deliverable work unit per PR; keep tests/docs with the unit.
- State start, end, dependencies, follow-ups, and out-of-scope work in every chained PR.
- Every child PR includes a dependency diagram with current PR marked `📍`.
- Use one chain strategy consistently: stacked-to-main or feature-branch-chain.
- Treat polluted diffs as base bugs; retarget/rebase until only current work appears.

### cognitive-doc-design
- Lead with the answer: decision/action/outcome first, context after.
- Use progressive disclosure: happy path first, details and edge cases later.
- Chunk content with clear headings, labels, tables, checklists, and examples.
- Prefer recognition over recall; avoid long dense prose.
- For review docs, state what to review first and what is out of scope.
- Include verification/acceptance checklists where useful.

### comment-writer
- Start with the actionable point; do not recap everything first.
- Be warm, direct, and short, usually 1 to 3 short paragraphs or tight bullets.
- Explain the technical why when requesting a change.
- Comment on the highest-value issue, not every tiny preference.
- Match the thread language; in Spanish use natural Rioplatense voseo.
- Avoid em dashes; use commas, periods, or parentheses.

### context7-mcp
- For library/framework/API/code-example questions, fetch current docs instead of relying on training data.
- First resolve the library ID with the full user question for relevance.
- Prefer official/high-reputation docs and version-specific IDs when the user mentions a version.
- Then query docs with a specific implementation question.
- Use fetched docs in the answer and cite version/source context when relevant.

### frontend-design
- Pick a clear aesthetic direction before coding; avoid generic AI-looking UI.
- Use distinctive typography, cohesive color, intentional motion, and strong spatial composition.
- Avoid overused defaults like generic system-font/purple-gradient cookie-cutter layouts.
- Match complexity to the aesthetic; refined minimalism needs precision, maximalism needs intentional detail.
- Implement production-grade, functional, responsive UI, not just mock visuals.
- Keep accessibility and performance constraints in the design.

### go-testing
- Prefer table-driven tests with `t.Run` for multiple cases.
- Test behavior and state transitions, not implementation trivia.
- Use `t.TempDir()` for filesystem tests; never rely on a real home directory.
- Make slow/external integration tests skippable with `testing.Short()`.
- For Bubbletea, test `Model.Update()` directly; use `teatest` only for interactive flows.
- Golden files must be deterministic and rerun without `-update` after updates.

### insforge
- Use `@insforge/sdk` for app logic: auth, DB CRUD, storage, functions, AI, realtime, email, payments.
- Use anon key for SDK clients; API keys are admin/service secrets and must never be exposed.
- Vite env vars use `VITE_INSFORGE_URL` and `VITE_INSFORGE_ANON_KEY`; Next uses `NEXT_PUBLIC_*`.
- SDK client: `createClient({ baseUrl, anonKey })`; SDK calls return `{ data, error }`.
- For DB inserts, use array payloads and check `error` every time.
- For infrastructure, migrations, RLS, buckets, secrets, Stripe catalog, and deployments, use `insforge-cli` instead.

### insforge-cli
- Always run CLI through `npx @insforge/cli`; never install or call a global `insforge` binary.
- Start infra sessions by verifying `npx @insforge/cli whoami` and `current`.
- Use `metadata --json` first to discover backend state before building features.
- Use migrations for schema changes; reserve `db query` for inspection/row-level work.
- API keys are full admin secrets; never expose them in frontend/public env vars.
- For compute, use InsForge CLI, not `flyctl` directly.
- Default payments work to test environment; use live only with explicit approval.

### insforge-debug
- For concrete InsForge errors, run `npx @insforge/cli diagnose --ai "<issue>"` first, then verify logs/metrics.
- SDK `{ data:null, error }`: extract code/message/details and inspect `diagnose logs` plus relevant service logs.
- HTTP 404: inspect `metadata --json`; 500: check aggregate logs; 429 has no backend logs and requires client-side throttling/backoff.
- Function failures: check `function.logs`, list functions, and inspect source.
- Slow DB: inspect slow queries, connections, locks, indexes, bloat, cache hit, and metrics.
- Auth/RLS issues: inspect `insforge.logs` and `postgREST.logs`.

### insforge-integrations
- External auth uses provider-issued JWT passed to InsForge via `edgeFunctionToken`.
- RLS should read `request.jwt.claims`; use `requesting_user_id()` rather than `auth.uid()`.
- Third-party provider user IDs are strings; use `TEXT`, not UUID, for user IDs.
- Retrieve JWT secret via `npx @insforge/cli secrets get JWT_SECRET`; never hardcode it.
- x402 payment flows must verify/settle then record DB rows, and DB insert errors must be handled because funds may already move.
- Add `UNIQUE` on payment `tx_hash`; never enable mock facilitator in production.

### issue-creation
- Search existing issues for duplicates before creating a new issue.
- Use the correct template; blank issues are disabled.
- Every new issue starts as `status:needs-review`; PRs require maintainer `status:approved`.
- Bug reports require repro steps, expected/actual behavior, OS, agent/client, and shell.
- Feature requests require problem, proposed solution, and affected area.
- Questions belong in Discussions, not issues.

### judgment-day
- Only run when explicitly requested for Judgment Day/dual/adversarial review.
- Resolve and inject project standards into both blind judges and any fix prompt.
- Launch two blind judges in parallel with identical scope and criteria; never self-review.
- Wait for both judges and synthesize confirmed, suspect, contradiction, and info buckets.
- Ask before fixing Round 1 confirmed issues; after fixes, re-run both judges.
- Terminal states are only `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`.

### nodejs-backend-patterns
- Separate controller/route, service/business logic, repository/data access, middleware, config, and types.
- Validate inputs at boundaries and centralize error formatting.
- Never leak internal errors to clients; log stack/context server-side.
- Use framework-appropriate middleware for security, CORS, compression, parsing, and request logging.
- Keep DB logic in repositories and business rules in services for testability.
- Prefer schemas and type-safe routes where the framework supports them.

### nodejs-best-practices
- Choose frameworks based on deployment target, performance needs, team experience, and legacy constraints.
- Prefer ESM for new code; keep CommonJS only for existing compatibility needs.
- Keep request layer, service layer, and repository layer separate when code will grow.
- Use `Promise.all` for independent async work and avoid event-loop blocking CPU/sync I/O.
- Validate at boundaries; errors should have correct status, stable codes, safe client messages, and rich logs.
- Ask user preferences when architecture tradeoffs are unclear.

### seo
- Ensure pages have unique titles, meta descriptions, canonical URLs, and logical heading hierarchy.
- Keep URLs lowercase, short, hyphenated, and canonical; use HTTPS.
- Include robots/sitemap controls for crawlability and avoid blocking render-critical resources.
- Optimize images with descriptive filenames, alt text, dimensions, lazy loading, and compression.
- Add structured data only when it matches visible page content.
- Keep Core Web Vitals and accessibility in mind because page experience affects search quality.

### skill-creator
- Create a skill only for reusable AI guidance, not one-off documentation.
- First follow `docs/skill-style-guide.md` if present; otherwise use inline fallback rules.
- Frontmatter needs quoted one-line description with trigger words, license, author, and version.
- Required section order: Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References.
- Keep `SKILL.md` concise; move examples/schemas/details to local `assets/` or `references/`.
- Register project skills in `AGENTS.md` when applicable.

### tailwind-css-patterns
- Build mobile-first with responsive prefixes for larger breakpoints.
- Use design tokens and utility composition; prefer utilities over heavy `@apply`.
- Extract reusable components for repeated long class patterns.
- Verify responsive behavior at breakpoints and preserve focus styles/ARIA/reduced-motion.
- Ensure content paths cover all templates to avoid missing production classes.
- This repo's root currently uses Tailwind v4 despite project guidance warning to lock v3.4; verify before upgrading/changing Tailwind.

### typescript-advanced-types
- Use generics and constraints to preserve inference while enforcing required capabilities.
- Prefer conditional and mapped types for transformations; avoid `any` leakage.
- Use template literal types for string protocols/routes/events when it improves safety.
- Keep complex types named and documented; don't inline unreadable type puzzles.
- Preserve strict mode assumptions and avoid weakening types to make errors disappear.
- Validate runtime boundaries separately; TypeScript types do not validate external data.

### vercel-composition-patterns
- Avoid boolean prop proliferation; create explicit variants or compose children.
- Use compound components plus context for complex reusable components.
- Keep provider/state implementation isolated; UI consumes generic state/actions/meta interfaces.
- Lift state into provider boundaries so sibling/custom components can access it without prop drilling.
- Prefer children composition over render props unless the parent must pass item data back.
- React 19-only guidance does not apply to the root app because it uses React 18; apply only in `website/claudix` React 19 code.

### vercel-react-best-practices
- Eliminate async waterfalls with `Promise.all`, early sync guards, deferred awaits, and Suspense where appropriate.
- Optimize bundles: avoid expensive barrel imports in non-Next apps, use dynamic/conditional imports for heavy code.
- Derive state during render; do not use effects for pure derived values.
- Avoid defining components inside components; use functional state updates to prevent stale closures.
- Use passive listeners for scroll/touch when not preventing defaults and cache expensive storage reads carefully.
- For Next.js server code, authenticate server actions and avoid mutable request-scoped module state.

### vite
- Prefer TypeScript Vite config and ESM; avoid CommonJS unless compatibility requires it.
- Use `defineConfig`, explicit aliases, and plugin ordering deliberately.
- Use `import.meta.env` for Vite env variables and `import.meta.glob`/asset queries for Vite-native patterns.
- Keep build output, base path, and assets includes aligned with Electron/static deployment needs.
- For custom plugins, implement narrow hooks and avoid unnecessary filesystem work in hot paths.
- Check Vite version before applying Rolldown/Vite 8 migration advice; this repo uses Vite 6.x.

### work-unit-commits
- A commit represents one deliverable behavior, fix, migration, or docs unit.
- Do not split by file type if each commit cannot stand alone.
- Keep tests with the code they verify and docs with the user-visible change.
- Each unit should have clear purpose, verification, and rollback boundaries.
- Use Conventional Commit messages that explain outcome, not file lists.
- If changes approach 400 lines, promote work units into chained PR slices.

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\AGENTS.md | Root convention file. InsForge instructions: fetch docs before InsForge code, SDK for app logic, MCP/CLI for infra, SDK returns `{data,error}`, DB inserts use arrays. Also warns to use Tailwind CSS 3.4, which conflicts with current package versions. |
| AGENTS.md | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\website\claudix\AGENTS.md | Next.js 16 warning: APIs/conventions may differ; read `node_modules/next/dist/docs/` before editing Next.js code. |
| .gitignore | C:\Users\Asistente\Desktop\Nueva_carpeta\Cyberbistro\.gitignore | `.atl/` is ignored for generated agent registry artifacts. |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
