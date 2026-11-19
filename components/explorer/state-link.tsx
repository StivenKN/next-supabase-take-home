"use client";

import type { ExplorerState } from "@/lib/coffee-health/schema";
import { hrefForState } from "@/lib/coffee-health/search-params";
import { useExplorer } from "./explorer-context";

/**
 * A link to another view of the table. It is a real <a href>, so it can be
 * opened in a new tab or copied. A plain click goes through navigate() so the
 * current rows stay on screen, dimmed, until the next ones arrive.
 *
 * `disabled` keeps the same element in the page without a destination. A
 * "Previous" link that reaches page 1 stays where it is and keeps keyboard
 * focus, instead of vanishing from under the person who just pressed it.
 *
 * `moveFocusTo` is for a link that does vanish when used, such as "Clear all
 * filters". The browser would drop keyboard focus to the top of the page, so
 * the link hands focus to the element with that id first.
 */
export const MATCH_COUNT_ID = "match-count";

export function StateLink({
  state,
  disabled = false,
  moveFocusTo,
  onClick,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & {
  state: ExplorerState;
  disabled?: boolean;
  moveFocusTo?: string;
}) {
  const { pathname, navigate } = useExplorer();
  if (disabled) {
    return <a role="link" aria-disabled="true" tabIndex={0} {...props} />;
  }
  return (
    <a
      href={hrefForState(pathname, state)}
      onClick={(event) => {
        onClick?.(event);
        const plainClick =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey;
        if (event.defaultPrevented || !plainClick) return;
        event.preventDefault();
        if (moveFocusTo) document.getElementById(moveFocusTo)?.focus();
        navigate(state);
      }}
      {...props}
    />
  );
}
