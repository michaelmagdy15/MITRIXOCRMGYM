import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Package } from '../types';

export interface CartItem {
  pkg: Package;
  quantity: number;
}

interface CartContextProps {
  items: CartItem[];
  addToCart: (pkg: Package) => void;
  removeFromCart: (pkgId: string) => void;
  updateQuantity: (pkgId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextProps | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (pkg: Package) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.pkg.id === pkg.id);
      if (existing) {
        return prev.map((item) =>
          item.pkg.id === pkg.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { pkg, quantity: 1 }];
    });
  };

  const removeFromCart = (pkgId: string) => {
    setItems((prev) => prev.filter((item) => item.pkg.id !== pkgId));
  };

  const updateQuantity = (pkgId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(pkgId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.pkg.id === pkgId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.pkg.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ 
      items, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      clearCart, 
      totalItems, 
      totalPrice,
      isCheckoutOpen,
      setIsCheckoutOpen,
      isCartOpen,
      setIsCartOpen
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
