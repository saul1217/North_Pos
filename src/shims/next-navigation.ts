import {
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

// Stand-in for `next/navigation` hooks used by NorthBike components.

export function usePathname(): string {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => {},
    prefetch: () => {},
  };
}

// Next returns the params object directly; react-router returns a tuple.
export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}
