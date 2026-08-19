import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

// Stand-in for `next/link`. Maps Next's `href` to react-router's `to`.
// External / hash / mailto links fall back to a plain <a>.
type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

function isExternal(href: string) {
  return (
    /^https?:\/\//.test(href) ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  );
}

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  scroll: _scroll,
  replace,
  ...rest
}: NextLinkProps) {
  if (isExternal(href)) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
}
