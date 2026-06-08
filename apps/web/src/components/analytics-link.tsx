"use client";

import type { ComponentProps } from "react";

import { capturePostHogEvent } from "@/lib/posthog-events";

type AnalyticsLinkProps = ComponentProps<"a"> & {
  eventName: string;
  eventProperties?: Record<string, string | number | boolean | null | undefined>;
};

export default function AnalyticsLink({
  eventName,
  eventProperties,
  onClick,
  ...props
}: AnalyticsLinkProps) {
  return (
    <a
      {...props}
      onClick={(event) => {
        capturePostHogEvent(eventName, eventProperties);
        onClick?.(event);
      }}
    />
  );
}
