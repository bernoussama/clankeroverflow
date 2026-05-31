import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const modeToggleSource = readFileSync(new URL("./mode-toggle.tsx", import.meta.url), "utf8");
const userMenuSource = readFileSync(new URL("./user-menu.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("./header.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../index.css", import.meta.url), "utf8");

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

  it("keep the existing theme and account actions", () => {
    expect(modeToggleSource).toContain('chooseTheme("light")');
    expect(modeToggleSource).toContain('chooseTheme("dark")');
    expect(modeToggleSource).toContain('chooseTheme("system")');
    expect(userMenuSource).toContain("authClient.signOut");
  });

  it("renders header dropdowns on an opaque theme surface", () => {
    expect(globalStyles).toContain(".dropdown-content");
    expect(globalStyles).toContain("background: var(--header-bg)");
  });

  it("keeps the account menu deterministic during hydration", () => {
    expect(userMenuSource).toContain("useEffect");
    expect(userMenuSource).toContain("const [mounted, setMounted] = useState(false)");
    expect(userMenuSource).toContain("if (!mounted || isPending)");
  });
});
