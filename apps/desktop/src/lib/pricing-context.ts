import { createContext, useContext } from 'react';

export const PricingContext = createContext<() => void>(() => {});
export const usePricing = () => useContext(PricingContext);
