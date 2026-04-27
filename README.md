# GeoQuiz

A React + Vite quiz web app for world flags and capitals.

## Features
- Uses the free REST Countries API
- Generates mixed flag and capital questions
- Shows score, progress, and review at the end
- Responsive, modern UI

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template:
   ```bash
   copy .env.example .env
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```
3. In another terminal, start the custom backend:
   ```bash
   npm run dev:api
   ```

## Quality scripts
- Lint: `npm run lint`
- Auto-fix lint: `npm run lint:fix`
- Format: `npm run format`
- Check formatting: `npm run format:check`
- Tests (watch): `npm test`
- Tests (CI mode): `npm run test:run`
- Build: `npm run build`

## CI
GitHub Actions workflow is included at [GEOQUIZ/.github/workflows/ci.yml](.github/workflows/ci.yml).

## Environment variables
See [GEOQUIZ/.env.example](.env.example):
- `VITE_API_URL`
- `VITE_BACKEND_URL`
- `VITE_FETCH_TIMEOUT_MS`
- `VITE_FETCH_RETRIES`
- `VITE_ANALYTICS_ENDPOINT`
- `PORT`
- `CLIENT_ORIGIN`
- `AUTH_SECRET`
- `DATA_DIR`

## Custom backend
- `npm run dev:api` starts the Node API on `http://localhost:3001`.
- The backend stores data in `data/geoquiz.sqlite` by default.
- Guest quiz completions are automatically submitted to the leaderboard with generated names like `Guest-A1B2`.

## Deployment security headers
Netlify headers are configured in [GEOQUIZ/netlify.toml](netlify.toml).

## API used
- REST Countries: https://restcountries.com/
