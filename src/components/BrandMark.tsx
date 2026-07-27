export function BrandMark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <img
        alt=""
        height="80"
        src={`${import.meta.env.BASE_URL}favicon.jpg`}
        width="80"
      />
    </span>
  );
}
