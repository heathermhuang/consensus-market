const defaultCompanyBrand = {
  logo: "",
  glyph: "",
  surface: "#eef2f7",
  accent: "#17324c",
  ink: "#17324c",
  frame: "#ffffff",
  imageScale: "100%",
};

const defaultFirmBrand = {
  logo: "",
  glyph: "",
  surface: "#edf2f7",
  accent: "#345a78",
  ink: "#17324c",
  frame: "#ffffff",
  imageScale: "100%",
};

export const companyBrandAssets = {
  Tesla: { logo: "/company-logos/tesla.svg", surface: "#ffffff", accent: "#d12f2f", ink: "#7b2424", frame: "#ffffff", imageScale: "66%" },
  Uber: { logo: "/company-logos/uber.svg", surface: "#ffffff", accent: "#111111", ink: "#111111", frame: "#ffffff", imageScale: "68%" },
  DoorDash: { logo: "/company-logos/doordash.svg", surface: "#fff4ef", accent: "#eb5037", ink: "#b83c27", frame: "#fffdfc", imageScale: "66%" },
  Airbnb: { logo: "/company-logos/airbnb.svg", surface: "#fff2f3", accent: "#ff5a5f", ink: "#c6404a", frame: "#fffdfd", imageScale: "64%" },
  Spotify: { logo: "/company-logos/spotify.svg", surface: "#effcf4", accent: "#1db954", ink: "#147a38", frame: "#fafffc", imageScale: "66%" },
  Netflix: { logo: "/company-logos/netflix.svg", surface: "#261d21", accent: "#e50914", ink: "#ffffff", frame: "#191214", imageScale: "66%" },
  Meta: { logo: "/company-logos/meta.svg", surface: "#eff6ff", accent: "#0866ff", ink: "#0f3f8f", frame: "#fdfefe", imageScale: "68%" },
  Snap: { logo: "/company-logos/snapchat.svg", surface: "#fffdeb", accent: "#ffe23c", ink: "#7a6a00", frame: "#fffef7", imageScale: "62%" },
  Pinterest: { logo: "/company-logos/pinterest.svg", surface: "#fff3f2", accent: "#e60023", ink: "#a70d21", frame: "#fffefe", imageScale: "62%" },
  Roku: { logo: "/company-logos/roku.svg", surface: "#f5efff", accent: "#6f1ab6", ink: "#4b1280", frame: "#fcfaff", imageScale: "64%" },
  Duolingo: { logo: "/company-logos/duolingo.svg", surface: "#eefeed", accent: "#58cc02", ink: "#2f7b00", frame: "#fbfffa", imageScale: "66%" },
  Roblox: { logo: "/company-logos/roblox.svg", surface: "#f1f5f9", accent: "#111827", ink: "#111827", frame: "#ffffff", imageScale: "62%" },
  Lyft: { logo: "/company-logos/lyft.svg", surface: "#fff1ff", accent: "#ff00bf", ink: "#a10078", frame: "#fffafe", imageScale: "66%" },
  "Booking Holdings": { logo: "/company-logos/bookingholdings.com.png", surface: "#eef7ff", accent: "#003580", ink: "#003580", frame: "#fcfeff" },
  Disney: { logo: "/company-logos/thewaltdisneycompany.com.png", surface: "#eef4ff", accent: "#113ccf", ink: "#113ccf", frame: "#fbfdff" },
  "Match Group": { logo: "/company-logos/mtch.com.png", surface: "#fff1f4", accent: "#ff4f70", ink: "#bf3655", frame: "#fffdfd", imageScale: "68%" },
  Etsy: { logo: "/company-logos/etsy.svg", surface: "#fff4eb", accent: "#f1641e", ink: "#b74810", frame: "#fffdfb", imageScale: "66%" },
  Apple: { logo: "/company-logos/apple.svg", surface: "#f3f4f6", accent: "#111111", ink: "#111111", frame: "#ffffff", imageScale: "62%" },
  Reddit: { logo: "/company-logos/reddit.svg", surface: "#fff3ec", accent: "#ff4500", ink: "#b23600", frame: "#fffdfb", imageScale: "66%" },
  Grab: { logo: "/company-logos/grab.svg", surface: "#ecfff1", accent: "#00b14f", ink: "#15703f", frame: "#fbfffc" },
  Sea: { logo: "/company-logos/sea.com.png", surface: "#eef7ff", accent: "#1d78d6", ink: "#1c5594", frame: "#fbfeff" },
  MercadoLibre: { logo: "/company-logos/mercadolibre.com.png", surface: "#fff9dc", accent: "#ffe600", ink: "#746600", frame: "#fffef5" },
  Coinbase: { logo: "/company-logos/coinbase.svg", surface: "#eef4ff", accent: "#0052ff", ink: "#1540a1", frame: "#fbfcff" },
  Xiaomi: { logo: "/company-logos/xiaomi.svg", surface: "#fff3eb", accent: "#ff6900", ink: "#b94d00", frame: "#fffdfb" },
  Tencent: { logo: "/company-logos/tencent.com.png", surface: "#eef7ff", accent: "#0072ff", ink: "#194d91", frame: "#fbfdff" },
};

