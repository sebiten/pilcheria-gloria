import { create } from "zustand";
import type { CartItem, ProductWithDetails } from "@/types";
import { getCartSubtotal } from "@/lib/commerce";
import { sanitizeStorefrontProduct } from "@/lib/inventory";

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: ProductWithDetails, variantId: string | null, quantity?: number) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  setItems: (items: CartItem[]) => void;
  clearCart: () => void;
  toggleCart: () => void;
  setIsOpen: (isOpen: boolean) => void;
  getTotal: () => number;
  getItemCount: () => number;
}

const initialState = {
  items: [] as CartItem[],
  isOpen: false,
};

function normalizeCartItems(items: CartItem[]) {
  const itemsByKey = new Map<string, CartItem>();

  for (const item of items) {
    const variantId = item.variant_id ?? null;
    const key = `${item.product_id}:${variantId ?? "default"}`;
    const existing = itemsByKey.get(key);

    if (existing) {
      itemsByKey.set(key, {
        ...existing,
        quantity: Math.max(existing.quantity, item.quantity),
      });
      continue;
    }

    itemsByKey.set(key, {
      ...item,
      variant_id: variantId,
      product: item.product
        ? sanitizeStorefrontProduct(item.product)
        : undefined,
    });
  }

  return Array.from(itemsByKey.values());
}

export const useCartStore = create<CartStore>()((set, get) => ({
  ...initialState,

  addItem: (product: ProductWithDetails, variantId: string | null, quantity = 1) => {
    set((state) => {
      const selectedVariant = variantId
        ? product.variants.find((item) => item.id === variantId)
        : null;
      const quantityLimit = selectedVariant?.maxQuantity ?? 10;
      const existingIndex = state.items.findIndex(
        (item) =>
          item.product_id === product.id &&
          item.variant_id === (variantId || null)
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
        return { items: newItems, isOpen: true };
      }

      return {
        isOpen: true,
        items: [
          ...state.items,
          {
            product_id: product.id,
            variant_id: variantId || null,
            quantity: Math.min(quantity, quantityLimit),
            product,
          },
        ],
      };
    });
  },

  removeItem: (productId, variantId = null) => {
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

  setItems: (items) =>
    set({
      items: normalizeCartItems(items),
    }),

  clearCart: () => set({ items: [], isOpen: false }),

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

  const stored = localStorage.getItem("pilcheria-gloria-cart");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.state?.items) {
        useCartStore.setState({ items: normalizeCartItems(parsed.state.items) }, false);
      }
    } catch (e) {
      console.error("Error loading cart from localStorage", e);
    }
  }
}

export function subscribeCartStorePersistence() {
  if (typeof window === "undefined") {
    return () => {};
  }

  return useCartStore.subscribe((state) => {
    localStorage.setItem(
      "pilcheria-gloria-cart",
      JSON.stringify({ state: { items: state.items } })
    );
  });
}
