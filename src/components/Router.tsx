/* eslint-disable react-refresh/only-export-components */
import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  useSyncExternalStore,
} from "react";

function normalizeHash(hash: string): string {
  const value = hash.replace(/^#/, "").split("?")[0] ?? "";
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeTarget(target: string): string {
  const [path, query] = target.replace(/^#/, "").split("?");
  const normalizedPath = normalizeHash(path ?? "/");
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

function getSnapshot() {
  return normalizeHash(window.location.hash);
}

function getServerSnapshot() {
  return "/";
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function navigate(path: string, options?: { replace?: boolean }) {
  const normalized = normalizeTarget(path);
  const nextUrl = `${window.location.pathname}${window.location.search}#${normalized}`;
  if (options?.replace) {
    window.history.replaceState(null, "", nextUrl);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = normalized;
  }
}

interface AppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export function AppLink({
  to,
  onClick,
  children,
  ...props
}: AppLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={`#${normalizeTarget(to)}`} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

export function getHashSearchParams(): URLSearchParams {
  const query = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(query);
}

export function matchRoute(
  route: string,
  pattern: string,
): Record<string, string> | null {
  const routeParts = normalizeHash(route).split("/").filter(Boolean);
  const patternParts = normalizeHash(pattern).split("/").filter(Boolean);
  if (routeParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index] ?? "";
    const actual = routeParts[index] ?? "";
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}
