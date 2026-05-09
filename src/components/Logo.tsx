import logo from "@/assets/logo.jpg";

export function Logo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={logo}
      alt="مستشفى برج الأطباء"
      width={size}
      height={size}
      className={`rounded-full object-cover ring-2 ring-primary/20 shadow-md ${className}`}
    />
  );
}