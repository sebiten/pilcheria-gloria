import {
  pgTable,
  text,
  boolean,
  integer,
  smallint,
  numeric,
  timestamp,
  uuid,
  jsonb,
  bigint,
  check,
  index,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type {
  BankTransferReviewResolution,
  AvailabilityMode,
  CheckoutInvalidationStatus,
  CouponType,
  InventorySourceType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  ProcurementStatus,
  RefundStatus,
  SchoolLevel,
  SizeSystem,
  UniformPriceGroupCode,
} from "@/types";

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    role: text("role").notNull().default("client"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check("profiles_role_check", sql`${table.role} in ('client', 'admin')`),
  ]
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("categories_parent_id_idx").on(table.parentId),
  index("categories_parent_active_idx")
    .on(table.parentId, table.sortOrder)
    .where(sql`${table.active} = true`),
]);

export const uniformPriceGroups = pgTable("uniform_price_groups", {
  code: text("code").$type<UniformPriceGroupCode>().primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check("uniform_price_groups_code_check", sql`${table.code} in ('remera', 'chomba')`),
  check("uniform_price_groups_price_check", sql`${table.price} > 0`),
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sizeGuide: text("size_guide"),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
    compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
    brand: text("brand"),
    categoryId: uuid("category_id").references(() => categories.id),
    uniformPriceGroupCode: text("uniform_price_group_code").references(
      () => uniformPriceGroups.code,
      { onUpdate: "cascade", onDelete: "restrict" }
    ),
    featured: boolean("featured").default(false),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      "products_compare_at_price_nonnegative",
      sql`${table.compareAtPrice} is null or ${table.compareAtPrice} >= 0`
    ),
    index("products_category_id_idx").on(table.categoryId),
    index("products_uniform_price_group_code_idx")
      .on(table.uniformPriceGroupCode)
      .where(sql`${table.uniformPriceGroupCode} is not null`),
    index("products_brand_active_idx")
      .on(sql`lower(${table.brand})`, table.active)
      .where(sql`${table.brand} is not null`),
  ]
);

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  alt: text("alt"),
  sortOrder: integer("sort_order").default(0),
}, (table) => [index("product_images_product_id_idx").on(table.productId)]);

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  width: numeric("width"),
  length: numeric("length"),
  size: text("size"),
  sizeSystem: text("size_system").$type<SizeSystem>(),
  schoolLevel: text("school_level").$type<SchoolLevel>(),
  color: text("color"),
  sku: text("sku"),
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  stock: integer("stock").default(0),
  active: boolean("active").default(true),
}, (table) => [
  check(
    "product_variants_apparel_identity",
    sql`(${table.size} is not null and btrim(${table.size}) <> '') or (${table.width} is not null and ${table.length} is not null)`
  ),
  check(
    "product_variants_size_system_check",
    sql`${table.sizeSystem} is null or ${table.sizeSystem} in ('infant', 'adult')`
  ),
  check(
    "product_variants_school_level_check",
    sql`${table.schoolLevel} is null or ${table.schoolLevel} in ('primary', 'secondary')`
  ),
  index("product_variants_product_id_idx").on(table.productId),
  uniqueIndex("product_variants_sku_unique")
    .on(sql`lower(${table.sku})`)
    .where(sql`${table.sku} is not null and btrim(${table.sku}) <> ''`),
  uniqueIndex("product_variants_product_apparel_unique")
    .on(
      table.productId,
      sql`lower(coalesce(${table.schoolLevel}, 'no-design'))`,
      sql`lower(coalesce(${table.sizeSystem}, 'legacy'))`,
      sql`lower(coalesce(${table.size}, ''))`,
      sql`lower(coalesce(${table.color}, ''))`
    )
    .where(sql`${table.size} is not null`),
]);

export const inventorySources = pgTable("inventory_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").$type<InventorySourceType>().notNull(),
  sellerShareRate: numeric("seller_share_rate", {
    precision: 5,
    scale: 4,
  }).notNull(),
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    "inventory_sources_type_check",
    sql`${table.sourceType} in ('own', 'partner')`
  ),
  check(
    "inventory_sources_share_check",
    sql`${table.sellerShareRate} >= 0 and ${table.sellerShareRate} <= 1`
  ),
]);

