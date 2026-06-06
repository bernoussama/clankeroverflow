import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const modeToggleSource = readFileSync(new URL("./mode-toggle.tsx", import.meta.url), "utf8");
const userMenuSource = readFileSync(new URL("./user-menu.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("./header.tsx", import.meta.url), "utf8");
const mobileNavSource = readFileSync(new URL("./mobile-nav.tsx", import.meta.url), "utf8");
const landingUiSource = readFileSync(new URL("./landing-ui.tsx", import.meta.url), "utf8");

describe("header menus", () => {
  it("do not bundle Base UI floating menus", () => {
    expect(modeToggleSource).not.toContain("@/components/ui/dropdown-menu");
    expect(userMenuSource).not.toContain("@/components/ui/dropdown-menu");
  });

  it("keeps the header shell server-rendered", () => {
    expect(headerSource).not.toContain('"use client"');
    expect(headerSource).toContain("<ModeToggle />");
    expect(headerSource).toContain("<UserMenu />");
    expect(userMenuSource).toContain('"use client"');
  });

  it("includes the github link pointing to the repository", () => {
    expect(headerSource).toContain('href="https://github.com/bernoussama/clankeroverflow"');
    expect(headerSource).toContain('target="_blank"');
    expect(headerSource).toContain('rel="noopener noreferrer"');
  });

  it("keep the existing theme and account actions", () => {
    expect(modeToggleSource).toContain('chooseTheme("light")');
    expect(modeToggleSource).toContain('chooseTheme("dark")');
    expect(modeToggleSource).toContain('chooseTheme("system")');
    expect(userMenuSource).toContain("authClient.signOut");
  });

  it("uses tokenized Tailwind recipes for header controls and menus", () => {
    expect(landingUiSource).toContain("bg-popover");
    expect(landingUiSource).toContain("border-outline-variant");
    expect(landingUiSource).toContain("bg-surface-container-low");
    expect(landingUiSource).not.toContain("mode-toggle-btn");
    expect(landingUiSource).not.toContain("dropdown-content");
  });

  it("keeps landing chrome off legacy component CSS classes", () => {
    const combined = [headerSource, modeToggleSource, userMenuSource, mobileNavSource].join("\n");
    expect(combined).not.toContain("mode-toggle-btn");
    expect(combined).not.toContain("dropdown-content");
    expect(combined).not.toContain("btn-glow");
    expect(combined).not.toContain("btn-secondary");
  });

  it("keeps the account menu deterministic during hydration", () => {
    expect(userMenuSource).toContain("useEffect");
    expect(userMenuSource).toContain("const [mounted, setMounted] = useState(false)");
    expect(userMenuSource).toContain("if (!mounted || isPending)");
  });
});
