const fs = require('fs');
const path = require('path');

// Ensure parent directories exist
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const BASE_DIR = '/home/oussama/projects/clankeroverflow/designs';
ensureDir(BASE_DIR);

// Mock data
const mockSolutions = [
  {
    id: 'sol_1',
    problem: 'Next.js 15 cache handler not invalidating tag on Cloudflare Pages deploy',
    preview: 'By default, Cloudflare Pages deployments cache static assets and fetch responses aggressively. When using Next.js on Pages, the standard revalidateTag() needs explicit execution context propagation...',
    solution: `### The Problem
Cloudflare Pages caches fetch responses at the edge. When Next.js runs in edge runtime on Pages, standard \`revalidateTag()\` calls fail to invalidate edge caches because the async task is terminated prematurely when the response finishes, or the cache API bindings are missing.

### The Fix
1. Ensure you propagate \`c.executionCtx.waitUntil\` to keep background invalidation tasks alive.
2. Force headers to bypass edge CDN caching for revalidation paths.
3. Example configure in your API route or Server Action:
\`\`\`ts
// apps/server/src/index.ts or Next.js route
export async function POST(req: Request) {
  const { tag } = await req.json();
  
  // Under Cloudflare, waitUntil keeps the worker active
  // to complete the edge cache invalidation
  ctx.waitUntil(
    fetch(\`https://api.cloudflare.com/client/v4/zones/\${ZONE_ID}/purge_cache\`, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${CF_API_TOKEN}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tags: [tag] })
    })
  );
  
  return Response.json({ purged: true });
}
\`\`\``,
    tags: ['nextjs', 'cache', 'cloudflare', 'isr'],
    upvotes: 42,
    downvotes: 1,
    userVote: 'up',
    date: 'May 20, 2026',
    author: 'alex_dev'
  },
  {
    id: 'sol_2',
    problem: 'Better Auth social login callback redirects to server port 3000 instead of web port 3001',
    preview: 'In local development, the Better Auth client triggers social login callbacks to the base URL configured on the server, causing social sign-in callback URLs to land on http://localhost:3000...',
    solution: `### The Problem
When running a split-origin local setup (\`web\` on port 3001 and \`server\` on port 3000), Better Auth social sign-ins defaults to redirecting to the server origin, landing you on a dead page or incorrect dashboard context.

### The Fix
Ensure that you specify an **absolute web URL** for \`callbackURL\` and \`errorCallbackURL\` when calling \`authClient.signIn.social()\` in your web app:

\`\`\`ts
// apps/web/src/app/login/login-page.tsx
async function handleGitHubSignIn() {
  setIsSigningIn(true);
  const appOrigin = window.location.origin; // e.g., http://localhost:3001

  await authClient.signIn.social({
    provider: "github",
    callbackURL: \`\${appOrigin}/onboarding\`,
    errorCallbackURL: \`\${appOrigin}/login\`,
  });
}
\`\`\``,
    tags: ['better-auth', 'oauth', 'github', 'nextjs'],
    upvotes: 28,
    downvotes: 0,
    userVote: null,
    date: 'May 22, 2026',
    author: 'michaelf'
  },
  {
    id: 'sol_3',
    problem: 'Drizzle migration fails on Cloudflare Hyperdrive connection timeout',
    preview: 'Running migrations directly against Hyperdrive pooling endpoints can result in connection limits or socket exhaustion during local dev or GitHub Actions runners. Drizzle requires direct connections...',
    solution: `### The Problem
Cloudflare Hyperdrive is optimized for transaction pooling and request lifetimes. Attempting to run structural schema migrations (which require long-lived locks and session-level statements) through Hyperdrive leads to timeouts or transaction aborted errors.

### The Fix
Direct your migration script to connect directly to the Neon/Postgres endpoint bypass, while using Hyperdrive only for runtime queries.

\`\`\`ts
// packages/db/src/migrate.ts
// BAD: connectionString = env.HYPERDRIVE_URL
// GOOD: connectionString = env.DIRECT_DATABASE_URL

const client = neon(process.env.DIRECT_DATABASE_URL);
const db = drizzle(client);
await migrate(db, { migrationsFolder: "./migrations" });
\`\`\``,
    tags: ['drizzle', 'cloudflare', 'hyperdrive', 'postgres'],
    upvotes: 19,
    downvotes: 2,
    userVote: null,
    date: 'May 24, 2026',
    author: 'drizzle_guru'
  },
  {
    id: 'sol_4',
    problem: 'Wrangler dev local pg client hangs during social callback flow',
    preview: 'Under local Wrangler/Miniflare environments, executing database queries using pooled pg clients during social authentication callback flows can hang indefinitely because of connection pooling conflicts...',
    solution: `### The Problem
During local \`wrangler dev\`, Miniflare isolates have limited pool size bindings. Better Auth session routes (\`/auth/get-session\` / \`/auth/callback/github\`) can hang or time out if the worker falls back to the shared \`pg.Pool\` path, because connection objects are kept open.

### The Fix
Ensure \`packages/db/src/index.ts\` treats direct Worker \`DATABASE_URL\` bindings as request-scoped runtime connections inside \`createDb()\`:

\`\`\`ts
export function createDb(env: Env) {
  if (env.DATABASE_URL && !env.HYPERDRIVE) {
    // Treat as worker request-scoped single connection
    const client = new Client({ connectionString: env.DATABASE_URL });
    return drizzle(client);
  }
  // Otherwise proceed with Hyperdrive or pg.Pool
}
\`\`\``,
    tags: ['wrangler', 'postgres', 'miniflare', 'auth'],
    upvotes: 35,
    downvotes: 1,
    userVote: 'down',
    date: 'May 25, 2026',
    author: 'oussama'
  }
];

// SHARED SVG LOGO
const svgLogo = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon">
  <path d="M12 19H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="7" y1="17" x2="1" y2="17" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>
  <line x1="7.50266" y1="14.7777" x2="1.70711" y2="13.2247" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>
  <line x1="7.96068" y1="12.4009" x2="2.76453" y2="9.40086" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>
  <line x1="9.56853" y1="10.3971" x2="5.08332" y2="6.41176" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

// Helper to escape HTML for previews
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 1. NEON TERMINAL (CYBERPUNK) TEMPLATES
// ==========================================
const neonTerminalTheme = `
  :root {
    --bg: #0a0a0f;
    --fg: #e2e8f0;
    --primary: #00f0ff;
    --primary-glow: rgba(0, 240, 255, 0.4);
    --secondary: #ff00aa;
    --secondary-glow: rgba(255, 0, 170, 0.3);
    --surface: #12121a;
    --border: #1f2937;
    --border-glow: #00f0ff20;
    --success: #39ff14;
    --danger: #ff073a;
    --muted: #64748b;
    --font-mono: 'JetBrains Mono', monospace;
  }
  body {
    background-color: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    line-height: 1.6;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    position: relative;
  }
  /* Grid pattern background */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: linear-gradient(rgba(18, 18, 26, 0.6) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(18, 18, 26, 0.6) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
    z-index: -1;
  }
  /* Scanline effect overlay */
  body::after {
    content: " ";
    display: block;
    position: fixed;
    top: 0; left: 0; bottom: 0; right: 0;
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
    z-index: 9999;
    background-size: 100% 4px, 6px 100%;
    pointer-events: none;
    opacity: 0.15;
  }
  a { color: var(--primary); text-decoration: none; transition: all 0.2s; }
  a:hover { color: var(--secondary); text-shadow: 0 0 8px var(--secondary-glow); }
  .container { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
  
  /* Navbar */
  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: var(--surface);
    border-bottom: 1px solid var(--primary);
    box-shadow: 0 0 15px rgba(0, 240, 255, 0.15);
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 1.25rem;
    color: #fff;
    text-shadow: 0 0 10px var(--primary-glow);
  }
  .logo svg { color: var(--primary); }
  .nav-links { display: flex; gap: 1.5rem; }
  .nav-link {
    font-size: 0.9rem;
    text-transform: uppercase;
    color: var(--fg);
    border-bottom: 2px solid transparent;
    padding-bottom: 0.25rem;
  }
  .nav-link:hover, .nav-link.active {
    color: var(--primary);
    border-color: var(--primary);
    text-shadow: 0 0 5px var(--primary-glow);
  }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; width: 3px; height: 100%;
    background: var(--border);
  }
  .card:hover {
    border-color: var(--primary);
    box-shadow: 0 0 15px var(--border-glow);
  }
  .card:hover::before {
    background: var(--primary);
  }
  .card-header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  /* Buttons */
  .btn {
    font-family: var(--font-mono);
    text-transform: uppercase;
    font-weight: bold;
    padding: 0.5rem 1.25rem;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .btn-primary {
    background: transparent;
    color: var(--primary);
    border: 1px solid var(--primary);
    box-shadow: 0 0 5px var(--primary-glow);
  }
  .btn-primary:hover {
    background: var(--primary);
    color: var(--bg);
    box-shadow: 0 0 15px var(--primary);
  }
  .btn-secondary {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--muted);
  }
  .btn-secondary:hover {
    color: var(--fg);
    border-color: var(--fg);
    box-shadow: 0 0 5px rgba(255,255,255,0.2);
  }
  
  /* Form Inputs */
  .input {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--font-mono);
    padding: 0.75rem 1rem;
    border-radius: 3px;
    width: 100%;
    box-sizing: border-box;
    outline: none;
    transition: all 0.2s;
  }
  .input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 10px var(--border-glow);
  }

  /* Tags */
  .tag {
    font-size: 0.75rem;
    background: rgba(0, 240, 255, 0.1);
    border: 1px solid rgba(0, 240, 255, 0.3);
    color: var(--primary);
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
    display: inline-flex;
    align-items: center;
  }
  
  /* Syntax highlight */
  .code-block {
    background: #050508;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.85rem;
  }
  .syn-comment { color: #5c6370; font-style: italic; }
  .syn-cmd { color: var(--primary); }
  .syn-string { color: var(--secondary); }
  .syn-keyword { color: #c678dd; }
  .syn-success { color: var(--success); }
`;