export const variantOffers = pgTable("variant_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .references(() => productVariants.id, { onDelete: "cascade" })
    .notNull(),
  sourceId: uuid("source_id")
    .references(() => inventorySources.id, { onDelete: "restrict" })
    .notNull(),
  availabilityMode: text("availability_mode").$type<AvailabilityMode>().notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
  stockQuantity: integer("stock_quantity"),
  priority: integer("priority").notNull().default(100),
  leadTimeMinHours: integer("lead_time_min_hours").notNull().default(0),
  leadTimeMaxHours: integer("lead_time_max_hours").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    "variant_offers_mode_check",
    sql`${table.availabilityMode} in ('finite', 'on_demand')`
  ),
  check("variant_offers_price_check", sql`${table.salePrice} > 0`),
  check(
    "variant_offers_stock_check",
    sql`(${table.availabilityMode} = 'finite' and ${table.stockQuantity} is not null and ${table.stockQuantity} >= 0) or (${table.availabilityMode} = 'on_demand' and ${table.stockQuantity} is null)`
  ),
  check(
    "variant_offers_lead_time_check",
    sql`${table.leadTimeMinHours} >= 0 and ${table.leadTimeMaxHours} >= ${table.leadTimeMinHours}`
  ),
  uniqueIndex("variant_offers_active_source_unique")
    .on(table.variantId, table.sourceId)
    .where(sql`${table.active} = true`),
  index("variant_offers_source_id_idx").on(table.sourceId),
  index("variant_offers_variant_priority_idx")
    .on(table.variantId, table.priority, table.id)
    .where(sql`${table.active} = true`),
]);

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").references(() => profiles.id),
  clerkUserId: text("clerk_user_id")
    .references(() => profiles.clerkUserId)
    .notNull(),
  name: text("name").notNull(),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("addresses_profile_id_idx").on(table.profileId),
  index("addresses_clerk_user_id_idx").on(table.clerkUserId),
]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").references(() => profiles.id),
  clerkUserId: text("clerk_user_id").references(() => profiles.clerkUserId),
  status: text("status").notNull().default("pending"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }),
  shippingMethod: text("shipping_method"),
  shippingAddress: jsonb("shipping_address"),
  guestAccessToken: text("guest_access_token"),
  guestAccessTokenHash: text("guest_access_token_hash"),
  analyticsSessionId: uuid("analytics_session_id"),
  checkoutPayloadHash: text("checkout_payload_hash"),
  checkoutOwnerFingerprint: text("checkout_owner_fingerprint"),
  couponCode: text("coupon_code"),
  discountTotal: numeric("discount_total", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  stockRestored: boolean("stock_restored").notNull().default(false),
  stockReserved: boolean("stock_reserved").notNull().default(false),
  couponCounted: boolean("coupon_counted").notNull().default(false),
  reservationExpiresAt: timestamp("reservation_expires_at", {
    withTimezone: true,
  }),
  cancelReason: text("cancel_reason"),
  mercadopagoId: text("mercadopago_id"),
  mercadopagoStatus: text("mercadopago_status"),
  mercadopagoStatusDetail: text("mercadopago_status_detail"),
  refundStatus: text("refund_status")
    .$type<RefundStatus>()
    .notNull()
    .default("none"),
  refundedAmount: numeric("refunded_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  check(
    "orders_status_check",
    sql`${table.status} in ('pending', 'paid', 'payment_review', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled')`
  ),
  check("orders_positive_total_check", sql`${table.total} > 0`),
  check("orders_discount_total_nonnegative", sql`${table.discountTotal} >= 0`),
  check(
    "orders_checkout_payload_hash_check",
    sql`${table.checkoutPayloadHash} is null or ${table.checkoutPayloadHash} ~ '^[0-9a-f]{64}$'`
  ),
  check(
    "orders_stock_flags_check",
    sql`not (${table.stockReserved} and ${table.stockRestored})`
  ),
  check(
    "orders_refund_status_check",
    sql`${table.refundStatus} in ('none', 'pending', 'partial', 'refunded')`
  ),
  check("orders_refunded_amount_check", sql`${table.refundedAmount} >= 0`),
  check(
    "orders_refund_not_above_total_check",
    sql`${table.refundedAmount} <= ${table.total}`
  ),
  index("orders_profile_id_idx").on(table.profileId),
  index("orders_clerk_user_id_idx").on(table.clerkUserId),
  index("orders_analytics_session_id_idx")
    .on(table.analyticsSessionId)
    .where(sql`${table.analyticsSessionId} is not null`),
  index("orders_guest_access_token_idx")
    .on(table.guestAccessToken)
    .where(sql`${table.guestAccessToken} is not null`),
  index("orders_guest_access_token_hash_idx")
    .on(table.guestAccessTokenHash)
    .where(sql`${table.guestAccessTokenHash} is not null`),
  index("orders_pending_reservation_expiry_idx")
    .on(table.reservationExpiresAt)
    .where(sql`${table.status} = 'pending'`),
  index("orders_checkout_fingerprint_created_at_idx")
    .on(
      sql`(${table.shippingAddress} ->> '_checkout_fingerprint')`,
      table.createdAt.desc()
    )
    .where(sql`${table.shippingAddress} ? '_checkout_fingerprint'`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id").references(() => products.id),
  variantId: uuid("variant_id")
    .references(() => productVariants.id)
    .notNull(),
  offerId: uuid("offer_id").references(() => variantOffers.id, {
    onDelete: "set null",
  }),
  sourceId: uuid("source_id").references(() => inventorySources.id, {
    onDelete: "set null",
  }),
  sourceCode: text("source_code"),
  sourceName: text("source_name"),
  productName: text("product_name").notNull(),
  productSlug: text("product_slug"),
  productBrand: text("product_brand"),
  variantSize: text("variant_size"),
  variantSizeSystem: text("variant_size_system").$type<SizeSystem>(),
  variantSchoolLevel: text("variant_school_level").$type<SchoolLevel>(),
  variantColor: text("variant_color"),
  variantSku: text("variant_sku"),
  variantLabel: text("variant_label"),
  availabilityMode: text("availability_mode").$type<AvailabilityMode>(),
  sellerShareRate: numeric("seller_share_rate", { precision: 5, scale: 4 }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineSubtotal: numeric("line_subtotal", { precision: 10, scale: 2 }),
  discountAllocated: numeric("discount_allocated", {
    precision: 10,
    scale: 2,
  }).notNull().default("0"),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }),
  sellerShare: numeric("seller_share", { precision: 10, scale: 2 }),
  partnerShare: numeric("partner_share", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  procurementStatus: text("procurement_status")
    .$type<ProcurementStatus>()
    .notNull()
    .default("not_required"),
  procurementCollectedAt: timestamp("procurement_collected_at", {
    withTimezone: true,
  }),
}, (table) => [
  check("order_items_positive_quantity_check", sql`${table.quantity} > 0`),
  check("order_items_positive_unit_price_check", sql`${table.unitPrice} > 0`),
  check(
    "order_items_availability_mode_check",
    sql`${table.availabilityMode} is null or ${table.availabilityMode} in ('finite', 'on_demand')`
  ),
  check(
    "order_items_procurement_status_check",
    sql`${table.procurementStatus} in ('not_required', 'awaiting_payment', 'pending_collection', 'collected', 'unavailable', 'cancelled')`
  ),
  check(
    "order_items_seller_share_rate_check",
    sql`${table.sellerShareRate} is null or (${table.sellerShareRate} >= 0 and ${table.sellerShareRate} <= 1)`
  ),
  check(
    "order_items_amounts_check",
    sql`${table.discountAllocated} >= 0 and ${table.partnerShare} >= 0 and (${table.lineSubtotal} is null or ${table.lineSubtotal} >= 0) and (${table.netAmount} is null or ${table.netAmount} >= 0) and (${table.sellerShare} is null or ${table.sellerShare} >= 0)`
  ),
  check(
    "order_items_financial_distribution_check",
    sql`(${table.lineSubtotal} is null or abs(${table.lineSubtotal} - ${table.unitPrice} * ${table.quantity}) <= 0.01) and (${table.netAmount} is null or ${table.lineSubtotal} is null or abs(${table.netAmount} - (${table.lineSubtotal} - ${table.discountAllocated})) <= 0.01) and (${table.sellerShare} is null or ${table.netAmount} is null or abs(${table.sellerShare} + ${table.partnerShare} - ${table.netAmount}) <= 0.01)`
  ),
  index("order_items_order_id_idx").on(table.orderId),
  index("order_items_product_id_idx").on(table.productId),
  index("order_items_variant_id_idx").on(table.variantId),
  index("order_items_offer_id_idx").on(table.offerId),
  index("order_items_source_id_idx").on(table.sourceId),
  index("order_items_procurement_idx")
    .on(table.procurementStatus, table.sourceId)
    .where(
      sql`${table.procurementStatus} in ('awaiting_payment', 'pending_collection')`
    ),
]);

