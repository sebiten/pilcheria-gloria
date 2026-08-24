export type Role = "client" | "admin";

export type OrderStatus =
  | "pending"
  | "paid"
  | "payment_review"
  | "ready_for_pickup"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentProvider = "mercadopago" | "viumi" | "bank_transfer";
export type PaymentAttemptStatus =
  | "created"
  | "pending"
  | "in_process"
  | "approved"
  | "rejected"
  | "cancelled"
  | "failed"
  | "review"
  | "refunded"
  | "charged_back";

export type CouponType = "percentage" | "fixed";

export type SizeSystem = "infant" | "adult";
export type SchoolLevel = "primary" | "secondary";
export type FulfillmentSpeed = "immediate" | "24_48_hours";
export type RefundStatus = "none" | "pending" | "partial" | "refunded";
export type UniformPriceGroupCode = "remera" | "chomba";

export interface UniformPriceGroup {
  code: UniformPriceGroupCode;
  name: string;
  price: number;
  updatedAt?: string;
}

export interface PricingTier {
  unitPrice: number;
  availableQuantity: number | null;
  fulfillment: FulfillmentSpeed;
}

export interface Profile {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  created_at: string;
}
//cate
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  brand: string | null;
  categoryId: string | null;
  uniformPriceGroup: UniformPriceGroup | null;
  featured: boolean;
  active: boolean;
  createdAt: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  sizeSystem: SizeSystem | null;
  schoolLevel: SchoolLevel | null;
  color: string | null;
  sku: string | null;
  priceOverride: number | null;
  stock: number;
  available: boolean;
  maxQuantity: number | null;
  onDemandAvailable: boolean;
  pricingTiers: PricingTier[];
  partnerPrice: number | null;
  partnerAvailable: boolean;
  active: boolean;
}

export interface ProductWithDetails extends Product {
  category: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
}

export interface ProductReview {
  id: string;
  product_id: string;
  clerk_user_id: string;
  order_id: string | null;
  rating: number;
  title: string | null;
  comment: string;
  reviewer_name: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export type PublicProductReview = Pick<
  ProductReview,
  | "id"
  | "rating"
  | "title"
  | "comment"
  | "reviewer_name"
  | "approved"
  | "created_at"
  | "updated_at"
>;

export interface ProductReviewStats {
  average: number;
  count: number;
}

export interface Address {
  id: string;
  profile_id?: string | null;
  clerk_user_id?: string | null;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string | null;
  is_default: boolean;
  created_at: string;
}

export interface ShippingAddress {
  name: string;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  references?: string | null;
}

export interface Order {
  id: string;
  profile_id?: string | null;
  clerk_user_id?: string | null;
  status: OrderStatus;
  total: number;
  shipping_cost: number;
  shipping_method: string | null;
  shipping_address: ShippingAddress | null;
  guest_access_token?: string | null;
  guest_access_token_hash?: string | null;
  coupon_code?: string | null;
  discount_total?: number | null;
  stock_restored?: boolean;
  stock_reserved?: boolean;
  reservation_expires_at?: string | null;
  cancel_reason?: string | null;
  mercadopago_id: string | null;
  mercadopago_status: string | null;
  mercadopago_status_detail?: string | null;
  refund_status?: RefundStatus;
  refunded_amount?: number;
  refunds?: ManualRefund[];
  created_at: string;
}

export interface OrderPaymentAttempt {
  id: string;
  order_id: string;
  provider: PaymentProvider;
  external_id: string | null;
  status: PaymentAttemptStatus;
  status_detail: string | null;
  checkout_url: string | null;
  amount: number;
  currency: string;
  receiver_account_id: string | null;
  created_at: string;
  updated_at: string;
  terminal_at: string | null;
  transfer_notified_at?: string | null;
  transfer_reviewed_at?: string | null;
  transfer_reviewed_by?: string | null;
  bank_reference?: string | null;
}

export interface BankTransferSettings {
  enabled: boolean;
  account_alias: string;
  account_holder: string;
  institution_name: string | null;
  account_number: string | null;
}

export interface BankTransferDetails {
  alias: string;
  holder: string;
  institution: string | null;
  accountNumber: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  source_code?: string | null;
  source_name?: string | null;
  availability_mode?: "finite" | "on_demand" | null;
  line_subtotal?: number | null;
  discount_allocated?: number;
  net_amount?: number | null;
  seller_share?: number | null;
  partner_share?: number;
  procurement_status?:
    | "not_required"
    | "awaiting_payment"
    | "pending_collection"
    | "collected"
    | "unavailable"
    | "cancelled";
  procurement_collected_at?: string | null;
}

export interface ManualRefund {
  id: string;
  order_id: string;
  order_item_id: string;
  method: "bank_transfer";
  status: "pending" | "paid" | "cancelled";
  amount: number;
  transfer_reference: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface OrderItemWithProduct extends OrderItem {
  product: Product;
  variant: ProductVariant | null;
}

export interface OrderWithItems extends Order {
  items: OrderItemWithProduct[];
}

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  min_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface CartItem {
  id?: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product?: ProductWithDetails;
}

export interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clearCart: () => void;
  total: number;
}

export interface StoreSettings {
  store_name: string;
  contact_email: string;
  contact_phone: string;
  whatsapp_phone: string | null;
  address_line: string;
  city: string;
  state: string;
  business_hours: string;
  instagram_url: string | null;
  facebook_url: string | null;
  footer_text: string;
  pickup_enabled: boolean;
  local_delivery_enabled: boolean;
  local_delivery_cost: number;
  pickup_instructions: string;
  legal_name: string | null;
  tax_id: string | null;
  legal_address: string | null;
}
