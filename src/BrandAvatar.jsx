import { useEffect, useState } from "react";
import { getMonogram } from "./brandSystem";

export default function BrandAvatar({ brand, label, className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [brand?.logo]);

  const fallback = brand?.glyph || getMonogram(label);

  return (
    <span
      className={`brand-avatar ${className}`.trim()}
      style={{
        "--brand-surface": brand?.surface || "#eef2f7",
        "--brand-accent": brand?.accent || "#17324c",
        "--brand-ink": brand?.ink || "#17324c",
        "--brand-frame": brand?.frame || "#ffffff",
        "--brand-image-scale": brand?.imageScale || "74%",
      }}
      aria-hidden="true"
    >
      <span className="brand-avatar-frame">
        {!imageFailed && brand?.logo ? (
          <img
            className="brand-avatar-logo"
            src={brand.logo}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="brand-avatar-fallback">{fallback}</span>
        )}
      </span>
    </span>
  );
}