export const orderPaymentAttempts = pgTable("order_payment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  provider: text("provider").$type<PaymentProvider>().notNull(),
  externalId: text("external_id"),
  providerCheckoutId: text("provider_checkout_id"),
  status: text("status")
    .$type<PaymentAttemptStatus>()
    .notNull()
    .default("created"),
  statusDetail: text("status_detail"),
  checkoutUrl: text("checkout_url"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("ARS"),
  receiverAccountId: text("receiver_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  terminalAt: timestamp("terminal_at", { withTimezone: true }),
  providerCheckoutInvalidationStatus: text(
    "provider_checkout_invalidation_status"
  ).$type<CheckoutInvalidationStatus>(),
  providerCheckoutInvalidationDetail: text(
    "provider_checkout_invalidation_detail"
  ),
  providerCheckoutInvalidationAt: timestamp(
    "provider_checkout_invalidation_at",
    { withTimezone: true }
  ),
  lateReconciliationUntil: timestamp("late_reconciliation_until", {
    withTimezone: true,
  }),
  lateReconciledAt: timestamp("late_reconciled_at", { withTimezone: true }),
  transferNotifiedAt: timestamp("transfer_notified_at", { withTimezone: true }),
  transferReviewedAt: timestamp("transfer_reviewed_at", { withTimezone: true }),
  transferReviewedBy: text("transfer_reviewed_by"),
  bankReference: text("bank_reference"),
  reviewDeadlineAt: timestamp("review_deadline_at", { withTimezone: true }),
  reviewMaxDeadlineAt: timestamp("review_max_deadline_at", { withTimezone: true }),
  reviewEscalatedAt: timestamp("review_escalated_at", { withTimezone: true }),
  reviewResolution: text("review_resolution").$type<BankTransferReviewResolution>(),
  reviewNotes: text("review_notes"),
  proofReference: text("proof_reference"),
}, (table) => [
  check(
    "order_payment_attempts_provider_check",
    sql`${table.provider} in ('mercadopago', 'viumi', 'bank_transfer')`
  ),
  check(
    "order_payment_attempts_status_check",
    sql`${table.status} in ('created', 'pending', 'in_process', 'approved', 'rejected', 'cancelled', 'failed', 'review', 'refunded', 'charged_back')`
  ),
  check("order_payment_attempts_amount_check", sql`${table.amount} > 0`),
  check(
    "order_payment_attempts_currency_check",
    sql`${table.currency} ~ '^[A-Z]{3}$'`
  ),
  check(
    "order_payment_attempts_checkout_invalidation_status_check",
    sql`${table.providerCheckoutInvalidationStatus} is null or ${table.providerCheckoutInvalidationStatus} in ('succeeded', 'failed', 'not_supported')`
  ),
  check(
    "order_payment_attempts_review_resolution_check",
    sql`${table.reviewResolution} is null or ${table.reviewResolution} in ('approved', 'rejected', 'expired_stock_released', 'approved_after_stock_release')`
  ),
  check(
    "order_payment_attempts_bank_review_deadlines_check",
    sql`${table.provider} <> 'bank_transfer' or ${table.status} <> 'review' or (${table.reviewDeadlineAt} is not null and ${table.reviewMaxDeadlineAt} is not null and ${table.reviewMaxDeadlineAt} >= ${table.reviewDeadlineAt})`
  ),
  uniqueIndex("order_payment_attempts_external_uidx")
    .on(table.provider, table.externalId)
    .where(sql`${table.externalId} is not null`),
  uniqueIndex("order_payment_attempts_provider_checkout_uidx")
    .on(table.provider, table.providerCheckoutId)
    .where(sql`${table.providerCheckoutId} is not null`),
  uniqueIndex("order_payment_attempts_one_active_uidx")
    .on(table.orderId)
    .where(
      sql`${table.status} in ('created', 'pending', 'in_process', 'review')`
    ),
  index("order_payment_attempts_order_created_idx").on(
    table.orderId,
    table.createdAt.desc()
  ),
  index("order_payment_attempts_late_reconciliation_idx")
    .on(table.lateReconciledAt, table.lateReconciliationUntil)
    .where(
      sql`${table.provider} = 'mercadopago' and ${table.status} in ('created', 'pending', 'in_process', 'review', 'rejected', 'cancelled', 'failed') and ${table.lateReconciliationUntil} is not null`
    ),
  index("order_payment_attempts_bank_review_deadline_idx")
    .on(table.reviewDeadlineAt, table.reviewMaxDeadlineAt)
    .where(
      sql`${table.provider} = 'bank_transfer' and ${table.status} = 'review' and ${table.reviewResolution} is null`
    ),
]);

export const paymentFlowEvents = pgTable(
  "payment_flow_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    eventName: text("event_name").notNull(),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    attemptId: uuid("attempt_id").references(() => orderPaymentAttempts.id, {
      onDelete: "set null",
    }),
    provider: text("provider"),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    externalId: text("external_id"),
    providerCheckoutId: text("provider_checkout_id"),
    route: text("route").notNull().default("database_trigger"),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payment_flow_events_order_created_idx").on(
      table.orderId,
      table.createdAt.desc()
    ),
    index("payment_flow_events_attempt_created_idx")
      .on(table.attemptId, table.createdAt.desc())
      .where(sql`${table.attemptId} is not null`),
  ]
);

