# GitHub Actions Workflows

This repository deploys through GitHub Actions.

## Workflows

### Test PALS (`pals-test.yaml`)

Runs on:
- pushes to `main`
- pull requests

Jobs:
- `test`: installs dependencies, runs lint, typecheck, unit tests, Drizzle schema check, and build
- `deploy-to-preview`: deploys preview automatically after `test` passes on pushes to `main`

### Deploy PALS (`pals-deploy.yaml`)

Reusable deployment workflow used by preview and manual deployments.

For the selected environment it:
1. installs dependencies
2. builds the app
3. applies D1 migrations
4. deploys the Cloudflare Worker with Wrangler
5. uploads Worker secrets

### Deploy PALS (manual) (`pals-deploy-manual.yaml`)

Manual workflow dispatch from the GitHub Actions UI.

Use it for:
- preview deploys on demand
- production deploys on demand

Steps:
1. Go to GitHub Actions
2. Select **Deploy PALS (manual)**
3. Click **Run workflow**
4. Choose `preview` or `prod`
5. Run

## Required GitHub Actions secrets

Configure these in GitHub repository settings:

| Secret | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | Wrangler deploy and D1 migrations |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Cloudflare account |
| `ANTHROPIC_API_KEY` | yes | Agent model access |
| `OPENAI_API_KEY` | yes | WhatsApp bot model access |
| `WHATSAPP_API_KEY` | yes | Authenticates Baileys container webhooks |
| `ADMIN_API_KEY` | yes | Admin/API operations |
| `BETTER_AUTH_SECRET` | yes | Better Auth secret |
| `BETTER_AUTH_URL` | yes | Public app URL for auth callbacks |
| `GITHUB_CLIENT_ID` | optional | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | optional | GitHub OAuth |
| `GOOGLE_CLIENT_ID` | optional | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | optional | Google OAuth |

## Deploy behavior

### Preview

Preview deploys happen automatically when code is pushed to `main` and tests pass.

Equivalent command path in CI:

```sh
bun run ci:db:migrate:preview
CLOUDFLARE_ENV=preview bun run build
wrangler deploy --config dist/whatsapp_agents_saas/wrangler.json
```

### Production

Production deploys are manual from GitHub Actions using **Deploy PALS (manual)** with `environment=prod`.

Equivalent command path in CI:

```sh
bun run ci:db:migrate:prod
bun run build
wrangler deploy --config dist/whatsapp_agents_saas/wrangler.json
```
