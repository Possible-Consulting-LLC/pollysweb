export function isAppNavActive(pathname: string, href: string): boolean {
  if (href === "/spoods") {
    return pathname === href || pathname.startsWith("/spoods/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
