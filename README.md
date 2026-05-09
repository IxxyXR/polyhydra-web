# Polyhydra Web

Web version of Polyhydra for 2D tilings, Omni operators, and export.

Live site: https://ixxyxr.github.io/polyhydra-web/

Repository: https://github.com/IxxyXR/polyhydra-web

## Development

Prerequisites:
- Node.js 20+

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Typecheck:

```bash
npm run lint
```

Build for production:

```bash
npm run build
```

## GitHub Pages

This app is configured for GitHub Pages deployment from a repository named `polyhydra-web`.

The workflow in `.github/workflows/deploy-pages.yml`:
- runs on pushes to `main`
- installs dependencies with `npm ci`
- builds the app with `VITE_BASE_PATH=/polyhydra-web/`
- deploys `dist` to GitHub Pages

If you later host it from a custom domain or a different repository name, update the `VITE_BASE_PATH` value in the workflow.
