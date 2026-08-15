import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  phone: text("phone"),
  role: text("role").notNull().default("client"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
  brand: text("brand"),
  categoryId: uuid("category_id").references(() => categories.id),
  featured: boolean("featured").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  alt: text("alt"),
  sortOrder: integer("sort_order").default(0),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  width: numeric("width"),
  length: numeric("length"),
  size: text("size"),
  sizeSystem: text("size_system"),
  schoolLevel: text("school_level"),
  color: text("color"),
  sku: text("sku"),
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  stock: integer("stock").default(0),
  active: boolean("active").default(true),
});

export const inventorySources = pgTable("inventory_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  sellerShareRate: numeric("seller_share_rate", {
    precision: 5,
    scale: 4,
  }).notNull(),
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const variantOffers = pgTable("variant_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .references(() => productVariants.id, { onDelete: "cascade" })
    .notNull(),
  sourceId: uuid("source_id")
    .references(() => inventorySources.id, { onDelete: "restrict" })
    .notNull(),
  availabilityMode: text("availability_mode").notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
  stockQuantity: integer("stock_quantity"),
  priority: integer("priority").notNull().default(100),
  leadTimeMinHours: integer("lead_time_min_hours").notNull().default(0),
  leadTimeMaxHours: integer("lead_time_max_hours").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").references(() => profiles.clerkUserId, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  analyticsSessionId: uuid("analytics_session_id"),
  couponCode: text("coupon_code"),
  discountTotal: numeric("discount_total", { precision: 10, scale: 2 }).default("0"),
  stockRestored: boolean("stock_restored").default(false),
  stockReserved: boolean("stock_reserved").default(false),
  couponCounted: boolean("coupon_counted").default(false),
  reservationExpiresAt: timestamp("reservation_expires_at", {
    withTimezone: true,
  }),
  cancelReason: text("cancel_reason"),
  mercadopagoId: text("mercadopago_id"),
  mercadopagoStatus: text("mercadopago_status"),
  refundStatus: text("refund_status").notNull().default("none"),
  refundedAmount: numeric("refunded_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id").references(() => products.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  offerId: uuid("offer_id").references(() => variantOffers.id, {
    onDelete: "set null",
  }),
  sourceId: uuid("source_id").references(() => inventorySources.id, {
    onDelete: "set null",
  }),
  sourceCode: text("source_code"),
  sourceName: text("source_name"),
  availabilityMode: text("availability_mode"),
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
  procurementStatus: text("procurement_status").notNull().default("not_required"),
  procurementCollectedAt: timestamp("procurement_collected_at", {
    withTimezone: true,
  }),
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
  status: text("status").notNull().default("pending"),
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
  type: text("type").notNull(),
  value: numeric("value").notNull(),
  minPurchase: numeric("min_purchase", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storeSettings = pgTable("store_settings", {
  id: integer("id").primaryKey().default(1),
  storeName: text("store_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  whatsappPhone: text("whatsapp_phone"),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  businessHours: text("business_hours").notNull(),
  instagramUrl: text("instagram_url"),
  facebookUrl: text("facebook_url"),
  footerText: text("footer_text").notNull(),
  pickupEnabled: boolean("pickup_enabled").default(true),
  localDeliveryEnabled: boolean("local_delivery_enabled").default(false),
  localDeliveryCost: numeric("local_delivery_cost", {
    precision: 10,
    scale: 2,
  }).default("0"),
  pickupInstructions: text("pickup_instructions"),
  legalName: text("legal_name"),
  taxId: text("tax_id"),
  legalAddress: text("legal_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable("cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id")
    .references(() => profiles.clerkUserId, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id").references(() => products.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const profilesRelations = relations(profiles, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
  cartItems: many(cartItems),
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
  images: many(productImages),
  variants: many(productVariants),
  orderItems: many(orderItems),
  cartItems: many(cartItems),
  analyticsEvents: many(storefrontAnalyticsEvents),
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
  manualRefunds: many(manualRefunds),
  analyticsEvents: many(storefrontAnalyticsEvents),
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