export const orderPaymentReconciliationEvents = pgTable(
  "order_payment_reconciliation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    attemptId: uuid("attempt_id").references(() => orderPaymentAttempts.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    paymentId: text("payment_id").notNull(),
    paymentStatus: text("payment_status").notNull(),
    previousOrderStatus: text("previous_order_status")
      .$type<OrderStatus>()
      .notNull(),
    nextOrderStatus: text("next_order_status").$type<OrderStatus>().notNull(),
    ambiguous: boolean("ambiguous").notNull().default(false),
    candidatePaymentIds: jsonb("candidate_payment_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "order_payment_reconciliation_source_check",
      sql`${table.source} in ('webhook', 'buyer_return', 'order_query', 'expiration_cron', 'admin_resolution')`
    ),
    check(
      "order_payment_reconciliation_candidates_check",
      sql`jsonb_typeof(${table.candidatePaymentIds}) = 'array'`
    ),
    uniqueIndex("order_payment_reconciliation_dedupe_idx").on(
      table.orderId,
      table.source,
      table.paymentId,
      table.paymentStatus,
      table.nextOrderStatus
    ),
    index("order_payment_reconciliation_attempt_idx")
      .on(table.attemptId)
      .where(sql`${table.attemptId} is not null`),
    index("order_payment_reconciliation_review_idx")
      .on(table.createdAt, table.orderId)
      .where(sql`${table.ambiguous}`),
  ]
);

