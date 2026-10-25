export function backendOwnsRoute(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/backend-assets/_next/") ||
    pathname === "/favicon.ico"
  );
}
