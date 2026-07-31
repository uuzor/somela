# OpenCommerceLens Frontend

AI-powered visual shopping agent for fashion. Users can upload photos, find similar outfits, chat with an AI agent, and virtually try on clothes.

## Tech Stack

- React 18 + Vite
- Tailwind CSS + shadcn/ui
- React Query for data fetching
- React Router for navigation
- Axios for API client

## Development

```bash
npm install
npm run dev
```

The frontend proxies `/api` requests to the backend server (default: `http://localhost:3000`).

## Architecture

### Pages
- `/` - Chat page (main entry)
- `/dashboard` - Product marketplace
- `/tryon` - Virtual try-on

### API Integration
- Session management via localStorage
- SSE streaming for chat responses
- React Query hooks for data fetching

### Key Hooks
- `useChatStream` - Chat with AI agent (SSE streaming)
- `useVisualSearch` - Image-based product search
- `useChatHistory` - Chat history management

### Key Files
- `src/lib/api-client.js` - Axios API client
- `src/hooks/useChat.js` - Chat React Query hooks
- `src/components/chat/` - Chat UI components

