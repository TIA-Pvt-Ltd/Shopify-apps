import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";

type RouterLinkProps = Omit<LinkProps, "to"> & {
  url: string;
  external?: boolean;
};

/** Polaris renders navigation as anchors. Route those through the app router so a tab click does not reload the embedded admin. */
export const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(function RouterLink(
  { url, external, target, rel, children, ...rest },
  ref,
) {
  const leavesApp = external === true || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);
  if (leavesApp) {
    return (
      <a ref={ref} href={url} target={external ? "_blank" : target} rel={external ? "noopener noreferrer" : rel} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link ref={ref} to={url} target={target} rel={rel} {...rest}>
      {children}
    </Link>
  );
});
