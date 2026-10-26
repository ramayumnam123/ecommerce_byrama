export const FREE_SHIPPING_THRESHOLD = 99_900; // ₹999
export const FLAT_SHIPPING_FEE = 9_900; // ₹99
export const CART_MAX_QTY = 99;
export const ADMIN_PAGE_SIZE = 20;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
] as const;

export const COLOR_FACETS = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "navy", label: "Navy" },
  { value: "crimson", label: "Crimson" },
  { value: "olive", label: "Olive" },
  { value: "sand", label: "Sand" },
] as const;

export const SIZE_FACETS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xl", label: "XL" },
] as const;

export const PRICE_BANDS = [
  { label: "Under ₹1,000", min: 0, max: 99_999 },
  { label: "₹1,000 – ₹2,500", min: 100_000, max: 250_000 },
  { label: "₹2,500 – ₹5,000", min: 250_000, max: 500_000 },
  { label: "₹5,000+", min: 500_000, max: undefined },
] as const;

export const ADMIN_PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
] as const;

export const STORE_NAME = "Maison";
export const STORE_TAGLINE = "Considered goods for everyday life";
export const SUPPORT_EMAIL = "support@maison.local";
