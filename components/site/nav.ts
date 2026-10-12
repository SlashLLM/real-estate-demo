/** Nav links to a conversion page carry a CTA id too, so leads from the menu are attributed in the CRM. */
export const navHref = (href: string, prefix = "nav") =>
  href === "/contact" || href === "/valuation" ? `${href}?cta=${prefix}-${href.slice(1)}` : href;