export const orderPaymentReviewResolutions = pgTable(
  "order_payment_review_resolutions",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    selectedPaymentId: text("selected_payment_id").notNull(),
    candidatePaymentIds: jsonb("candidate_payment_ids")
      .$type<string[]>()
      .notNull(),
    claimToken: uuid("claim_token").notNull(),
    status: text("status").notNull(),
    claimedBy: text("claimed_by").notNull(),
    errorMessage: text("error_message"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "order_payment_review_resolution_candidates_check",
      sql`jsonb_typeof(${table.candidatePaymentIds}) = 'array'`
    ),
    check(
      "order_payment_review_resolution_status_check",
      sql`${table.status} in ('resolving', 'failed', 'resolved')`
    ),
  ]
);

export const bankTransferSettings = pgTable("bank_transfer_settings", {
  id: smallint("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  accountAlias: text("account_alias").notNull().default(""),
  accountHolder: text("account_holder").notNull().default(""),
  institutionName: text("institution_name"),
  accountNumber: text("account_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("bank_transfer_settings_id_check", sql`${table.id} = 1`),
  check(
    "bank_transfer_settings_alias_check",
    sql`char_length(${table.accountAlias}) <= 120`
  ),
  check(
    "bank_transfer_settings_holder_check",
    sql`char_length(${table.accountHolder}) <= 160`
  ),
  check(
    "bank_transfer_settings_institution_check",
    sql`${table.institutionName} is null or char_length(${table.institutionName}) <= 160`
  ),
  check(
    "bank_transfer_settings_account_check",
    sql`${table.accountNumber} is null or char_length(${table.accountNumber}) <= 64`
  ),
]);

export const productReviewInvites = pgTable("product_review_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productReviews = pgTable("product_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  clerkUserId: text("clerk_user_id").references(() => profiles.clerkUserId, {
    onDelete: "cascade",
  }),
  orderId: uuid("order_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  guestInviteId: uuid("guest_invite_id").references(
    () => productReviewInvites.id,
    { onDelete: "set null" }
  ),
  rating: integer("rating").notNull(),
  title: text("title"),
  comment: text("comment").notNull(),
  reviewerName: text("reviewer_name"),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerSettlements = pgTable("partner_settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .references(() => inventorySources.id, { onDelete: "restrict" })
    .notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manualRefunds = pgTable("manual_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "restrict" })
    .notNull(),
  orderItemId: uuid("order_item_id")
    .references(() => orderItems.id, { onDelete: "restrict" })
    .notNull(),
  method: text("method").notNull().default("bank_transfer"),
  status: text("status").$type<OrderStatus>().notNull().default("pending"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  transferReference: text("transfer_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const partnerLedgerEntries = pgTable("partner_ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .references(() => inventorySources.id, { onDelete: "restrict" })
    .notNull(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  orderItemId: uuid("order_item_id").references(() => orderItems.id, {
    onDelete: "set null",
  }),
  settlementId: uuid("settlement_id").references(() => partnerSettlements.id, {
    onDelete: "set null",
  }),
  entryType: text("entry_type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: text("type").$type<CouponType>().notNull(),
  value: numeric("value").notNull(),
  minPurchase: numeric("min_purchase", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  check("coupons_type_check", sql`${table.type} in ('percentage', 'fixed')`),
]);

export const storeSettings = pgTable("store_settings", {
  id: integer("id").primaryKey().default(1),
  storeName: text("store_name").notNull().default("Pune Colchones"),
  contactEmail: text("contact_email").notNull().default("info@pune.com.ar"),
  contactPhone: text("contact_phone").notNull().default("+54 11 1234-5678"),
  whatsappPhone: text("whatsapp_phone"),
  addressLine: text("address_line").notNull().default("Av. Industrial 1234"),
  city: text("city").notNull().default("Buenos Aires"),
  state: text("state").notNull().default("Argentina"),
  businessHours: text("business_hours")
    .notNull()
    .default("Lunes a Viernes: 9:00 - 18:00 | Sabados: 9:00 - 13:00"),
  instagramUrl: text("instagram_url"),
  facebookUrl: text("facebook_url"),
  footerText: text("footer_text")
    .notNull()
    .default(
      "Mas de 30 anos fabricando colchones y sommiers con los mejores materiales. El descanso que tu familia merece."
    ),
  standardShippingCost: numeric("standard_shipping_cost").notNull().default("5000"),
  expressShippingCost: numeric("express_shipping_cost").notNull().default("10000"),
  freeShippingThreshold: numeric("free_shipping_threshold")
    .notNull()
    .default("50000"),
  pickupEnabled: boolean("pickup_enabled").notNull().default(true),
  localDeliveryEnabled: boolean("local_delivery_enabled")
    .notNull()
    .default(false),
  localDeliveryCost: numeric("local_delivery_cost", {
    precision: 10,
    scale: 2,
  }).notNull().default("0"),
  pickupInstructions: text("pickup_instructions")
    .notNull()
    .default("Retirá tu compra en el local cuando te confirmemos que está lista."),
  legalName: text("legal_name"),
  taxId: text("tax_id"),
  legalAddress: text("legal_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  check("store_settings_id_check", sql`${table.id} = 1`),
  check(
    "store_settings_local_delivery_cost_nonnegative",
    sql`${table.localDeliveryCost} >= 0`
  ),
  check(
    "store_settings_fulfillment_enabled",
    sql`${table.pickupEnabled} or ${table.localDeliveryEnabled}`
  ),
]);

export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestCode: text("request_code").notNull().unique(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  orderReference: text("order_reference").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("received"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const orderNotifications = pgTable("order_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull().default("pending"),
  providerId: text("provider_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const adminNotifications = pgTable("admin_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  eventKey: text("event_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  pushClaimedAt: timestamp("push_claimed_at", { withTimezone: true }),
  pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminPushSubscriptions = pgTable("admin_push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id")
    .references(() => profiles.clerkUserId, { onDelete: "cascade" })
    .notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storefrontAnalyticsEvents = pgTable("storefront_analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  eventName: text("event_name").notNull(),
  path: text("path").notNull(),
  productId: uuid("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  schoolId: text("school_id"),
  source: text("source").notNull().default("direct"),
  deviceType: text("device_type").notNull(),
  quantity: integer("quantity"),
  orderId: uuid("order_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  analyticsVersion: smallint("analytics_version").notNull().default(1),
  campaign: text("campaign"),
  medium: text("medium"),
  content: text("content"),
  eventDetail: text("event_detail"),
  paymentId: text("payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable("cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").references(() => profiles.id),
  clerkUserId: text("clerk_user_id")
    .references(() => profiles.clerkUserId, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id").references(() => products.id),
  variantId: uuid("variant_id")
    .references(() => productVariants.id)
    .notNull(),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  unique("cart_items_clerk_user_id_product_id_variant_id_key").on(
    table.clerkUserId,
    table.productId,
    table.variantId
  ),
  unique("cart_items_profile_id_product_id_variant_id_key").on(
    table.profileId,
    table.productId,
    table.variantId
  ),
  index("cart_items_product_id_idx").on(table.productId),
  index("cart_items_variant_id_idx").on(table.variantId),
]);

export const profilesRelations = relations(profiles, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
  cartItems: many(cartItems),
  reviews: many(productReviews),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  uniformPriceGroup: one(uniformPriceGroups, {
    fields: [products.uniformPriceGroupCode],
    references: [uniformPriceGroups.code],
  }),
  images: many(productImages),
  variants: many(productVariants),
  orderItems: many(orderItems),
  cartItems: many(cartItems),
  analyticsEvents: many(storefrontAnalyticsEvents),
  reviews: many(productReviews),
  reviewInvites: many(productReviewInvites),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  offers: many(variantOffers),
}));

export const inventorySourcesRelations = relations(inventorySources, ({ many }) => ({
  offers: many(variantOffers),
  settlements: many(partnerSettlements),
  ledgerEntries: many(partnerLedgerEntries),
}));

export const variantOffersRelations = relations(variantOffers, ({ one, many }) => ({
  variant: one(productVariants, {
    fields: [variantOffers.variantId],
    references: [productVariants.id],
  }),
  source: one(inventorySources, {
    fields: [variantOffers.sourceId],
    references: [inventorySources.id],
  }),
  orderItems: many(orderItems),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  profile: one(profiles, {
    fields: [addresses.profileId],
    references: [profiles.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [orders.profileId],
    references: [profiles.id],
  }),
  items: many(orderItems),
  paymentAttempts: many(orderPaymentAttempts),
  paymentFlowEvents: many(paymentFlowEvents),
  reconciliationEvents: many(orderPaymentReconciliationEvents),
  paymentReviewResolution: one(orderPaymentReviewResolutions),
  manualRefunds: many(manualRefunds),
  analyticsEvents: many(storefrontAnalyticsEvents),
  reviews: many(productReviews),
  reviewInvites: many(productReviewInvites),
}));

export const orderPaymentAttemptsRelations = relations(
  orderPaymentAttempts,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [orderPaymentAttempts.orderId],
      references: [orders.id],
    }),
    paymentFlowEvents: many(paymentFlowEvents),
    reconciliationEvents: many(orderPaymentReconciliationEvents),
  })
);

export const paymentFlowEventsRelations = relations(
  paymentFlowEvents,
  ({ one }) => ({
    order: one(orders, {
      fields: [paymentFlowEvents.orderId],
      references: [orders.id],
    }),
    attempt: one(orderPaymentAttempts, {
      fields: [paymentFlowEvents.attemptId],
      references: [orderPaymentAttempts.id],
    }),
  })
);

export const orderPaymentReconciliationEventsRelations = relations(
  orderPaymentReconciliationEvents,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderPaymentReconciliationEvents.orderId],
      references: [orders.id],
    }),
    attempt: one(orderPaymentAttempts, {
      fields: [orderPaymentReconciliationEvents.attemptId],
      references: [orderPaymentAttempts.id],
    }),
  })
);

export const orderPaymentReviewResolutionsRelations = relations(
  orderPaymentReviewResolutions,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderPaymentReviewResolutions.orderId],
      references: [orders.id],
    }),
  })
);

export const productReviewInvitesRelations = relations(
  productReviewInvites,
  ({ one }) => ({
    order: one(orders, {
      fields: [productReviewInvites.orderId],
      references: [orders.id],
    }),
    product: one(products, {
      fields: [productReviewInvites.productId],
      references: [products.id],
    }),
  })
);

export const productReviewsRelations = relations(productReviews, ({ one }) => ({
  product: one(products, {
    fields: [productReviews.productId],
    references: [products.id],
  }),
  profile: one(profiles, {
    fields: [productReviews.clerkUserId],
    references: [profiles.clerkUserId],
  }),
  order: one(orders, {
    fields: [productReviews.orderId],
    references: [orders.id],
  }),
  guestInvite: one(productReviewInvites, {
    fields: [productReviews.guestInviteId],
    references: [productReviewInvites.id],
  }),
}));

export const storefrontAnalyticsEventsRelations = relations(
  storefrontAnalyticsEvents,
  ({ one }) => ({
    product: one(products, {
      fields: [storefrontAnalyticsEvents.productId],
      references: [products.id],
    }),
    order: one(orders, {
      fields: [storefrontAnalyticsEvents.orderId],
      references: [orders.id],
    }),
  })
);

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  offer: one(variantOffers, {
    fields: [orderItems.offerId],
    references: [variantOffers.id],
  }),
  source: one(inventorySources, {
    fields: [orderItems.sourceId],
    references: [inventorySources.id],
  }),
  manualRefunds: many(manualRefunds),
}));

