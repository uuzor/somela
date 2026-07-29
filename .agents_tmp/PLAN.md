# Run Somela on Different Port

## 1. OBJECTIVE
Configure Somela to run on port 12000 so existing products on port 8080 remain accessible. Push changes to GitHub and create a pull request.

## 2. CONTEXT SUMMARY

- **Existing products:** 2 products running on http://8.222.176.62:8080/ that must remain accessible
- **Backend:** Express server defaults to port 3000, configurable via `PORT` env var
- **Frontend:** React app with Vite dev server, proxies `/api` to `http://localhost:3000`
- **Remote:** GitHub repo at github.com/uuzor/somela

## 3. APPROACH OVERVIEW

1. Add `PORT=12000` to backend `.env` file
2. Update frontend `vite.config.js` proxy to point to port 12000
3. Commit changes to a new branch
4. Push to GitHub and create pull request

## 4. IMPLEMENTATION STEPS

### Step 1: Add PORT=12000 to backend/.env
- **Goal:** Configure backend to listen on port 12000
- **File:** `/workspace/project/somela/backend/.env`
- **Change:** Add at top of file:
  ```
  # Server port (uses 12000 to avoid conflict with existing products on 8080)
  PORT=12000
  ```

### Step 2: Update Frontend Vite Config
- **Goal:** Point frontend proxy to new backend port
- **File:** `/workspace/project/somela/frontend/vite.config.js`
- **Change:** Update proxy target from `http://localhost:3000` to `http://localhost:12000`

### Step 3: Commit and Push to GitHub
- **Goal:** Push changes to a new branch
- **Branch name:** `feature/run-on-port-12000`
- **Commit message:** "Configure backend to run on port 12000"

### Step 4: Create Pull Request
- **Goal:** Create PR for review
- **Target:** Merge into `main` branch

## 5. TESTING AND VALIDATION

- Backend health check: `curl http://localhost:12000/health`
- Existing products on port 8080 remain accessible
