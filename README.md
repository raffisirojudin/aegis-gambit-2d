# Aegis Gambit 2.5D

Aegis Gambit is a tactical chess duel game built with React, TypeScript, and Vite. Standard chess movement is combined with real-time combat: whenever a piece captures another, the game enters a short 2.5D arena duel, and the duel result determines whether the capture succeeds.

## Features

- Chess board with legal move validation, promotion, check, checkmate, and draw handling
- Capture duels with health bars, cooldowns, attacks, parry, dash, and special abilities
- Player vs AI mode with a minimax-based opponent
- Player vs Player mode on a single device
- Lobby screen for selecting a mode before starting
- Responsive canvas rendering with multiple visual themes
- Synthesized sound effects and optional mute
- GitHub Pages deployment through GitHub Actions

## Requirements

- Node.js 20 or newer
- npm

## Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Deployment

Pushes to `main` build and deploy the `dist` directory to GitHub Pages through `.github/workflows/deploy.yml`. In the repository settings, set Pages source to GitHub Actions.

## Security

Secrets and environment files are ignored by `.gitignore`. Do not commit `.env` files, API keys, tokens, or build artifacts.
