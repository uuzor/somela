# Somela Client

Frontend application for the Somela project.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.

## Run Locally

Start the Vite dev server:

```bash
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

## Build

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Environment

For frontend-only development, create or update `.env.local` in the project root:

```bash
VITE_API_URL=https://your-api.example.com
```

`VITE_API_URL` is used by `src/services/apiClient.js` to prefix `/api` requests when they should be sent to a deployed backend instead of the current origin.

## Project Structure

- `src/`: frontend application source.
- `src/components/`: shared React components.
- `src/pages/`: route-level pages.
- `src/services/`: API client and domain service modules.
- `src/lib/`: shared utilities, contexts, and helpers.
- `vite.config.js`: Vite config.