export const manualRefundsRelations = relations(manualRefunds, ({ one }) => ({
  order: one(orders, {
    fields: [manualRefunds.orderId],
    references: [orders.id],
  }),
  orderItem: one(orderItems, {
    fields: [manualRefunds.orderItemId],
    references: [orderItems.id],
  }),
}));

export const partnerSettlementsRelations = relations(
  partnerSettlements,
  ({ one, many }) => ({
    source: one(inventorySources, {
      fields: [partnerSettlements.sourceId],
      references: [inventorySources.id],
    }),
    ledgerEntries: many(partnerLedgerEntries),
  })
);

export const partnerLedgerEntriesRelations = relations(
  partnerLedgerEntries,
  ({ one }) => ({
    source: one(inventorySources, {
      fields: [partnerLedgerEntries.sourceId],
      references: [inventorySources.id],
    }),
    order: one(orders, {
      fields: [partnerLedgerEntries.orderId],
      references: [orders.id],
    }),
    orderItem: one(orderItems, {
      fields: [partnerLedgerEntries.orderItemId],
      references: [orderItems.id],
    }),
    settlement: one(partnerSettlements, {
      fields: [partnerLedgerEntries.settlementId],
      references: [partnerSettlements.id],
    }),
  })
);

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  profile: one(profiles, {
    fields: [cartItems.clerkUserId],
    references: [profiles.clerkUserId],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type UniformPriceGroup = typeof uniformPriceGroups.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type InventorySource = typeof inventorySources.$inferSelect;
export type NewInventorySource = typeof inventorySources.$inferInsert;
export type VariantOffer = typeof variantOffers.$inferSelect;
export type NewVariantOffer = typeof variantOffers.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderPaymentAttempt = typeof orderPaymentAttempts.$inferSelect;
export type NewOrderPaymentAttempt = typeof orderPaymentAttempts.$inferInsert;
export type PaymentFlowEvent = typeof paymentFlowEvents.$inferSelect;
export type NewPaymentFlowEvent = typeof paymentFlowEvents.$inferInsert;
export type OrderPaymentReconciliationEvent =
  typeof orderPaymentReconciliationEvents.$inferSelect;
export type NewOrderPaymentReconciliationEvent =
  typeof orderPaymentReconciliationEvents.$inferInsert;
export type OrderPaymentReviewResolution =
  typeof orderPaymentReviewResolutions.$inferSelect;
export type NewOrderPaymentReviewResolution =
  typeof orderPaymentReviewResolutions.$inferInsert;
export type ManualRefund = typeof manualRefunds.$inferSelect;
export type NewManualRefund = typeof manualRefunds.$inferInsert;
export type PartnerSettlement = typeof partnerSettlements.$inferSelect;
export type NewPartnerSettlement = typeof partnerSettlements.$inferInsert;
export type PartnerLedgerEntry = typeof partnerLedgerEntries.$inferSelect;
export type NewPartnerLedgerEntry = typeof partnerLedgerEntries.$inferInsert;
export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type NewStoreSettings = typeof storeSettings.$inferInsert;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type NewWithdrawalRequest = typeof withdrawalRequests.$inferInsert;
export type OrderNotification = typeof orderNotifications.$inferSelect;
export type NewOrderNotification = typeof orderNotifications.$inferInsert;
export type StorefrontAnalyticsEvent = typeof storefrontAnalyticsEvents.$inferSelect;
export type NewStorefrontAnalyticsEvent = typeof storefrontAnalyticsEvents.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
