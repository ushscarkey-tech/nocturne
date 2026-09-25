import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type Size = "lg" | "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background-color,color,border-color,opacity,transform] duration-500 ease-[var(--ease-glide)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.985] select-none";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-paper text-night-900 hover:bg-[#f6efe2] shadow-[0_0_40px_-12px_rgba(236,228,212,0.45)]",
  secondary: "border border-rule text-paper hover:border-mist/60 hover:bg-white/[0.02]",
  ghost: "text-mist hover:text-paper",
  quiet: "text-mist hover:text-paper hover:bg-white/[0.03]",
  danger: "text-signal hover:text-[#e0a797] border border-signal/30 hover:border-signal/60",
};

const SIZES: Record<Size, string> = {
  lg: "h-13 px-8 text-[0.95rem] tracking-wide",
  md: "h-11 px-5 text-sm",
  sm: "h-9 px-3.5 text-[0.8125rem]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
