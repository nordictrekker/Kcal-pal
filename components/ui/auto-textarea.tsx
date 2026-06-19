"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "./textarea";

// A textarea that grows to fit its content so long entries don't scroll inside
// a small box. Works controlled or uncontrolled: it resizes on every input and
// whenever the `value` prop changes (e.g. a pantry chip fills it).
const AutoTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function AutoTextarea({ value, onInput, className, ...props }, forwardedRef) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
          el;
    },
    [forwardedRef],
  );

  const resize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <Textarea
      ref={setRefs}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
});

export { AutoTextarea };