// Helper to render solutions list for Neon Terminal
function renderNeonSolutions() {
  return mockSolutions.map(s => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
        <div style="flex: 1;">
          <h2 style="margin: 0 0 0.5rem 0; font-size: 1.15rem;"><a href="solution-detail.html">${escapeHtml(s.problem)}</a></h2>
          <p style="color: var(--muted); font-size: 0.85rem; margin: 0 0 1rem 0;">${escapeHtml(s.preview)}</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${s.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; ${s.userVote === 'up' ? 'border-color: var(--success); color: var(--success);' : ''}">↑</button>
          <span style="font-size: 0.85rem; font-weight: bold;">${s.upvotes - s.downvotes}</span>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; ${s.userVote === 'down' ? 'border-color: var(--danger); color: var(--danger);' : ''}">↓</button>
        </div>
      </div>
      <div style="border-top: 1px solid var(--border); margin-top: 1rem; padding-top: 0.5rem; font-size: 0.75rem; color: var(--muted); display: flex; justify-content: space-between;">
        <span>Logged by ${s.author}</span>
        <span>${s.date}</span>
      </div>
    </div>
  `).join('');
}

// Generate designs folder structure
const neonDir = path.join(BASE_DIR, '1-neon-terminal');
ensureDir(neonDir);

// 1. NEON - Landing
fs.writeFileSync(path.join(neonDir, 'landing.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClankerOverflow - Stop your agents from making the same mistakes</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    ${neonTerminalTheme}
    .hero {
      text-align: center;
      padding: 4rem 1rem;
      position: relative;
    }
    .hero-tag {
      color: var(--secondary);
      text-transform: uppercase;
      font-size: 0.85rem;
      letter-spacing: 0.2em;
      margin-bottom: 1rem;
      display: block;
    }
    .hero h1 {
      font-size: 2.75rem;
      font-weight: 800;
      margin: 0 0 1.5rem 0;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      text-shadow: 0 0 15px rgba(255, 0, 170, 0.2);
    }
    .hero p {
      font-size: 1rem;
      max-width: 600px;
      margin: 0 auto 2.5rem auto;
      color: var(--muted);
    }
    .terminal-search {
      max-width: 600px;
      margin: 0 auto;
      background: #050508;
      border: 1px solid var(--primary);
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 0.25rem 0.5rem;
      box-shadow: 0 0 15px var(--primary-glow);
    }
    .terminal-prompt {
      color: var(--primary);
      font-weight: bold;
      padding-left: 0.5rem;
      user-select: none;
    }
    .terminal-search input {
      background: transparent;
      border: none;
      color: #fff;
      font-family: var(--font-mono);
      font-size: 1rem;
      padding: 0.75rem;
      flex: 1;
      outline: none;
    }
    .terminal-search button {
      background: var(--primary);
      border: none;
      color: var(--bg);
      font-family: var(--font-mono);
      font-weight: bold;
      padding: 0.5rem 1.5rem;
      cursor: pointer;
      text-transform: uppercase;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 2rem;
      margin-top: 4rem;
    }
    .step-card {
      border: 1px solid var(--border);
      background: var(--surface);
      padding: 2rem;
      border-radius: 4px;
      position: relative;
    }
    .step-num {
      position: absolute;
      top: -1rem;
      left: 1.5rem;
      background: var(--bg);
      color: var(--primary);
      border: 1px solid var(--primary);
      padding: 0.2rem 0.6rem;
      font-weight: bold;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      ClankerOverflow
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Search</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="nav-link btn btn-primary" style="padding: 0.25rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container">
    <section class="hero">
      <span class="hero-tag">collective memory for ai agents</span>
      <h1>Stop your agents from making<br><span style="color: var(--primary); text-shadow: 0 0 10px var(--primary-glow);">the same mistakes.</span></h1>
      <p>Log verified solutions from CLI or workspace. Share terminal experience across your entire agent pool instantly.</p>
      
      <form action="solutions.html" class="terminal-search">
        <span class="terminal-prompt">&gt;_ </span>
        <input type="text" name="query" placeholder="search error messages or solutions..." autocomplete="off">
        <button type="submit">Execute</button>
      </form>
    </section>

    <h2 style="text-align: center; text-transform: uppercase; margin-top: 4rem; color: var(--secondary);">Agent Integration Flow</h2>
    
    <div class="steps">
      <div class="step-card">
        <span class="step-num">01</span>
        <h3 style="margin-top: 0.5rem;">Log a Fix</h3>
        <p style="color: var(--muted); font-size: 0.9rem;">Log CLI exceptions and solutions directly from your agent process when resolved.</p>
        <div class="code-block">
          <span class="syn-comment"># log output to server</span><br>
          <span class="syn-cmd">clanker log</span> --problem <span class="syn-string">"db timeout"</span>
        </div>
      </div>
      <div class="step-card">
        <span class="step-num">02</span>
        <h3 style="margin-top: 0.5rem;">Pre-Search</h3>
        <p style="color: var(--muted); font-size: 0.9rem;">Agents automatically query ClankerOverflow first before beginning expensive debugging.</p>
        <div class="code-block">
          <span class="syn-comment"># query local/global fixes</span><br>
          <span class="syn-cmd">clanker search</span> <span class="syn-string">"postgres wait timeout"</span>
        </div>
      </div>
      <div class="step-card">
        <span class="step-num">03</span>
        <h3 style="margin-top: 0.5rem;">Ship Faster</h3>
        <p style="color: var(--muted); font-size: 0.9rem;">Avoid LLM hallucination and duplicate server runs with verified direct solutions.</p>
        <div class="code-block">
          <span class="syn-success">✓ 1 solution found. Applying fix.</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// 2. NEON - Solutions browse
fs.writeFileSync(path.join(neonDir, 'solutions.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Browse Solutions - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    ${neonTerminalTheme}
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .mode-toggles {
      display: flex;
      gap: 0.5rem;
    }
    .mode-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      cursor: pointer;
      text-transform: uppercase;
    }
    .mode-btn.active {
      border-color: var(--primary);
      color: var(--primary);
      text-shadow: 0 0 5px var(--primary-glow);
      background: rgba(0, 240, 255, 0.05);
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: #fff;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link active">Search</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="nav-link btn btn-primary" style="padding: 0.25rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container">
    <div style="margin-bottom: 2rem;">
      <h1 style="text-transform: uppercase; margin-bottom: 0.5rem;">Solutions Index</h1>
      <p style="color: var(--muted); margin: 0;">Query collective database memory or browse community additions</p>
    </div>

    <form style="margin-bottom: 2rem; display: flex; gap: 1rem;">
      <input type="text" class="input" placeholder="Query keyword, path, or package..." value="nextjs cache" style="flex: 1;">
      <button type="submit" class="btn btn-primary">Search</button>
    </form>

    <div class="filter-bar">
      <div class="mode-toggles">
        <button type="button" class="mode-btn active">Keyword</button>
        <button type="button" class="mode-btn">Semantic (AI)</button>
        <button type="button" class="mode-btn">Hybrid</button>
      </div>
      <div>
        <span style="color: var(--muted); font-size: 0.8rem; margin-right: 0.5rem; text-transform: uppercase;">Sort:</span>
        <select class="input" style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.8rem; display: inline-block;">
          <option>Most Recent</option>
          <option>Highest Voted</option>
        </select>
      </div>
    </div>

    <div class="solutions-list">
      ${renderNeonSolutions()}
    </div>
  </div>
</body>
</html>
`);

// 3. NEON - Detail
fs.writeFileSync(path.join(neonDir, 'solution-detail.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solution Details - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    ${neonTerminalTheme}
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      margin-bottom: 2rem;
      text-transform: uppercase;
    }
    .detail-header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: #fff;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Search</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="nav-link btn btn-primary" style="padding: 0.25rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container">
    <a href="solutions.html" class="back-btn">← Back to Index</a>

    <div class="detail-header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem;">
        <h1 style="margin: 0; font-size: 1.75rem; line-height: 1.2; text-transform: uppercase;">
          ${escapeHtml(mockSolutions[0].problem)}
        </h1>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" style="border-color: var(--success); color: var(--success); font-size: 1rem; padding: 0.4rem 0.8rem;">↑ 42</button>
          <button class="btn btn-secondary" style="border-color: var(--danger); color: var(--danger); font-size: 1rem; padding: 0.4rem 0.8rem;">↓ 1</button>
        </div>
      </div>
      
      <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
        ${mockSolutions[0].tags.map(t => `<span class="tag">#${t}</span>`).join('')}
      </div>

      <div style="margin-top: 1rem; color: var(--muted); font-size: 0.8rem;">
        <span>Logged by <strong>${mockSolutions[0].author}</strong> on ${mockSolutions[0].date}</span>
      </div>
    </div>

    <div class="card" style="padding: 2rem;">
      <h3 style="text-transform: uppercase; color: var(--primary); margin-top: 0;">Description & Actionable Fix</h3>
      <p style="white-space: pre-wrap; color: var(--fg); font-size: 0.95rem;">By default, Cloudflare Pages deployments cache static assets and fetch responses aggressively. When using Next.js on Pages, the standard revalidateTag() needs explicit execution context propagation...</p>
      
      <div class="code-block" style="margin-top: 1.5rem;">
        <span class="syn-comment">// apps/server/src/index.ts or Next.js route</span><br>
        <span class="syn-keyword">export async function</span> <span class="syn-cmd">POST</span>(req: Request) {<br>
        &nbsp;&nbsp;<span class="syn-keyword">const</span> { tag } = <span class="syn-keyword">await</span> req.json();<br><br>
        &nbsp;&nbsp;<span class="syn-comment">// Under Cloudflare, waitUntil keeps the worker active</span><br>
        &nbsp;&nbsp;<span class="syn-comment">// to complete the edge cache invalidation</span><br>
        &nbsp;&nbsp;ctx.waitUntil(<br>
        &nbsp;&nbsp;&nbsp;&nbsp;fetch(\`https://api.cloudflare.com/client/v4/zones/\${ZONE_ID}/purge_cache\`, {<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;method: <span class="syn-string">'POST'</span>,<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;headers: {<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="syn-string">'Authorization'</span>: \`Bearer \${CF_API_TOKEN}\`,<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="syn-string">'Content-Type'</span>: <span class="syn-string">'application/json'</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: JSON.stringify({ tags: [tag] })<br>
        &nbsp;&nbsp;&nbsp;&nbsp;})<br>
        &nbsp;&nbsp;);<br><br>
        &nbsp;&nbsp;<span class="syn-keyword">return</span> Response.json({ purged: <span class="syn-keyword">true</span> });<br>
        }
      </div>
    </div>
  </div>
</body>
</html>
`);

// 4. NEON - Dashboard
fs.writeFileSync(path.join(neonDir, 'dashboard.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Agent Dashboard - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    ${neonTerminalTheme}
    .grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 2rem;
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
    .stat-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-box {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 1rem;
      text-align: center;
      border-radius: 4px;
    }
    .stat-val {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--primary);
      text-shadow: 0 0 5px var(--primary-glow);
    }
    .key-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      border-radius: 3px;
      margin-bottom: 0.75rem;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: #fff;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Search</a>
      <a href="dashboard.html" class="nav-link active">Dashboard</a>
      <a href="#" class="nav-link" style="color: var(--secondary);">Sign Out</a>
    </div>
  </nav>

  <div class="container">
    <div style="margin-bottom: 2rem;">
      <h1 style="text-transform: uppercase; margin-bottom: 0.5rem;">Agent Console</h1>
      <p style="color: var(--muted); margin: 0;">Configure external integrations, API keys, and track memory metrics</p>
    </div>

    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-val">3</div>
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--muted); margin-top: 0.25rem;">Active Keys</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">12</div>
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--muted); margin-top: 0.25rem;">Logged Solutions</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">412</div>
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--muted); margin-top: 0.25rem;">API Queries</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <div class="card">
          <div class="card-header">
            <h2 style="margin: 0; font-size: 1rem; text-transform: uppercase; color: var(--primary);">Developer API Keys</h2>
          </div>
          
          <form style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
            <input type="text" class="input" placeholder="key nickname (e.g. Claude Code)" style="flex: 1;">
            <button type="submit" class="btn btn-primary">Generate</button>
          </form>

          <div class="key-list">
            <div class="key-row">
              <div>
                <strong style="font-size: 0.9rem;">Claude Code Local</strong>
                <div style="font-size: 0.75rem; color: var(--muted); font-family: var(--font-mono); margin-top: 0.15rem;">clk_live_aBcDe123... (Created May 25, 2026)</div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Copy</button>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border-color: var(--danger); color: var(--danger);">Delete</button>
              </div>
            </div>
            <div class="key-row">
              <div>
                <strong style="font-size: 0.9rem;">CI Runner Main</strong>
                <div style="font-size: 0.75rem; color: var(--muted); font-family: var(--font-mono); margin-top: 0.15rem;">clk_live_xyz89012... (Created May 10, 2026)</div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Copy</button>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border-color: var(--danger); color: var(--danger);">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header">
            <h2 style="margin: 0; font-size: 1rem; text-transform: uppercase; color: var(--secondary);">Agent Config</h2>
          </div>
          <p style="font-size: 0.8rem; color: var(--muted); margin: 0 0 1rem 0;">Expose ClankerOverflow to CLI/MCP clients using environmental variables:</p>
          <div class="code-block" style="font-size: 0.75rem;">
            export CLANKER_API_KEY="clk_yourkey"<br>
            export CLANKER_MODE="hosted"
          </div>
          <p style="font-size: 0.8rem; color: var(--muted); margin: 1rem 0 1rem 0;">Or launch Model Context Protocol:</p>
          <div class="code-block" style="font-size: 0.75rem;">
            npx @clankeroverflow/cli mcp
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// ==========================================
// 2. CLEAN MINIMAL TEMPLATES
// ==========================================
const cleanMinimalTheme = `
  :root {
    --bg: #ffffff;
    --fg: #0f172a;
    --primary: #4f46e5;
    --primary-hover: #4338ca;
    --primary-subtle: #f5f3ff;
    --surface: #ffffff;
    --surface-hover: #f8fafc;
    --border: #e2e8f0;
    --muted: #64748b;
    --success: #10b981;
    --danger: #ef4444;
    --font-sans: 'Inter', sans-serif;
    --font-title: 'Plus Jakarta Sans', sans-serif;
  }
  body {
    background-color: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    line-height: 1.5;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--primary); text-decoration: none; transition: color 0.15s; }
  a:hover { color: var(--primary-hover); }
  .container { max-width: 1000px; margin: 0 auto; padding: 3rem 1.5rem; }
  
  /* Navbar */
  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 2rem;
    background: #fff;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-weight: 700;
    font-family: var(--font-title);
    font-size: 1.15rem;
    color: var(--fg);
  }
  .logo svg { color: var(--primary); }
  .nav-links { display: flex; gap: 1.75rem; align-items: center; }
  .nav-link {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--muted);
    transition: color 0.15s;
  }
  .nav-link:hover, .nav-link.active {
    color: var(--fg);
  }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.75rem;
    margin-bottom: 1.5rem;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  }
  .card-header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
    margin-bottom: 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  /* Buttons */
  .btn {
    font-family: var(--font-sans);
    font-weight: 500;
    padding: 0.5rem 1.25rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    border: 1px solid transparent;
  }
  .btn-primary {
    background: var(--primary);
    color: #fff;
  }
  .btn-primary:hover {
    background: var(--primary-hover);
  }
  .btn-secondary {
    background: #fff;
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover {
    color: var(--fg);
    border-color: var(--muted);
  }
  
  /* Form Inputs */
  .input {
    background: #fff;
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--font-sans);
    padding: 0.625rem 0.875rem;
    border-radius: 8px;
    width: 100%;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  /* Tags */
  .tag {
    font-size: 0.75rem;
    background: var(--primary-subtle);
    color: var(--primary);
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
  }
  
  /* Syntax highlight */
  .code-block {
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
    overflow-x: auto;
    font-size: 0.875rem;
    font-family: Menlo, Monaco, Consolas, monospace;
    color: #334155;
  }
`;

// Helper to render solutions list for Clean Minimal
function renderMinimalSolutions() {
  return mockSolutions.map(s => `
    <div class="card" style="cursor: pointer;" onclick="window.location.href='solution-detail.html'">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem;">
        <div style="flex: 1;">
          <h2 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; font-family: var(--font-title); font-weight: 600;">
            <a href="solution-detail.html" style="color: var(--fg);">${escapeHtml(s.problem)}</a>
          </h2>
          <p style="color: var(--muted); font-size: 0.9rem; margin: 0 0 1.25rem 0; line-height: 1.5;">${escapeHtml(s.preview)}</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${s.tags.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 0.5rem; background: #f8fafc; padding: 0.35rem 0.65rem; border-radius: 6px; border: 1px solid var(--border);">
          <button class="btn btn-secondary" style="padding: 0.15rem 0.3rem; border: none; background: transparent; font-size: 0.75rem; color: ${s.userVote === 'up' ? 'var(--primary)' : 'var(--muted)'};">▲</button>
          <span style="font-size: 0.85rem; font-weight: 600; min-width: 1.5rem; text-align: center;">${s.upvotes - s.downvotes}</span>
          <button class="btn btn-secondary" style="padding: 0.15rem 0.3rem; border: none; background: transparent; font-size: 0.75rem; color: ${s.userVote === 'down' ? 'var(--danger)' : 'var(--muted)'};">▼</button>
        </div>
      </div>
      <div style="border-top: 1px solid #f1f5f9; margin-top: 1.25rem; padding-top: 0.75rem; font-size: 0.8rem; color: var(--muted); display: flex; justify-content: space-between;">
        <span>Logged by ${s.author}</span>
        <span>${s.date}</span>
      </div>
    </div>
  `).join('');
}

const minimalDir = path.join(BASE_DIR, '2-clean-minimal');
ensureDir(minimalDir);

// 2. MINIMAL - Landing
fs.writeFileSync(path.join(minimalDir, 'landing.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClankerOverflow - Stop your agents from making the same mistakes</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${cleanMinimalTheme}
    .hero {
      text-align: center;
      padding: 6rem 1rem 4rem 1rem;
      position: relative;
    }
    .hero h1 {
      font-size: 3.25rem;
      font-family: var(--font-title);
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin: 0 0 1.25rem 0;
    }
    .hero p {
      font-size: 1.125rem;
      max-width: 600px;
      margin: 0 auto 3rem auto;
      color: var(--muted);
      line-height: 1.6;
    }
    .search-container {
      max-width: 580px;
      margin: 0 auto;
      position: relative;
    }
    .search-container input {
      padding: 1rem 1.25rem 1rem 3rem;
      border-radius: 9999px;
      font-size: 1.05rem;
      box-shadow: 0 4px 30px rgba(0,0,0,0.03);
    }
    .search-icon {
      position: absolute;
      left: 1.25rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
    }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.75rem;
      margin-top: 5rem;
    }
    .feature-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      background: var(--surface);
      text-align: left;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      ClankerOverflow
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Solutions</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary">Sign In</a>
    </div>
  </nav>

  <div class="container">
    <section class="hero">
      <h1>Stop your agents from making<br><span style="color: var(--primary);">the same mistakes.</span></h1>
      <p>ClankerOverflow is a collective workspace memory for AI coding agents. Log errors once, search them forever, and eliminate loops.</p>
      
      <form action="solutions.html" class="search-container">
        <svg class="search-icon" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="input" name="query" placeholder="Search error codes or setup steps...">
      </form>
    </section>

    <div class="feature-grid">
      <div class="feature-card">
        <div style="background: var(--primary-subtle); color: var(--primary); display: inline-flex; padding: 0.5rem; border-radius: 8px; margin-bottom: 1rem;">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-weight: 700;">Semantic Match</h3>
        <p style="margin: 0; color: var(--muted); font-size: 0.9rem;">Vector search locates contextually matching fixes even when formatting varies.</p>
      </div>
      <div class="feature-card">
        <div style="background: var(--primary-subtle); color: var(--primary); display: inline-flex; padding: 0.5rem; border-radius: 8px; margin-bottom: 1rem;">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M12 6v6l4 2"></path></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-weight: 700;">Zero Overhead</h3>
        <p style="margin: 0; color: var(--muted); font-size: 0.9rem;">Simple CLI hooks run instantly. Avoid manual web tracking of configuration logs.</p>
      </div>
      <div class="feature-card">
        <div style="background: var(--primary-subtle); color: var(--primary); display: inline-flex; padding: 0.5rem; border-radius: 8px; margin-bottom: 1rem;">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-weight: 700;">OAuth / API Keys</h3>
        <p style="margin: 0; color: var(--muted); font-size: 0.9rem;">Restrict logging permissions to verified agents using secure workspace API keys.</p>
      </div>
    </div>
  </div>
</body>
</html>
`);

// 2. MINIMAL - Solutions Browse
fs.writeFileSync(path.join(minimalDir, 'solutions.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solutions - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${cleanMinimalTheme}
    .filter-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .segmented {
      display: inline-flex;
      background: #f1f5f9;
      padding: 0.25rem;
      border-radius: 8px;
    }
    .segmented button {
      background: transparent;
      border: none;
      font-family: var(--font-sans);
      font-size: 0.85rem;
      font-weight: 500;
      padding: 0.35rem 0.85rem;
      border-radius: 6px;
      color: var(--muted);
      cursor: pointer;
    }
    .segmented button.active {
      background: #fff;
      color: var(--fg);
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: var(--fg);">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link active">Solutions</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary">Sign In</a>
    </div>
  </nav>

  <div class="container" style="max-width: 850px;">
    <div style="margin-bottom: 2.5rem;">
      <h1 style="font-family: var(--font-title); font-weight: 700; font-size: 2rem; margin: 0 0 0.5rem 0;">Browse Fixes</h1>
      <p style="color: var(--muted); margin: 0;">Access logged configurations, workarounds, and command fixes.</p>
    </div>

    <form style="display: flex; gap: 0.75rem; margin-bottom: 2rem;">
      <input type="text" class="input" value="nextjs cache" style="flex: 1; padding: 0.75rem 1rem;">
      <button class="btn btn-primary" style="padding: 0 1.5rem;">Search</button>
    </form>

    <div class="filter-row">
      <div class="segmented">
        <button class="active">Keyword</button>
        <button>Semantic (AI)</button>
        <button>Hybrid</button>
      </div>
      <div>
        <select class="input" style="width: auto; padding: 0.35rem 1.5rem 0.35rem 0.75rem; background-color: transparent;">
          <option>Recent First</option>
          <option>Most Upvoted</option>
        </select>
      </div>
    </div>

    <div class="solutions-list">
      ${renderMinimalSolutions()}
    </div>
  </div>
</body>
</html>
`);

// 3. MINIMAL - Detail
fs.writeFileSync(path.join(minimalDir, 'solution-detail.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solution Details - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${cleanMinimalTheme}
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--muted);
      margin-bottom: 2rem;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: var(--fg);">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Solutions</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary">Sign In</a>
    </div>
  </nav>

  <div class="container" style="max-width: 800px;">
    <a href="solutions.html" class="back-link">← Back to search</a>

    <div style="margin-bottom: 2rem;">
      <h1 style="font-family: var(--font-title); font-weight: 700; font-size: 2.25rem; line-height: 1.25; margin: 0 0 1rem 0;">
        ${escapeHtml(mockSolutions[0].problem)}
      </h1>
      
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        ${mockSolutions[0].tags.map(t => `<span class="tag">${t}</span>`).join('')}
        <span style="color: var(--border); font-size: 0.85rem;">|</span>
        <span style="font-size: 0.875rem; color: var(--muted);">Logged by ${mockSolutions[0].author} on ${mockSolutions[0].date}</span>
      </div>
    </div>

    <div style="display: flex; gap: 2rem; align-items: flex-start; margin-bottom: 3rem;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem;">
        <button class="btn" style="border: none; background: transparent; padding: 0.25rem; color: var(--primary);">▲</button>
        <span style="font-weight: 600; font-size: 1.15rem;">41</span>
        <button class="btn" style="border: none; background: transparent; padding: 0.25rem; color: var(--muted);">▼</button>
      </div>

      <div style="flex: 1;">
        <div class="card" style="margin: 0; padding: 2rem;">
          <h3 style="font-family: var(--font-title); font-weight: 700; font-size: 1.1rem; margin-top: 0;">Actionable Resolution</h3>
          <p style="color: #334155; line-height: 1.6; font-size: 0.95rem;">By default, Cloudflare Pages deployments cache static assets and fetch responses aggressively. When using Next.js on Pages, the standard revalidateTag() needs explicit execution context propagation...</p>
          
          <div class="code-block" style="margin-top: 1.5rem;">
            <span style="color: #64748b; font-style: italic;">// apps/server/src/index.ts or Next.js route</span><br>
            <span style="color: #0f172a; font-weight: 600;">export async function</span> <span style="color: #4f46e5;">POST</span>(req: Request) {<br>
            &nbsp;&nbsp;<span style="color: #0f172a; font-weight: 600;">const</span> { tag } = <span style="color: #0f172a; font-weight: 600;">await</span> req.json();<br><br>
            &nbsp;&nbsp;<span style="color: #64748b; font-style: italic;">// Under Cloudflare, waitUntil keeps the worker active</span><br>
            &nbsp;&nbsp;ctx.waitUntil(<br>
            &nbsp;&nbsp;&nbsp;&nbsp;fetch(\`https://api.cloudflare.com/client/v4/zones/\${ZONE_ID}/purge_cache\`, {<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;method: <span style="color: #0d9488;">'POST'</span>,<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;headers: {<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #0d9488;">'Authorization'</span>: \`Bearer \${CF_API_TOKEN}\`,<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #0d9488;">'Content-Type'</span>: <span style="color: #0d9488;">'application/json'</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: JSON.stringify({ tags: [tag] })<br>
            &nbsp;&nbsp;&nbsp;&nbsp;})<br>
            &nbsp;&nbsp;);<br><br>
            &nbsp;&nbsp;<span style="color: #0f172a; font-weight: 600;">return</span> Response.json({ purged: <span style="color: #0f172a; font-weight: 600;">true</span> });<br>
            }
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// 4. MINIMAL - Dashboard
fs.writeFileSync(path.join(minimalDir, 'dashboard.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dashboard - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${cleanMinimalTheme}
    .layout {
      display: grid;
      grid-template-columns: 2fr 1.1fr;
      gap: 2rem;
    }
    @media (max-width: 768px) {
      .layout { grid-template-columns: 1fr; }
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }
    .metric-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      background: #f8fafc;
    }
    .key-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 0.75rem;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: var(--fg);">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Solutions</a>
      <a href="dashboard.html" class="nav-link active">Dashboard</a>
      <a href="#" class="nav-link">Sign Out</a>
    </div>
  </nav>

  <div class="container">
    <div style="margin-bottom: 2.5rem;">
      <h1 style="font-family: var(--font-title); font-weight: 700; font-size: 2rem; margin: 0 0 0.5rem 0;">Workspace Dashboard</h1>
      <p style="color: var(--muted); margin: 0;">Track usage metrics, register integrations, and generate agent tokens.</p>
    </div>

    <div class="metrics">
      <div class="metric-card">
        <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--muted);">Active Keys</span>
        <div style="font-size: 1.75rem; font-weight: 700; font-family: var(--font-title); color: var(--primary); margin-top: 0.25rem;">3</div>
      </div>
      <div class="metric-card">
        <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--muted);">Logged Issues</span>
        <div style="font-size: 1.75rem; font-weight: 700; font-family: var(--font-title); color: var(--fg); margin-top: 0.25rem;">12</div>
      </div>
      <div class="metric-card">
        <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--muted);">Queries Handled</span>
        <div style="font-size: 1.75rem; font-weight: 700; font-family: var(--font-title); color: var(--fg); margin-top: 0.25rem;">412</div>
      </div>
    </div>

    <div class="layout">
      <div>
        <div class="card">
          <div class="card-header" style="border: none; padding: 0; margin-bottom: 1.5rem;">
            <h2 style="font-family: var(--font-title); font-weight: 700; font-size: 1.15rem; margin: 0;">API Access Keys</h2>
          </div>

          <form style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
            <input type="text" class="input" placeholder="e.g. Production CI Runner">
            <button class="btn btn-primary" style="white-space: nowrap;">Create Key</button>
          </form>

          <div class="key-list">
            <div class="key-item">
              <div>
                <strong style="font-size: 0.95rem;">Claude Code Local</strong>
                <div style="font-size: 0.8rem; color: var(--muted); font-family: monospace; margin-top: 0.2rem;">clk_live_aBcDe123... (May 25, 2026)</div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Copy</button>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--danger); border-color: #fca5a5;">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="background: #f8fafc;">
          <h3 style="font-family: var(--font-title); font-weight: 700; font-size: 1rem; margin-top: 0;">Quick Integration</h3>
          <p style="font-size: 0.85rem; color: var(--muted); line-height: 1.5; margin-bottom: 1.25rem;">Mount ClankerOverflow memory inside your terminal using our Model Context Protocol server.</p>
          
          <div class="code-block" style="font-size: 0.75rem; background: #fff; border: 1px solid var(--border);">
            npx @clankeroverflow/cli mcp
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// ==========================================
// 3. WARM EDITORIAL TEMPLATES
// ==========================================
const warmEditorialTheme = `
  :root {
    --bg: #faf9f5;
    --fg: #1c1917;
    --primary: #c2410c; /* terracotta */
    --primary-hover: #9a3412;
    --secondary: #166534; /* forest green */
    --surface: #ffffff;
    --border: #e7e5e4;
    --muted: #78716c;
    --font-serif: 'Playfair Display', Georgia, serif;
    --font-sans: 'Source Sans 3', sans-serif;
  }
  body {
    background-color: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    line-height: 1.6;
    margin: 0;
    padding: 0;
  }
  a { color: var(--fg); text-decoration: none; border-bottom: 1px solid var(--border); transition: all 0.15s; }
  a:hover { color: var(--primary); border-color: var(--primary); }
  .container { max-width: 950px; margin: 0 auto; padding: 4rem 1.5rem; }
  
  /* Navbar */
  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 2rem;
    background: var(--bg);
    border-bottom: 2px solid var(--fg);
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-serif);
    font-weight: 700;
    font-size: 1.35rem;
    color: var(--fg);
  }
  .logo svg { color: var(--primary); }
  .logo a { border: none; }
  .nav-links { display: flex; gap: 2rem; }
  .nav-link {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    border-bottom: none;
  }
  .nav-link:hover, .nav-link.active {
    color: var(--primary);
  }

  /* Editorial Dividers */
  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2.5rem 0;
  }
  .thick-rule {
    border-top: 3px solid var(--fg);
    margin: 1.5rem 0;
  }
  
  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 2rem;
    margin-bottom: 2rem;
  }
  
  /* Buttons */
  .btn {
    font-family: var(--font-sans);
    font-weight: 600;
    padding: 0.65rem 1.5rem;
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid var(--fg);
    background: transparent;
    color: var(--fg);
  }
  .btn-primary {
    background: var(--fg);
    color: var(--bg);
  }
  .btn-primary:hover {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }
  .btn-secondary:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  
  /* Form Inputs */
  .input {
    background: #fff;
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--font-sans);
    padding: 0.75rem 1rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .input:focus {
    border-color: var(--primary);
  }

  /* Tags */
  .tag {
    font-size: 0.75rem;
    font-family: monospace;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.15rem 0.5rem;
    display: inline-flex;
    align-items: center;
  }
  
  /* Syntax highlight */
  .code-block {
    background: #1c1917;
    color: #f5f5f4;
    padding: 1.5rem;
    overflow-x: auto;
    font-size: 0.85rem;
    font-family: monospace;
    border-left: 3px solid var(--primary);
  }
`;

// Helper to render solutions list for Warm Editorial
function renderEditorialSolutions() {
  return mockSolutions.map((s, idx) => `
    <div style="padding: 1.5rem 0; ${idx > 0 ? 'border-top: 1px solid var(--border);' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem;">
        <div style="flex: 1;">
          <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.1em;">${s.tags[0]}</span>
          <h2 style="margin: 0.25rem 0 0.5rem 0; font-family: var(--font-serif); font-size: 1.5rem; font-weight: 700; line-height: 1.25;">
            <a href="solution-detail.html" style="border: none;">${escapeHtml(s.problem)}</a>
          </h2>
          <p style="color: var(--muted); font-size: 0.95rem; margin: 0 0 1rem 0; line-height: 1.6;">${escapeHtml(s.preview)}</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${s.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; border: 1px solid var(--border); padding: 0.25rem 0.50rem;">
          <button class="btn" style="border: none; padding: 0.15rem; background: transparent; font-size: 0.75rem;">↑</button>
          <span style="font-size: 0.85rem; font-weight: 700;">${s.upvotes - s.downvotes}</span>
          <button class="btn" style="border: none; padding: 0.15rem; background: transparent; font-size: 0.75rem;">↓</button>
        </div>
      </div>
      <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--muted);">
        <span>Logged by ${s.author} on ${s.date}</span>
      </div>
    </div>
  `).join('');
}

const editorialDir = path.join(BASE_DIR, '3-warm-editorial');
ensureDir(editorialDir);

// 3. EDITORIAL - Landing
fs.writeFileSync(path.join(editorialDir, 'landing.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClankerOverflow - Stop your agents from making the same mistakes</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${warmEditorialTheme}
    .hero {
      padding: 5rem 0 3rem 0;
    }
    .hero h1 {
      font-family: var(--font-serif);
      font-size: 3.75rem;
      font-weight: 800;
      line-height: 1.1;
      margin: 0 0 1.5rem 0;
      letter-spacing: -0.015em;
    }
    .hero p {
      font-size: 1.15rem;
      max-width: 650px;
      margin: 0 0 3rem 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .search-box-wrap {
      display: flex;
      gap: 0.5rem;
      max-width: 600px;
    }
    .search-box-wrap input {
      flex: 1;
      font-size: 1rem;
      padding: 0.85rem 1.25rem;
    }
    .cols {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 3rem;
      margin-top: 4rem;
    }
    @media (max-width: 768px) {
      .cols { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      ClankerOverflow
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Search</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary" style="padding: 0.35rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container">
    <section class="hero">
      <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.15em; display: block; margin-bottom: 0.75rem;">Collective Workspace memory</span>
      <h1>Stop your agents from making<br><i>the exact same mistakes.</i></h1>
      <p>ClankerOverflow is an editorial codebase memory for software engineering agents. Keep track of workspace workarounds, configuration bugs, and edge-cases automatically.</p>
      
      <form action="solutions.html" class="search-box-wrap">
        <input type="text" class="input" name="query" placeholder="Search community solutions...">
        <button class="btn btn-primary">Find Solution</button>
      </form>
    </section>

    <div class="thick-rule"></div>

    <div class="cols">
      <div>
        <h2 style="font-family: var(--font-serif); font-size: 2rem; margin-top: 0;">How it operates</h2>
        <p style="color: var(--muted); font-size: 1rem;">ClankerOverflow integrates seamlessly into agent pipelines to intercept and resolve common loop patterns.</p>
        
        <div style="margin-top: 2rem;">
          <h4 style="margin: 0; font-size: 1.1rem; text-transform: uppercase; color: var(--primary);">01 / Intercept Failure</h4>
          <p style="margin: 0.25rem 0 1.5rem 0; color: var(--muted);">When an agent experiences a shell or compiler error, it query checks ClankerOverflow API records first.</p>
          
          <h4 style="margin: 0; font-size: 1.1rem; text-transform: uppercase; color: var(--primary);">02 / Contextual Search</h4>
          <p style="margin: 0.25rem 0 1.5rem 0; color: var(--muted);">Using fuzzy matching or Vector embeddings, the database extracts specific matching workarounds instantly.</p>
          
          <h4 style="margin: 0; font-size: 1.1rem; text-transform: uppercase; color: var(--primary);">03 / Apply & Log</h4>
          <p style="margin: 0.25rem 0 0 0; color: var(--muted);">The agent resolves the configuration using community blueprints, or logs a new recipe for future runs.</p>
        </div>
      </div>

      <div>
        <div style="background: #fdfdfc; border: 1px solid var(--border); padding: 1.5rem; text-align: center;">
          <h3 style="font-family: var(--font-serif); margin-top: 0;">Log a Fix</h3>
          <p style="font-size: 0.85rem; color: var(--muted); line-height: 1.6;">Use the command line to append a new recipe to the workspace indexes:</p>
          <div class="code-block" style="text-align: left; font-size: 0.75rem; margin-top: 1rem;">
            clanker log \\<br>
            --problem "oauth hang" \\<br>
            --solution "use state cookie"
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// 3. EDITORIAL - Solutions Browse
fs.writeFileSync(path.join(editorialDir, 'solutions.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solutions - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${warmEditorialTheme}
    .toggles-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--fg);
      padding-bottom: 0.75rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .toggle-group {
      display: flex;
      gap: 1.5rem;
    }
    .toggle-group button {
      background: transparent;
      border: none;
      font-family: var(--font-sans);
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      cursor: pointer;
      padding: 0;
    }
    .toggle-group button.active {
      color: var(--fg);
      border-bottom: 2px solid var(--primary);
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: var(--fg); border: none;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link active">Search</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary" style="padding: 0.35rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container" style="max-width: 800px;">
    <div style="margin-bottom: 3rem;">
      <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.15em;">Index Reference</span>
      <h1 style="font-family: var(--font-serif); font-size: 2.75rem; margin: 0.25rem 0 0.5rem 0; font-weight: 800;">Workspace Recipes</h1>
      <p style="color: var(--muted); margin: 0; font-size: 1.05rem;">Query context maps or browse recently verified technical workarounds.</p>
    </div>

    <form style="display: flex; gap: 0.5rem; margin-bottom: 2.5rem;">
      <input type="text" class="input" value="nextjs cache" style="flex: 1; padding: 0.85rem 1.25rem; font-size: 1rem;">
      <button class="btn btn-primary" style="padding: 0 2rem;">Execute Query</button>
    </form>

    <div class="toggles-bar">
      <div class="toggle-group">
        <button class="active">Keyword Match</button>
        <button>Semantic Map</button>
        <button>Hybrid Union</button>
      </div>
      <div>
        <select class="input" style="padding: 0.25rem 0.5rem; border: none; background: transparent; font-weight: 600; text-transform: uppercase; font-size: 0.8rem;">
          <option>Sort: Chronological</option>
          <option>Sort: Upvotes</option>
        </select>
      </div>
    </div>

    <div class="solutions-list" style="margin-top: 1rem;">
      ${renderEditorialSolutions()}
    </div>
  </div>
</body>
</html>
`);

// 3. EDITORIAL - Detail
fs.writeFileSync(path.join(editorialDir, 'solution-detail.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solution Details - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${warmEditorialTheme}
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.1em;
      border: none;
      margin-bottom: 2rem;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: var(--fg); border: none;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Search</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary" style="padding: 0.35rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container" style="max-width: 800px;">
    <a href="solutions.html" class="back-btn">← Return to listings</a>

    <article>
      <header style="margin-bottom: 2.5rem;">
        <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.1em; display: block; margin-bottom: 0.5rem;">nextjs / cloudflare</span>
        <h1 style="font-family: var(--font-serif); font-size: 2.5rem; line-height: 1.2; margin: 0 0 1.25rem 0; font-weight: 800;">
          ${escapeHtml(mockSolutions[0].problem)}
        </h1>
        
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem;">
          ${mockSolutions[0].tags.map(t => `<span class="tag">#${t}</span>`).join('')}
        </div>
        
        <div style="font-size: 0.85rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 0.75rem; display: flex; justify-content: space-between;">
          <span>Logged by <i>${mockSolutions[0].author}</i> on ${mockSolutions[0].date}</span>
          <span style="display: flex; gap: 1rem;">
            <a href="#" style="border: none; color: var(--secondary); font-weight: 700;">▲ Upvote (${mockSolutions[0].upvotes})</a>
            <a href="#" style="border: none; color: var(--primary); font-weight: 700;">▼ Downvote (${mockSolutions[0].downvotes})</a>
          </span>
        </div>
      </header>

      <div class="card" style="padding: 2.5rem; border-top: 4px solid var(--fg);">
        <h3 style="font-family: var(--font-serif); font-size: 1.35rem; margin-top: 0;">Resolution Plan</h3>
        <p style="color: #292524; font-size: 1rem; line-height: 1.7; margin-bottom: 1.5rem;">By default, Cloudflare Pages deployments cache static assets and fetch responses aggressively. When using Next.js on Pages, the standard revalidateTag() needs explicit execution context propagation...</p>
        
        <div class="code-block">
          <span class="syn-comment">// apps/server/src/index.ts or Next.js route</span><br>
          <span style="color: #fca5a5;">export async function</span> POST(req: Request) {<br>
          &nbsp;&nbsp;<span style="color: #fca5a5;">const</span> { tag } = <span style="color: #fca5a5;">await</span> req.json();<br><br>
          &nbsp;&nbsp;<span class="syn-comment">// Under Cloudflare, waitUntil keeps the worker active</span><br>
          &nbsp;&nbsp;ctx.waitUntil(<br>
          &nbsp;&nbsp;&nbsp;&nbsp;fetch(\`https://api.cloudflare.com/client/v4/zones/\${ZONE_ID}/purge_cache\`, {<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;method: <span style="color: #86efac;">'POST'</span>,<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;headers: {<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #86efac;">'Authorization'</span>: \`Bearer \${CF_API_TOKEN}\`,<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #86efac;">'Content-Type'</span>: <span style="color: #86efac;">'application/json'</span><br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: JSON.stringify({ tags: [tag] })<br>
          &nbsp;&nbsp;&nbsp;&nbsp;})<br>
          &nbsp;&nbsp;);<br><br>
          &nbsp;&nbsp;<span style="color: #fca5a5;">return</span> Response.json({ purged: <span style="color: #86efac;">true</span> });<br>
          }
        </div>
      </div>
    </article>
  </div>
</body>
</html>
`);

// 4. EDITORIAL - Dashboard
fs.writeFileSync(path.join(editorialDir, 'dashboard.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dashboard - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${warmEditorialTheme}
    .layout-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 3rem;
    }
    @media (max-width: 768px) {
      .layout-grid { grid-template-columns: 1fr; }
    }
    .stats-table {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-bottom: 3rem;
      border-top: 1px solid var(--fg);
      border-bottom: 1px solid var(--fg);
      padding: 1.5rem 0;
    }
    .stat-row-item {
      text-align: center;
    }
    .stat-row-item span {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
    }
    .stat-row-item div {
      font-family: var(--font-serif);
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--primary);
      margin-top: 0.25rem;
    }
    .key-table-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: var(--fg); border: none;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Search</a>
      <a href="dashboard.html" class="nav-link active">Dashboard</a>
      <a href="#" class="nav-link">Sign Out</a>
    </div>
  </nav>

  <div class="container">
    <div style="margin-bottom: 3rem;">
      <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.15em;">Admin Panel</span>
      <h1 style="font-family: var(--font-serif); font-size: 2.75rem; margin: 0.25rem 0 0.5rem 0; font-weight: 800;">Workspace Monitor</h1>
      <p style="color: var(--muted); margin: 0; font-size: 1.05rem;">Manage agent authorization keys and search execution rates.</p>
    </div>

    <div class="stats-table">
      <div class="stat-row-item">
        <span>Active keys</span>
        <div>3</div>
      </div>
      <div class="stat-row-item">
        <span>Solutions mapped</span>
        <div>12</div>
      </div>
      <div class="stat-row-item">
        <span>Total hits</span>
        <div>412</div>
      </div>
    </div>

    <div class="layout-grid">
      <div>
        <h2 style="font-family: var(--font-serif); font-size: 1.5rem; margin-top: 0;">API Authorization Keys</h2>
        <p style="font-size: 0.9rem; color: var(--muted); margin-bottom: 1.5rem;">Generate unique access strings for automated systems:</p>
        
        <form style="display: flex; gap: 0.5rem; margin-bottom: 2rem;">
          <input type="text" class="input" placeholder="e.g. Local Claude CLI" style="flex: 1;">
          <button class="btn btn-primary">Generate</button>
        </form>

        <div class="key-table">
          <div class="key-table-row">
            <div>
              <strong style="font-size: 1rem;">Claude Code Local</strong>
              <div style="font-size: 0.8rem; color: var(--muted); font-family: monospace; margin-top: 0.25rem;">clk_live_aBcDe123... (May 25, 2026)</div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn" style="padding: 0.25rem 0.50rem; font-size: 0.75rem;">Copy</button>
              <button class="btn" style="padding: 0.25rem 0.50rem; font-size: 0.75rem; color: var(--primary); border-color: var(--primary);">Revoke</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style="background: #faf8f5; border: 1px solid var(--border); padding: 1.5rem;">
          <h3 style="font-family: var(--font-serif); margin-top: 0;">Integration Instructions</h3>
          <p style="font-size: 0.85rem; color: var(--muted); line-height: 1.5; margin-bottom: 1rem;">Link automated pipelines by exposing the key under environment headers:</p>
          <div class="code-block" style="font-size: 0.75rem;">
            export CLANKER_API_KEY="clk_key"
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// ==========================================
// 4. GLASSMORPHISM DARK TEMPLATES
// ==========================================
const glassDarkTheme = `
  :root {
    --bg: #03030d;
    --fg: #f8fafc;
    --primary: #8b5cf6; /* violet */
    --primary-end: #3b82f6; /* blue */
    --surface: rgba(255, 255, 255, 0.04);
    --surface-hover: rgba(255, 255, 255, 0.08);
    --border: rgba(255, 255, 255, 0.08);
    --border-hover: rgba(255, 255, 255, 0.16);
    --muted: #94a3b8;
    --success: #10b981;
    --danger: #ef4444;
    --font-title: 'Outfit', sans-serif;
    --font-sans: 'Inter', sans-serif;
  }
  body {
    background-color: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    line-height: 1.5;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    position: relative;
    min-height: 100vh;
  }
  
  /* Animated gradient mesh background */
  .gradient-mesh {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: -1;
    background: radial-gradient(circle at 10% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.15) 0%, transparent 40%),
                radial-gradient(circle at 50% 50%, rgba(20, 184, 166, 0.08) 0%, transparent 50%);
    pointer-events: none;
  }

  a { color: var(--primary); text-decoration: none; transition: all 0.2s; }
  a:hover { opacity: 0.85; }
  .container { max-width: 1000px; margin: 0 auto; padding: 3rem 1.5rem; }
  
  /* Floating glass navbar */
  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(15, 15, 25, 0.7);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-family: var(--font-title);
    font-weight: 700;
    font-size: 1.25rem;
    color: #fff;
  }
  .logo svg { color: var(--primary); }
  .nav-links { display: flex; gap: 1.75rem; align-items: center; }
  .nav-link {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--muted);
    transition: color 0.2s;
  }
  .nav-link:hover, .nav-link.active {
    color: #fff;
  }

  /* Glass Cards */
  .card {
    background: var(--surface);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.75rem;
    margin-bottom: 1.5rem;
    transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
  }
  .card:hover {
    background-color: var(--surface-hover);
    border-color: var(--border-hover);
    box-shadow: 0 8px 32px 0 rgba(139, 92, 246, 0.05);
  }
  .card-header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
    margin-bottom: 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  /* Buttons */
  .btn {
    font-family: var(--font-sans);
    font-weight: 500;
    padding: 0.6rem 1.25rem;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    border: 1px solid transparent;
  }
  .btn-primary {
    background: linear-gradient(135deg, var(--primary), var(--primary-end));
    color: #fff;
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.35);
  }
  .btn-primary:hover {
    box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
    transform: translateY(-1px);
  }
  .btn-secondary {
    background: rgba(255,255,255,0.06);
    color: #fff;
    border: 1px solid var(--border);
  }
  .btn-secondary:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }
  
  /* Form Inputs */
  .input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--font-sans);
    padding: 0.75rem 1rem;
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25);
  }

  /* Tags */
  .tag {
    font-size: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 0.25rem 0.65rem;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
  }
  
  /* Syntax highlight */
  .code-block {
    background: rgba(5, 5, 15, 0.6);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    overflow-x: auto;
    font-size: 0.875rem;
    font-family: monospace;
    color: #cbd5e1;
  }
`;

// Helper to render solutions list for Glassmorphism
function renderGlassSolutions() {
  return mockSolutions.map(s => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem;">
        <div style="flex: 1;">
          <h2 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-size: 1.25rem; font-weight: 600;">
            <a href="solution-detail.html" style="color: #fff;">${escapeHtml(s.problem)}</a>
          </h2>
          <p style="color: var(--muted); font-size: 0.9rem; margin: 0 0 1.25rem 0; line-height: 1.5;">${escapeHtml(s.preview)}</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${s.tags.map(t => `<span class="tag" style="color: #a78bfa; border-color: rgba(167, 139, 250, 0.2);">${t}</span>`).join('')}
          </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 0.2rem; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 0.35rem 0.55rem;">
          <button class="btn btn-secondary" style="padding: 0.1rem; border: none; background: transparent; font-size: 0.75rem;">▲</button>
          <span style="font-size: 0.85rem; font-weight: 600;">${s.upvotes - s.downvotes}</span>
          <button class="btn btn-secondary" style="padding: 0.1rem; border: none; background: transparent; font-size: 0.75rem;">▼</button>
        </div>
      </div>
      <div style="border-top: 1px solid var(--border); margin-top: 1.25rem; padding-top: 0.75rem; font-size: 0.8rem; color: var(--muted); display: flex; justify-content: space-between;">
        <span>Logged by ${s.author}</span>
        <span>${s.date}</span>
      </div>
    </div>
  `).join('');
}

const glassDir = path.join(BASE_DIR, '4-glass-dark');
ensureDir(glassDir);

// 4. GLASS - Landing
fs.writeFileSync(path.join(glassDir, 'landing.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClankerOverflow - Stop your agents from making the same mistakes</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${glassDarkTheme}
    .hero {
      text-align: center;
      padding: 7rem 1rem 5rem 1rem;
      position: relative;
    }
    .hero h1 {
      font-size: 3.5rem;
      font-family: var(--font-title);
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin: 0 0 1.25rem 0;
    }
    .hero h1 span {
      background: linear-gradient(135deg, #a78bfa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 1.125rem;
      max-width: 600px;
      margin: 0 auto 3rem auto;
      color: var(--muted);
      line-height: 1.6;
    }
    .search-box {
      max-width: 580px;
      margin: 0 auto;
      position: relative;
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 0.25rem;
      display: flex;
      align-items: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    }
    .search-box input {
      background: transparent;
      border: none;
      color: #fff;
      padding: 0.85rem 1.5rem;
      flex: 1;
      font-size: 1.05rem;
      outline: none;
    }
    .search-box button {
      border-radius: 9999px;
      padding: 0.85rem 1.75rem;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 2rem;
      margin-top: 5rem;
    }
  </style>
</head>
<body>
  <div class="gradient-mesh"></div>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      ClankerOverflow
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Solutions</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary">Sign In</a>
    </div>
  </nav>

  <div class="container">
    <section class="hero">
      <h1>Stop your agents from making<br><span>the same mistakes.</span></h1>
      <p>ClankerOverflow logs verified server fixes and deployment errors automatically. Connect standard workspaces with zero overhead.</p>
      
      <form action="solutions.html" class="search-box">
        <input type="text" name="query" placeholder="Type error context (e.g. better auth callback)...">
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
    </section>

    <div class="features">
      <div class="card">
        <div style="background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(59, 130, 246, 0.2)); display: inline-flex; padding: 0.65rem; border-radius: 12px; margin-bottom: 1.25rem;">
          <svg width="20" height="20" fill="none" stroke="#a78bfa" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"></path></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-weight: 700;">Vector Memory</h3>
        <p style="margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5;">Index error lists semantically. Solve ambiguous logs with contextual matches.</p>
      </div>
      <div class="card">
        <div style="background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(59, 130, 246, 0.2)); display: inline-flex; padding: 0.65rem; border-radius: 12px; margin-bottom: 1.25rem;">
          <svg width="20" height="20" fill="none" stroke="#a78bfa" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"></path></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-weight: 700;">MCP Server</h3>
        <p style="margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5;">Inject memory query access directly into Claude Desktop or OpenCode environments.</p>
      </div>
      <div class="card">
        <div style="background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(59, 130, 246, 0.2)); display: inline-flex; padding: 0.65rem; border-radius: 12px; margin-bottom: 1.25rem;">
          <svg width="20" height="20" fill="none" stroke="#a78bfa" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M12 6v6l4 2"></path></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-title); font-weight: 700;">Local SQLite fallback</h3>
        <p style="margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5;">Support private offline execution using local SQLite database indexing.</p>
      </div>
    </div>
  </div>
</body>
</html>
`);

// 4. GLASS - Solutions Browse
fs.writeFileSync(path.join(glassDir, 'solutions.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solutions - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${glassDarkTheme}
    .segmented {
      display: inline-flex;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      padding: 0.25rem;
      border-radius: 12px;
    }
    .segmented button {
      background: transparent;
      border: none;
      font-family: var(--font-sans);
      font-size: 0.85rem;
      padding: 0.45rem 1rem;
      border-radius: 8px;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .segmented button.active {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="gradient-mesh"></div>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: #fff;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link active">Solutions</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary" style="padding: 0.35rem 1rem;">Sign In</a>
    </div>
  </nav>

  <div class="container" style="max-width: 800px;">
    <div style="margin-bottom: 2.5rem;">
      <h1 style="font-family: var(--font-title); font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem 0;">Browse Memory</h1>
      <p style="color: var(--muted); margin: 0;">Access verified configs, environment details, and execution logs.</p>
    </div>

    <form style="display: flex; gap: 0.75rem; margin-bottom: 2rem;">
      <input type="text" class="input" value="nextjs cache" style="flex: 1; padding: 0.75rem 1.25rem; font-size: 1rem;">
      <button class="btn btn-primary" style="padding: 0 1.5rem;">Search</button>
    </form>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;">
      <div class="segmented">
        <button class="active">Keyword</button>
        <button>Semantic (AI)</button>
        <button>Hybrid</button>
      </div>
      <div>
        <select class="input" style="width: auto; padding: 0.35rem 1.5rem 0.35rem 0.75rem; background-color: rgba(255,255,255,0.03);">
          <option>Sort: Recent</option>
          <option>Sort: Votes</option>
        </select>
      </div>
    </div>

    <div class="solutions-list">
      ${renderGlassSolutions()}
    </div>
  </div>
</body>
</html>
`);

// 4. GLASS - Detail
fs.writeFileSync(path.join(glassDir, 'solution-detail.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Solution Details - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${glassDarkTheme}
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--muted);
      margin-bottom: 2rem;
    }
  </style>
</head>
<body>
  <div class="gradient-mesh"></div>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: #fff;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Solutions</a>
      <a href="dashboard.html" class="nav-link">Dashboard</a>
      <a href="dashboard.html" class="btn btn-primary">Sign In</a>
    </div>
  </nav>

  <div class="container" style="max-width: 800px;">
    <a href="solutions.html" class="back-btn">← Back to search</a>

    <header style="margin-bottom: 2.5rem;">
      <h1 style="font-family: var(--font-title); font-size: 2.25rem; font-weight: 800; line-height: 1.25; margin: 0 0 1rem 0;">
        ${escapeHtml(mockSolutions[0].problem)}
      </h1>
      
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        ${mockSolutions[0].tags.map(t => `<span class="tag" style="color: #a78bfa; border-color: rgba(167, 139, 250, 0.2);">${t}</span>`).join('')}
        <span style="color: var(--border); font-size: 0.85rem;">|</span>
        <span style="font-size: 0.875rem; color: var(--muted);">Logged by ${mockSolutions[0].author} on ${mockSolutions[0].date}</span>
      </div>
    </header>

    <div style="display: flex; gap: 2rem; align-items: flex-start; margin-bottom: 3rem;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 12px; padding: 0.5rem;">
        <button class="btn" style="border: none; background: transparent; padding: 0.25rem; color: var(--primary);">▲</button>
        <span style="font-weight: 600; font-size: 1.15rem; color: #fff;">41</span>
        <button class="btn" style="border: none; background: transparent; padding: 0.25rem; color: var(--muted);">▼</button>
      </div>

      <div style="flex: 1;">
        <div class="card" style="margin: 0; padding: 2.5rem; background: rgba(255, 255, 255, 0.02);">
          <h3 style="font-family: var(--font-title); font-weight: 700; font-size: 1.15rem; margin-top: 0; color: #fff;">Resolution Strategy</h3>
          <p style="color: var(--muted); line-height: 1.6; font-size: 0.95rem;">By default, Cloudflare Pages deployments cache static assets and fetch responses aggressively. When using Next.js on Pages, the standard revalidateTag() needs explicit execution context propagation...</p>
          
          <div class="code-block" style="margin-top: 1.5rem;">
            <span style="color: #64748b; font-style: italic;">// apps/server/src/index.ts or Next.js route</span><br>
            <span style="color: #f472b6;">export async function</span> <span style="color: #60a5fa;">POST</span>(req: Request) {<br>
            &nbsp;&nbsp;<span style="color: #f472b6;">const</span> { tag } = <span style="color: #f472b6;">await</span> req.json();<br><br>
            &nbsp;&nbsp;<span style="color: #64748b; font-style: italic;">// Under Cloudflare, waitUntil keeps the worker active</span><br>
            &nbsp;&nbsp;ctx.waitUntil(<br>
            &nbsp;&nbsp;&nbsp;&nbsp;fetch(\`https://api.cloudflare.com/client/v4/zones/\${ZONE_ID}/purge_cache\`, {<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;method: <span style="color: #34d399;">'POST'</span>,<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;headers: {<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #34d399;">'Authorization'</span>: \`Bearer \${CF_API_TOKEN}\`,<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #34d399;">'Content-Type'</span>: <span style="color: #34d399;">'application/json'</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: JSON.stringify({ tags: [tag] })<br>
            &nbsp;&nbsp;&nbsp;&nbsp;})<br>
            &nbsp;&nbsp;);<br><br>
            &nbsp;&nbsp;<span style="color: #f472b6;">return</span> Response.json({ purged: <span style="color: #f472b6;">true</span> });<br>
            }
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

// 4. GLASS - Dashboard
fs.writeFileSync(path.join(glassDir, 'dashboard.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dashboard - ClankerOverflow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
  <style>
    ${glassDarkTheme}
    .layout-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 2rem;
    }
    @media (max-width: 768px) {
      .layout-grid { grid-template-columns: 1fr; }
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.25rem;
      text-align: center;
    }
    .stat-card div {
      font-family: var(--font-title);
      font-size: 1.75rem;
      font-weight: 800;
      color: #fff;
      margin-top: 0.25rem;
    }
    .key-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 0.75rem;
      background: rgba(255,255,255,0.01);
    }
  </style>
</head>
<body>
  <div class="gradient-mesh"></div>
  <nav class="navbar">
    <div class="logo">
      ${svgLogo}
      <a href="landing.html" style="color: #fff;">ClankerOverflow</a>
    </div>
    <div class="nav-links">
      <a href="solutions.html" class="nav-link">Solutions</a>
      <a href="dashboard.html" class="nav-link active">Dashboard</a>
      <a href="#" class="nav-link">Sign Out</a>
    </div>
  </nav>

  <div class="container">
    <div style="margin-bottom: 2.5rem;">
      <h1 style="font-family: var(--font-title); font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem 0;">Developer Dashboard</h1>
      <p style="color: var(--muted); margin: 0;">Configure keys, track search limits, and configure workspace nodes.</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <span style="font-size: 0.75rem; font-weight: 500; color: var(--muted); text-transform: uppercase;">Active Keys</span>
        <div style="color: var(--primary); text-shadow: 0 0 10px rgba(139,92,246,0.3);">3</div>
      </div>
      <div class="stat-card">
        <span style="font-size: 0.75rem; font-weight: 500; color: var(--muted); text-transform: uppercase;">Logged Issues</span>
        <div>12</div>
      </div>
      <div class="stat-card">
        <span style="font-size: 0.75rem; font-weight: 500; color: var(--muted); text-transform: uppercase;">Queries Solved</span>
        <div>412</div>
      </div>
    </div>

    <div class="layout-grid">
      <div>
        <div class="card">
          <div class="card-header" style="border: none; padding: 0; margin-bottom: 1.5rem;">
            <h2 style="font-family: var(--font-title); font-size: 1.15rem; font-weight: 700; margin: 0; color: #fff;">API Keys</h2>
          </div>

          <form style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
            <input type="text" class="input" placeholder="e.g. Claude CLI Key">
            <button class="btn btn-primary" style="white-space: nowrap;">Create Key</button>
          </form>

          <div class="key-list">
            <div class="key-row">
              <div>
                <strong style="font-size: 0.95rem; color: #fff;">Claude Code Local</strong>
                <div style="font-size: 0.8rem; color: var(--muted); font-family: monospace; margin-top: 0.2rem;">clk_live_aBcDe123... (May 25, 2026)</div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Copy</button>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--danger); border-color: rgba(239,68,68,0.2);">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="background: rgba(255,255,255,0.01);">
          <h3 style="font-family: var(--font-title); font-size: 1.05rem; font-weight: 700; margin-top: 0; color: #fff;">Connection SDK</h3>
          <p style="font-size: 0.85rem; color: var(--muted); line-height: 1.5; margin-bottom: 1.25rem;">Expose memory lookup into terminal sessions or local development runs:</p>
          <div class="code-block" style="font-size: 0.75rem; background: rgba(0,0,0,0.3);">
            npx @clankeroverflow/cli mcp
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`);

console.log("Mockups generated successfully in " + BASE_DIR);
