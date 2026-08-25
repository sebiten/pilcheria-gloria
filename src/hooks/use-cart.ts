import { create } from "zustand";
import type { CartItem, ProductWithDetails } from "@/types";
import { getCartSubtotal } from "@/lib/commerce";
import { sanitizeStorefrontProduct } from "@/lib/inventory";
import { MAX_QUANTITY_PER_VARIANT } from "@/lib/commerce/constants";

const CART_STORAGE_KEY = "pilcheria-gloria-cart";
export const CART_PRICING_VERSION = 4;
let cartPricingIsFresh = true;

interface CartStore {
  items: CartItem[];
  legacyVariantItems: LegacyVariantItem[];
  isOpen: boolean;
  addItem: (
    product: ProductWithDetails,
    variantId: string,
    quantity?: number,
    options?: { openCart?: boolean }
  ) => void;
  removeItem: (productId: string, variantId: string) => void;
  updateQuantity: (productId: string, variantId: string, quantity: number) => void;
  setItems: (items: CartItem[]) => void;
  clearCart: () => void;
  toggleCart: () => void;
  setIsOpen: (isOpen: boolean) => void;
  getTotal: () => number;
  getItemCount: () => number;
}

const initialState = {
  items: [] as CartItem[],
  legacyVariantItems: [] as LegacyVariantItem[],
  isOpen: false,
};

type PersistedCartItem = Omit<CartItem, "variant_id"> & {
  variant_id?: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LegacyVariantItem = {
  productId: string;
  productName?: string;
  productSlug?: string;
};

function normalizeCartItems(value: unknown) {
  const itemsByKey = new Map<string, CartItem>();
  const legacyItemsByProduct = new Map<string, LegacyVariantItem>();
  const items = Array.isArray(value) ? value : [];

  for (const candidate of items) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      typeof candidate.product_id !== "string" ||
      !UUID_PATTERN.test(candidate.product_id)
    ) {
      continue;
    }

    const item = candidate as PersistedCartItem;
    if (
      typeof item.variant_id !== "string" ||
      !UUID_PATTERN.test(item.variant_id)
    ) {
      legacyItemsByProduct.set(item.product_id, {
        productId: item.product_id,
        productName: item.product?.name,
        productSlug: item.product?.slug,
      });
      continue;
    }

    const quantity = Number.isInteger(item.quantity)
      ? Math.min(MAX_QUANTITY_PER_VARIANT, Math.max(1, item.quantity))
      : 1;
    const key = `${item.product_id}:${item.variant_id}`;
    const existing = itemsByKey.get(key);

    if (existing) {
      itemsByKey.set(key, {
        ...existing,
        quantity: Math.max(existing.quantity, quantity),
      });
      continue;
    }

    itemsByKey.set(key, {
      ...item,
      variant_id: item.variant_id,
      quantity,
      product: item.product
        ? sanitizeStorefrontProduct(item.product)
        : undefined,
    });
  }

  return {
    items: Array.from(itemsByKey.values()),
    legacyVariantItems: Array.from(legacyItemsByProduct.values()),
  };
}

export const useCartStore = create<CartStore>()((set, get) => ({
  ...initialState,

  addItem: (
    product: ProductWithDetails,
    variantId: string,
    quantity = 1,
    options = {}
  ) => {
    set((state) => {
      const selectedVariant = product.variants.find((item) => item.id === variantId);
      if (!selectedVariant) {
        throw new Error("Elegí un talle válido antes de agregar la prenda");
      }
      const quantityLimit =
        selectedVariant.maxQuantity ?? MAX_QUANTITY_PER_VARIANT;
      const existingIndex = state.items.findIndex(
        (item) =>
          item.product_id === product.id &&
          item.variant_id === variantId
      );

      if (existingIndex > -1) {
        const newItems = [...state.items];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          product,
          quantity: Math.min(
            newItems[existingIndex].quantity + quantity,
            quantityLimit
          ),
        };
        return {
          items: newItems,
          legacyVariantItems: state.legacyVariantItems.filter(
            (item) => item.productId !== product.id
          ),
          isOpen: options.openCart === false ? state.isOpen : true,
        };
      }

      return {
        isOpen: options.openCart === false ? state.isOpen : true,
        items: [
          ...state.items,
          {
            product_id: product.id,
            variant_id: variantId,
            quantity: Math.min(quantity, quantityLimit),
            product,
          },
        ],
        legacyVariantItems: state.legacyVariantItems.filter(
          (item) => item.productId !== product.id
        ),
      };
    });
  },

  removeItem: (productId, variantId) => {
    set((state) => ({
      items: state.items.filter(
        (item) =>
          !(item.product_id === productId && item.variant_id === variantId)
      ),
    }));
  },

  updateQuantity: (productId, variantId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId, variantId);
      return;
    }

    set((state) => {
      const newItems = state.items.map((item) =>
        item.product_id === productId && item.variant_id === variantId
          ? { ...item, quantity }
          : item
      );
      return { items: newItems };
    });
  },

  setItems: (items) => {
    const normalized = normalizeCartItems(items);
    set((state) => ({
      items: normalized.items,
      legacyVariantItems: [
        ...state.legacyVariantItems,
        ...normalized.legacyVariantItems.filter(
          (legacy) =>
            !state.legacyVariantItems.some(
              (current) => current.productId === legacy.productId
            )
        ),
      ],
    }));
  },

  clearCart: () => set({ items: [], legacyVariantItems: [], isOpen: false }),

  toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

  setIsOpen: (isOpen) => set({ isOpen }),

  getTotal: () => {
    const { items } = get();
    return getCartSubtotal(items);
  },

  getItemCount: () => {
    const { items } = get();
    return items.reduce((count, item) => count + item.quantity, 0);
  },
}));

export function hydrateCartStore() {
  if (typeof window === "undefined") {
    return;
  }

  const stored = localStorage.getItem(CART_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      cartPricingIsFresh = parsed.pricingVersion === CART_PRICING_VERSION;
      if (parsed.state?.items) {
        const normalized = normalizeCartItems(parsed.state.items);
        useCartStore.setState(
          {
            items: normalized.items,
            legacyVariantItems: normalized.legacyVariantItems,
          },
          false
        );
      }
    } catch (e) {
      console.error("Error loading cart from localStorage", e);
    }
  }
}

export function cartNeedsPriceRefresh() {
  return !cartPricingIsFresh;
}

export function markCartPricingFresh() {
  cartPricingIsFresh = true;
}

export function subscribeCartStorePersistence() {
  if (typeof window === "undefined") {
    return () => {};
  }

  return useCartStore.subscribe((state) => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        pricingVersion: cartPricingIsFresh ? CART_PRICING_VERSION : 0,
        state: { items: state.items },
      })
    );
  });
}
