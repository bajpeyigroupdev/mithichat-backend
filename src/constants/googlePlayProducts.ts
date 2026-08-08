/**
 * Centralized Google Play Product Catalog for Meethi Chat (Server-side)
 *
 * Immutable mapping of product ID to diamond entitlement and official INR price.
 * Server must ALWAYS derive diamond quantity from this catalog and never trust
 * client-supplied price or diamond amounts.
 */

export interface GooglePlayProductConfig {
  productId: string;
  diamonds: number;
  priceInr: number;
  formattedPrice: string;
}

export const GOOGLE_PLAY_PRODUCTS: Record<string, GooglePlayProductConfig> = {
  diamonds_800: {
    productId: 'diamonds_800',
    diamonds: 800,
    priceInr: 59,
    formattedPrice: '₹59',
  },
  diamonds_1350: {
    productId: 'diamonds_1350',
    diamonds: 1350,
    priceInr: 99,
    formattedPrice: '₹99',
  },
  diamonds_2700: {
    productId: 'diamonds_2700',
    diamonds: 2700,
    priceInr: 199,
    formattedPrice: '₹199',
  },
  diamonds_5400: {
    productId: 'diamonds_5400',
    diamonds: 5400,
    priceInr: 399,
    formattedPrice: '₹399',
  },
  diamonds_8100: {
    productId: 'diamonds_8100',
    diamonds: 8100,
    priceInr: 599,
    formattedPrice: '₹599',
  },
  diamonds_13500: {
    productId: 'diamonds_13500',
    diamonds: 13500,
    priceInr: 999,
    formattedPrice: '₹999',
  },
  diamonds_27000: {
    productId: 'diamonds_27000',
    diamonds: 27000,
    priceInr: 1999,
    formattedPrice: '₹1,999',
  },
  diamonds_67500: {
    productId: 'diamonds_67500',
    diamonds: 67500,
    priceInr: 4999,
    formattedPrice: '₹4,999',
  },
  diamonds_135000: {
    productId: 'diamonds_135000',
    diamonds: 135000,
    priceInr: 9999,
    formattedPrice: '₹9,999',
  },
};

export const GOOGLE_PLAY_PRODUCT_IDS = Object.keys(GOOGLE_PLAY_PRODUCTS);

export const getProductConfig = (productId: string): GooglePlayProductConfig | null => {
  return GOOGLE_PLAY_PRODUCTS[productId] || null;
};
