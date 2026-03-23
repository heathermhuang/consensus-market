const marketProfiles = {
  Tesla: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: TSLA",
    headquarters: "Austin, Texas, United States",
    profile: "Global EV and energy platform with delivery volume as the clearest quarterly demand signal.",
    majorHolders: ["Elon Musk", "Vanguard", "BlackRock"],
  },
  Uber: {
    exchange: "NYSE",
    primaryListing: "NYSE: UBER",
    headquarters: "San Francisco, California, United States",
    profile: "Mobility and delivery network where trip growth remains the most watched operating KPI.",
    majorHolders: ["Vanguard", "BlackRock", "Public Investment Fund"],
  },
  DoorDash: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: DASH",
    headquarters: "San Francisco, California, United States",
    profile: "Local commerce marketplace with marketplace-order volume as the core operating pulse.",
    majorHolders: ["Tony Xu", "Vanguard", "BlackRock"],
  },
  Airbnb: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: ABNB",
    headquarters: "San Francisco, California, United States",
    profile: "Global travel marketplace where booked nights and experiences frame demand momentum.",
    majorHolders: ["Brian Chesky", "Vanguard", "BlackRock"],
  },
  Spotify: {
    exchange: "NYSE",
    primaryListing: "NYSE: SPOT",
    headquarters: "Stockholm, Sweden",
    profile: "Global audio platform with MAUs anchoring the Street's growth narrative.",
    majorHolders: ["Daniel Ek", "Tencent", "Baillie Gifford"],
  },
  Grab: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: GRAB",
    headquarters: "Singapore",
    profile: "Southeast Asia superapp where monthly transacting users summarize consumer activity breadth.",
    majorHolders: ["Anthony Tan", "Uber", "Didi Global"],
  },
  Netflix: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: NFLX",
    headquarters: "Los Gatos, California, United States",
    profile: "Subscription streaming leader with paid memberships still central to investor debate.",
    majorHolders: ["Vanguard", "BlackRock", "Reed Hastings"],
  },
  Meta: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: META",
    headquarters: "Menlo Park, California, United States",
    profile: "Global consumer internet platform where family daily active people remains the scale benchmark.",
    majorHolders: ["Mark Zuckerberg", "Vanguard", "BlackRock"],
  },
  Sea: {
    exchange: "NYSE",
    primaryListing: "NYSE: SE",
    headquarters: "Singapore",
    profile: "E-commerce and digital entertainment group with order volume as the clearest commerce read-through.",
    majorHolders: ["Forrest Li", "Tencent", "Vanguard"],
  },
  Pinterest: {
    exchange: "NYSE",
    primaryListing: "NYSE: PINS",
    headquarters: "San Francisco, California, United States",
    profile: "Visual discovery platform where MAU momentum shapes the ad-demand setup.",
    majorHolders: ["Vanguard", "BlackRock", "Paul Sciarra"],
  },
  MercadoLibre: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: MELI",
    headquarters: "Montevideo, Uruguay",
    profile: "Latin America marketplace and fintech leader with active buyers as the top commerce KPI.",
    majorHolders: ["Marcos Galperin", "Baillie Gifford", "Dodge & Cox"],
  },
  Coinbase: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: COIN",
    headquarters: "New York, New York, United States",
    profile: "Crypto trading and custody platform where MTUs proxy risk appetite and retail activity.",
    majorHolders: ["Brian Armstrong", "Fred Ehrsam", "Vanguard"],
  },
  Roblox: {
    exchange: "NYSE",
    primaryListing: "NYSE: RBLX",
    headquarters: "San Mateo, California, United States",
    profile: "Immersive gaming platform where daily active users set the engagement floor.",
    majorHolders: ["David Baszucki", "Altos Ventures", "Vanguard"],
  },
  Lyft: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: LYFT",
    headquarters: "San Francisco, California, United States",
    profile: "North American rideshare platform with rides as the simplest operating demand indicator.",
    majorHolders: ["Vanguard", "Rakuten", "BlackRock"],
  },
  "Booking Holdings": {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: BKNG",
    headquarters: "Norwalk, Connecticut, United States",
    profile: "Global travel platform where room-night volume drives the quarterly pace of demand.",
    majorHolders: ["Vanguard", "BlackRock", "T. Rowe Price"],
  },
  Disney: {
    exchange: "NYSE",
    primaryListing: "NYSE: DIS",
    headquarters: "Burbank, California, United States",
    profile: "Diversified media company with Disney+ subscribers as a key direct-to-consumer signal.",
    majorHolders: ["Vanguard", "BlackRock", "State Street"],
  },
  Xiaomi: {
    exchange: "HKEX",
    primaryListing: "HKEX: 1810",
    headquarters: "Beijing, China",
    profile: "Consumer electronics platform where smartphone shipments remain the most watched volume metric.",
    majorHolders: ["Lei Jun", "Smart Mobile Holdings", "Lin Bin"],
  },
  Tencent: {
    exchange: "HKEX",
    primaryListing: "HKEX: 0700",
    headquarters: "Shenzhen, China",
    profile: "Platform and gaming giant where Weixin and WeChat MAU captures ecosystem scale.",
    majorHolders: ["Prosus", "Ma Huateng", "BlackRock"],
  },
  Apple: {
    exchange: "NASDAQ",
    primaryListing: "NASDAQ: AAPL",
    headquarters: "Cupertino, California, United States",
    profile: "Consumer hardware leader where iPhone unit volume sets the tone for product demand.",
    majorHolders: ["Berkshire Hathaway", "Vanguard", "BlackRock"],
  },
  Reddit: {
    exchange: "NYSE",
    primaryListing: "NYSE: RDDT",
    headquarters: "San Francisco, California, United States",
    profile: "Community platform where daily active uniques summarize product reach and monetization setup.",
    majorHolders: ["Advance Magazine Publishers", "Tencent", "Sam Altman"],
  },
};

export function getMarketProfile(company, ticker) {
  return (
    marketProfiles[company] || {
      exchange: "Primary listing",
      primaryListing: ticker,
      headquarters: "Profile not configured",
      profile: "Issuer profile details are not configured for this market yet.",
      majorHolders: [],
    }
  );
}

export default marketProfiles;
