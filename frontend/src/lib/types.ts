import type { components } from "./api-types";

export type User = components["schemas"]["UserOut"];
export type TokenPair = components["schemas"]["TokenPairOut"];
export type Category = components["schemas"]["CategoryOut"];
export type ProductListItem = components["schemas"]["ProductListItem"];
export type ProductDetail = components["schemas"]["ProductDetail"];
export type ProductVariant = components["schemas"]["ProductVariantOut"];
export type ProductImage = components["schemas"]["ProductImageOut"];
export type Review = components["schemas"]["ReviewOut"];
export type Rating = components["schemas"]["RatingOut"];
export type Cart = components["schemas"]["CartOut"];
export type CartLine = components["schemas"]["CartItemOut"];
export type Address = components["schemas"]["AddressOut"];
export type Quote = components["schemas"]["QuoteOut"];
export type Order = components["schemas"]["OrderOut"];
export type OrderItem = components["schemas"]["OrderItemOut"];
export type CheckoutStart = components["schemas"]["CheckoutStartOut"];
export type RazorpayBlock = components["schemas"]["RazorpayBlock"];

export type AdminProductListItem = components["schemas"]["AdminProductListItem"];
export type AdminProductDetail = components["schemas"]["AdminProductDetail"];
export type AdminVariant = components["schemas"]["AdminVariantOut"];
export type AdminImage = components["schemas"]["AdminImageOut"];
export type AdminCategory = components["schemas"]["AdminCategoryOut"];
export type AdminCoupon = components["schemas"]["AdminCouponOut"];
export type CouponUsage = components["schemas"]["CouponUsageOut"];
export type AdminOrder = components["schemas"]["AdminOrderOut"];
export type AdminOrderDetail = components["schemas"]["AdminOrderDetail"];
export type AdminUser = components["schemas"]["AdminUserOut"];
export type AdminAudit = components["schemas"]["AdminAuditOut"];
export type Summary = components["schemas"]["SummaryOut"];
export type RevenueDay = components["schemas"]["RevenueDayOut"];
export type TopProduct = components["schemas"]["TopProductOut"];
export type SalesByCategory = components["schemas"]["SalesByCategoryOut"];
export type CustomerGrowth = components["schemas"]["CustomerGrowthOut"];
export type LowStock = components["schemas"]["LowStockOut"];

/** Pagination envelope from the API. */
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export const ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
