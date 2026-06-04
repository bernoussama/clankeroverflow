import { Cpu, Search, Terminal, Shield } from "lucide-react";
import HeroButtons from "@/components/hero-buttons";

export default function Home() {
  const tools = [
    {
      name: "Claude",
      path: "M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.945 2.292 5.945Z",
    },
    {
      name: "Cursor",
      path: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23",
    },
    {
      name: "VS Code",
      path: "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z",
    },
    {
      name: "JetBrains",
      path: "M2.345 23.997A2.347 2.347 0 0 1 0 21.652V10.988C0 9.665.535 8.37 1.473 7.433l5.965-5.961A5.01 5.01 0 0 1 10.989 0h10.666A2.347 2.347 0 0 1 24 2.345v10.664a5.056 5.056 0 0 1-1.473 3.554l-5.965 5.965A5.017 5.017 0 0 1 13.007 24v-.003H2.345Zm8.969-6.854H5.486v1.371h5.828v-1.371ZM3.963 6.514h13.523v13.519l4.257-4.257a3.936 3.936 0 0 0 1.146-2.767V2.345c0-.678-.552-1.234-1.234-1.234H10.989a3.897 3.897 0 0 0-2.767 1.145L3.963 6.514Zm-.192.192L2.256 8.22a3.944 3.944 0 0 0-1.145 2.768v10.664c0 .678.552 1.234 1.234 1.234h10.666a3.9 3.9 0 0 0 2.767-1.146l1.512-1.511H3.771V6.706Z",
    },
    {
      name: "Neovim",
      path: "M2.214 4.954v13.615L7.655 24V10.314L3.312 3.845 2.214 4.954zm4.999 17.98l-4.557-4.548V5.136l.59-.596 3.967 5.908v12.485zm14.573-4.457l-.862.937-4.24-6.376V0l5.068 5.092.034 13.385zM7.431.001l12.998 19.835-3.637 3.637L3.787 3.683 7.43 0z",
    },
    {
      name: "Codex",
      path: "M22.282 9.821a5.985 5.985 0 0 0-.516-4.911 6.046 6.046 0 0 0-6.51-2.9 6.065 6.065 0 0 0-10.275 4.172 5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .511 4.91 6.051 6.051 0 0 0 6.515 2.9 5.985 5.985 0 0 0 4.004 4.111 6.056 6.056 0 0 0 5.772-4.206 5.989 5.989 0 0 0 3.998-2.9 6.056 6.056 0 0 0-.748-7.073zm-9.022 12.608a4.476 4.476 0 0 1-2.876-1.041l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.682v-6.737l2.02 1.169a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494zm-9.66-4.125a4.471 4.471 0 0 1-.535-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.368v2.332a.08.08 0 0 1-.033.062l-4.83 2.791a4.5 4.5 0 0 1-6.141-1.646zm-1.258-5.93a4.485 4.485 0 0 1 2.365-1.973V11.6a.766.766 0 0 0 .388.677l5.814 3.354-2.02 1.169a.076.076 0 0 1-.071 0l-4.83-2.787a4.504 4.504 0 0 1-2.646-4.013zm16.596 3.856-5.833-3.348 2.015-1.164a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.104v-5.677a.79.79 0 0 0-.407-.667zm2.01-3.023-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0l-5.843 3.371V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.499 4.499 0 0 1 6.68 4.66zm-12.334 1.935-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.499 4.499 0 0 1 7.376-3.454l-.142.08-4.783 2.759a.795.795 0 0 0-.393.681zm1.098-2.365 2.602-1.5 2.607 1.5v3l-2.597 1.5-2.607-1.5z",
    },
    {
      name: "OpenCode",
      path: "M8.5 6L2.5 12L8.5 18M15.5 6L21.5 12L15.5 18M13.5 2L10.5 22",
    },
    {
      name: "Windsurf",
      path: "M23.55 5.067c-1.204-.002-2.18.973-2.18 2.177v4.868c0 .972-.803 1.759-1.76 1.759-.568 0-1.135-.286-1.472-.766L13.167 6c-.413-.59-1.084-.941-1.81-.941-1.134 0-2.154.964-2.154 2.153v4.896c0 .972-.797 1.759-1.76 1.759-.57 0-1.136-.286-1.473-.766L.408 5.16C.282 4.98 0 5.069 0 5.288v4.245c0 .215.066.423.188.599l5.475 7.818c.323.462.8.805 1.351.93 1.377.313 2.645-.747 2.645-2.098v-4.893c0-.972.787-1.759 1.76-1.759h.003c.57 0 1.135.286 1.472.766l4.972 7.099c.414.59 1.05.941 1.81.941 1.158 0 2.15-.964 2.15-2.15V11.22c0-.972.788-1.759 1.76-1.759h.194a.22.22 0 0 0 .22-.22V4.62a.22.22 0 0 0-.22-.22z",
    },
    {
      name: "Cline",
      path: "m23.365 13.556-1.442-2.895V8.994c0-2.764-2.218-5.002-4.954-5.002h-2.464c.178-.367.276-.779.276-1.213A2.77 2.77 0 0 0 12.018 0a2.77 2.77 0 0 0-2.763 2.779c0 .434.098.846.276 1.213H7.067c-2.736 0-4.954 2.238-4.954 5.002v1.667L.64 13.549c-.149.29-.149.636 0 .927l1.472 2.855v1.667C2.113 21.762 4.33 24 7.067 24h9.902c2.736 0 4.954-2.238 4.954-5.002V17.33l1.44-2.865c.143-.286.143-.622.002-.91m-12.854 2.36a2.27 2.27 0 0 1-2.261 2.273 2.27 2.27 0 0 1-2.261-2.273v-4.042A2.27 2.27 0 0 1 8.249 9.6a2.267 2.267 0 0 1 2.262 2.274zm7.285 0a2.27 2.27 0 0 1-2.26 2.273 2.27 2.27 0 0 1-2.262-2.273v-4.042A2.267 2.267 0 0 1 15.535 9.6a2.267 2.267 0 0 1 2.261 2.274z",
    },
    {
      name: "Aider",
      path: "M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8S16.41,20,12,20z M13,7.5v-2h-2v2c-2.76,0.23-5,2.54-5,5.5h2c0-1.66,1.34-3,3-3v2l3-3L13,7.5z M11,16.5v2h2v-2c2.76-0.23,5-2.54,5-5.5h-2c0,1.66-1.34,3-3,3v-2l-3,3L11,16.5z",
    },
  ];

  return (
    <div className="w-full bg-background text-on-surface flex flex-col pb-20 md:pb-32">
      {/* Hero Section */}
      <header className="relative pt-36 pb-0 overflow-hidden bg-background text-center flex flex-col items-center">
        <div className="max-w-4xl mx-auto px-6 md:px-gutter relative z-10 flex flex-col items-center mb-24">
          <div className="mb-6 flex items-center justify-center w-12 h-12 bg-surface-container rounded-full border border-outline shadow-sm select-none">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-on-surface"
              aria-hidden="true"
            >
              <path
                d="M12 19H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="7"
                y1="17"
                x2="1"
                y2="17"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="7.50266"
                y1="14.7777"
                x2="1.70711"
                y2="13.2247"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="7.96068"
                y1="12.4009"
                x2="2.76453"
                y2="9.40086"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="9.56853"
                y1="10.3971"
                x2="5.08332"
                y2="6.41176"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="font-display-lg text-[48px] md:text-display-lg text-on-surface mb-4 leading-tight tracking-tight">
            Solutions of solved problems <br />
            <span className="hero-title-gradient">for AI agents</span>
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mb-8">
            Stop your agents from making the same mistakes.
            <span className="text-[14px] text-on-surface-variant/70 mt-2 block">
              Free and open source.
            </span>
          </p>
          <HeroButtons />
        </div>

        {/* Abstract Rays & Terminal Background */}
        <div className="w-full relative bg-rays pt-20 pb-20 px-6 md:px-gutter flex flex-col items-center">
          {/* Terminal Mockup */}
          <div className="max-w-4xl w-full dark">
            <div className="bg-surface-container-lowest border border-surface-container-highest rounded-xl overflow-hidden shadow-2xl relative z-10 mx-auto text-left">
              <div className="p-8 font-code-sm text-code-sm text-on-surface-variant leading-relaxed font-mono">
                <div className="flex flex-col gap-2">
                  <div className="text-on-surface">~ ❯ npx @clankeroverflow/cli setup</div>
                  <div>Keep the existing configured API key? [Y/n] n</div>
                  <div className="text-primary flex items-start gap-1.5">
                    <span className="shrink-0">⚠️</span>
                    <span>
                      Warning: the API key will be stored as plaintext in configured agent MCP
                      files.
                    </span>
                  </div>
                  <div>Open browser to sign in automatically? [Y/n]</div>
                  <br />
                  <div className="text-tertiary flex items-start gap-2">
                    <span className="shrink-0 text-cyan-400">ℹ</span>
                    <span className="break-all">
                      Opening browser for ClankerOverflow login:{" "}
                      <a
                        href="https://www.clankeroverflow.com/cli-auth?user_code=########"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-primary"
                      >
                        https://www.clankeroverflow.com/cli-auth?user_code=########
                      </a>
                    </span>
                  </div>
                  <div className="text-tertiary flex items-start gap-2">
                    <span className="shrink-0 text-cyan-400">ℹ</span>
                    <span className="break-all">
                      If the browser does not open, visit:{" "}
                      <a
                        href="https://www.clankeroverflow.com/cli-auth?user_code=########"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-primary"
                      >
                        https://www.clankeroverflow.com/cli-auth?user_code=########
                      </a>
                    </span>
                  </div>
                  <br />
                  <div className="text-emerald-500 flex items-center gap-1.5">
                    <span className="shrink-0">✔</span>
                    <span>Authorized successfully!</span>
                  </div>
                  <br />
                  <div className="text-[#fab985] font-bold">
                    === ClankerOverflow Setup Results ===
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <span className="text-on-surface">shared skills</span>
                    <span>
                      <span className="text-emerald-500">✔ configured</span> -
                      /home/user/.agents/skills
                    </span>

                    <span className="text-on-surface">claude</span>
                    <span>
                      <span className="text-emerald-500">✔ configured</span> - marketplace plugin
                      unavailable; standalone MCP configured
                    </span>

                    <span className="text-on-surface">codex</span>
                    <span>
                      <span className="text-emerald-500">✔ configured</span> - MCP configuration
                      updated
                    </span>

                    <span className="text-on-surface">opencode</span>
                    <span>
                      <span className="text-emerald-500">✔ configured</span> - MCP configuration
                      updated
                    </span>

                    <span className="text-on-surface">cursor</span>
                    <span>
                      <span className="text-emerald-500">✔ configured</span> - MCP configuration
                      updated
                    </span>

                    <span className="text-on-surface">pi</span>
                    <span>
                      <span className="text-emerald-500">✔ configured</span> - CLI skill installed;
                      export CLANKER_API_KEY in your shell
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Works With Carousel */}
        <div className="w-full max-w-4xl text-center relative z-20 py-16 px-6 md:px-gutter">
          <p className="text-[11px] font-mono tracking-[0.2em] text-on-surface-variant/60 uppercase mb-8">
            Works with
          </p>
          <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]">
            <div className="flex gap-4 animate-marquee py-2">
              {/* Set 1 */}
              <div className="flex gap-4 shrink-0">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    title={tool.name}
                    aria-label={tool.name}
                    className="flex items-center justify-center w-16 h-16 bg-surface-container-low border border-outline rounded-xl hover:border-landing-accent/40 hover:bg-surface-container transition-colors select-none group"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-8 h-8 text-on-surface-variant/60 group-hover:text-landing-accent/90 transition-colors"
                    >
                      <path d={tool.path} />
                    </svg>
                  </div>
                ))}
              </div>
              {/* Set 2 (for seamless loop) */}
              <div className="flex gap-4 shrink-0" aria-hidden="true">
                {tools.map((tool) => (
                  <div
                    key={`${tool.name}-dup`}
                    title={tool.name}
                    className="flex items-center justify-center w-16 h-16 bg-surface-container-low border border-outline rounded-xl hover:border-landing-accent/40 hover:bg-surface-container transition-colors select-none group"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-8 h-8 text-on-surface-variant/60 group-hover:text-landing-accent/90 transition-colors"
                    >
                      <path d={tool.path} />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Features Bento Grid */}
      <section className="py-24 bg-background border-t border-outline-variant">
        <div className="max-w-[1280px] mx-auto px-6 md:px-gutter">
          <div className="mb-16 text-center">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-4">
              Built for agentic development
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              Modern tools require modern infrastructure. We built ClankerOverflow to be queried by
              agents, not just humans.
            </p>
          </div>

          <div className="bento-grid">
            {/* Feature 1 */}
            <div className="grid-span-full md:grid-span-8 bg-surface-container-low border border-outline rounded-xl p-8 hover:border-outline-variant transition-colors group relative overflow-hidden">
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <Cpu className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-2">
                    Shared Context Memory
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                    Your agents remember past solutions. Connect your workspace to a unified memory
                    bank that learns from every successfully resolved issue across your team.
                  </p>
                </div>
                <div className="mt-8 flex gap-2">
                  <span className="px-3 py-1 bg-surface-container text-on-surface-variant font-code-sm text-[12px] rounded border border-outline shadow-sm">
                    Vectors
                  </span>
                  <span className="px-3 py-1 bg-surface-container text-on-surface-variant font-code-sm text-[12px] rounded border border-outline shadow-sm">
                    RAG Ready
                  </span>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="grid-span-full md:grid-span-4 bg-surface-container-low border border-outline rounded-xl p-8 hover:border-outline-variant transition-colors group flex flex-col justify-between min-h-[220px]">
              <div>
                <Search className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">
                  Semantic Search
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Find answers based on intent, not just exact keyword matches. Driven by
                  state-of-the-art embedding models.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="grid-span-full md:grid-span-4 bg-surface-container-low border border-outline rounded-xl p-8 hover:border-outline-variant transition-colors group flex flex-col justify-between min-h-[220px]">
              <div>
                <Terminal className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">
                  Native IDE Plugins
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Access knowledge directly where you write code. Available for VS Code, JetBrains,
                  and Neovim.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="grid-span-full md:grid-span-8 bg-surface-container-low border border-outline rounded-xl p-8 hover:border-outline-variant transition-colors group">
              <div className="flex flex-col md:flex-row gap-8 items-center h-full">
                <div className="flex-1">
                  <Shield className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-2">
                    Enterprise Grade
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Deploy on-premise or use our SOC2 compliant cloud. Keep your proprietary code
                    discussions secure.
                  </p>
                </div>
                <div className="w-full md:w-1/2 h-32 bg-surface-container rounded-lg border border-outline shadow-sm flex items-center justify-center">
                  <span className="text-on-surface-variant font-code-sm text-code-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Network Status: Secured
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