export const firmBrandAssets = {
  "Morgan Stanley": {
    logo: "/firm-logos/morganstanley.com.png",
    surface: "#eef3f8",
    accent: "#2f4f6f",
    ink: "#1f3550",
    frame: "#ffffff",
  },
  "Goldman Sachs": {
    logo: "/firm-logos/goldmansachs.svg",
    surface: "#eef7ff",
    accent: "#3e8ed0",
    ink: "#1f5a8a",
    frame: "#ffffff",
    imageScale: "64%",
  },
  JPMorgan: {
    logo: "/firm-logos/jpmorganchase.com.png",
    surface: "#f5efe9",
    accent: "#8a5c32",
    ink: "#5a3717",
    frame: "#fffdfb",
  },
  UBS: {
    logo: "/firm-logos/ubs.com.png",
    surface: "#fff2f2",
    accent: "#d12f2f",
    ink: "#8f1f1f",
    frame: "#fffdfd",
  },
  Barclays: {
    logo: "/firm-logos/barclays.svg",
    surface: "#edf6ff",
    accent: "#00aeef",
    ink: "#0c5f88",
    frame: "#fbfeff",
    imageScale: "64%",
  },
  "Wells Fargo": {
    logo: "/firm-logos/wellsfargo.svg",
    surface: "#fff4ea",
    accent: "#c32229",
    ink: "#8b1e24",
    frame: "#fffdfb",
    imageScale: "66%",
  },
  "Deutsche Bank": {
    logo: "/firm-logos/deutschebank.svg",
    surface: "#eef3ff",
    accent: "#0018a8",
    ink: "#193280",
    frame: "#fbfcff",
    imageScale: "62%",
  },
  "BofA Securities": {
    logo: "/firm-logos/bankofamerica.svg",
    surface: "#fff3f3",
    accent: "#e31837",
    ink: "#9f1930",
    frame: "#fffdfd",
    imageScale: "68%",
  },
  "Evercore ISI": {
    logo: "/firm-logos/evercore.com.png",
    surface: "#f2f6fb",
    accent: "#4d6883",
    ink: "#30465d",
    frame: "#ffffff",
  },
  Bernstein: {
    logo: "/firm-logos/bernstein.com.png",
    surface: "#f2f4f7",
    accent: "#5d6d80",
    ink: "#314255",
    frame: "#ffffff",
  },
};

export function getMonogram(name) {
  return String(name || "")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || "")
    .join("")
    .toUpperCase();
}

export function getCompanyBrand(company) {
  const asset = companyBrandAssets[company];
  return asset ? { ...defaultCompanyBrand, ...asset } : { ...defaultCompanyBrand, glyph: getMonogram(company) };
}

export function getFirmBrand(firm) {
  const asset = firmBrandAssets[firm];
  return asset ? { ...defaultFirmBrand, ...asset } : { ...defaultFirmBrand, glyph: getMonogram(firm) };
}
