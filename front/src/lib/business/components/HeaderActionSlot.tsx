"use client";

import { createPortal } from "react-dom";

export default function HeaderActionSlot({
  children,
}: {
  children: React.ReactNode;
}) {
  if (typeof window === "undefined") return null;

  const slots = Array.from(document.querySelectorAll("[data-header-slot]"));
  if (!slots.length) return null;

  return (
    <>
      {slots.map((slot, i) =>
        createPortal(children, slot as Element, `header-slot-${i}`),
      )}
    </>
  );
}
