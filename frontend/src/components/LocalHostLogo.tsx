export function LocalHostLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/local-host-logo.png"
      alt=""
      className={`${className} object-contain`}
      draggable={false}
    />
  );
}
