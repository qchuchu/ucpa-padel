export type Offer = {
  club?: string;
  date?: string;
  start: string;
  end: string;
  duration: number;
  stock: number;
  price: number;
  type?: string;
  bookingUrl?: string;
  bookingUrls?: string[];
};

// An offer as produced by fetchAvailable: club + date always set. Exactly one of
// bookingUrl (single slot) or bookingUrls (stitched 2×1h) is present.
export type PolledOffer = Offer & { club: string; date: string };
