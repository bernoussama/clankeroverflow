"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * Registers WebMCP tools when the browser supports the API.
 * @see https://webmachinelearning.github.io/webmcp/
 */
export default function WebMcpProvider() {
  const router = useRouter();

  useEffect(() => {
    const mc = typeof navigator !== "undefined" ? navigator.modelContext : undefined;
    if (!mc?.registerTool) return;

    const ac = new AbortController();

    mc.registerTool(
      {
        name: "navigate_search",
        title: "Home / search",
        description: "Go to the site home page focused on solution search.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => {
          router.push("/");
          return { ok: true, path: "/" };
        },
      },
      { signal: ac.signal },
    );

    mc.registerTool(
      {
        name: "navigate_login",
        title: "Sign in",
        description: "Open the sign-in page for interactive sessions.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => {
          router.push("/login");
          return { ok: true, path: "/login" };
        },
      },
      { signal: ac.signal },
    );

    mc.registerTool(
      {
        name: "open_api_docs",
        title: "API docs",
        description: "Open the human-readable API documentation page.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => {
          router.push("/docs/api" as Route);
          return { ok: true, path: "/docs/api" };
        },
      },
      { signal: ac.signal },
    );

    return () => ac.abort();
  }, [router]);

  return null;
}
