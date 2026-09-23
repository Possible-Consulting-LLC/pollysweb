import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--plum)] text-[var(--on-accent)] shadow-sm hover:bg-[var(--plum-deep)]",
        secondary:
          "bg-[var(--lavender)] text-[var(--midnight)] hover:bg-[var(--lavender-deep)]",
        soft: "bg-[var(--card)] text-[var(--midnight)] border border-[var(--plum)]/15 hover:bg-[var(--hover-strong)]",
        ghost: "bg-transparent text-[var(--plum)] hover:bg-[var(--hover)]",
        gold: "bg-[var(--gold)] text-[var(--panel)] hover:brightness-105",
        danger: "bg-rose-100 text-rose-800 hover:bg-rose-200",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-4 min-w-[44px]",
        lg: "h-12 px-5 text-base",
        xl: "h-14 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
