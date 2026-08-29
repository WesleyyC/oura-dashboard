export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={["brand-mark", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
