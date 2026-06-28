import React, { useState } from 'react';
import { useCart } from './CartContext';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Checkout from './Checkout';
import { useLanguage } from '../contexts/LanguageContext';

export default function CartDrawer() {
  const { t } = useLanguage();
  const { 
    items, 
    updateQuantity, 
    removeFromCart, 
    totalItems, 
    totalPrice, 
    isCheckoutOpen, 
    setIsCheckoutOpen, 
    isCartOpen, 
    setIsCartOpen 
  } = useCart();

  return (
    <>
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogTrigger render={
          <Button variant="outline" size="icon" className="relative h-10 w-10 rounded-full border-primary/20 bg-background/50 backdrop-blur-md">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Button>
        } />
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md !gap-0 flex flex-col p-0 max-h-[80dvh] sm:max-h-[85vh] overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Your Cart ({totalItems})
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-3">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
                <ShoppingCart className="h-12 w-12 opacity-20" />
                <p>Your cart is empty.</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.pkg.id} className="flex flex-col gap-2.5 p-3.5 bg-card border rounded-xl shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm truncate">{item.pkg.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.pkg.sessions} Sessions • {item.pkg.expiryDays} Days
                      </p>
                    </div>
                    <p className="font-bold text-primary text-sm shrink-0">{item.pkg.price.toLocaleString()} {t('payments.currency_le')}</p>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        onClick={() => updateQuantity(item.pkg.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        onClick={() => updateQuantity(item.pkg.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeFromCart(item.pkg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="px-5 py-4 border-t bg-card shrink-0 space-y-3">
              <div className="flex justify-between items-center font-bold text-base">
                <span>Total</span>
                <span className="text-primary">{totalPrice.toLocaleString()} {t('payments.currency_le')}</span>
              </div>
              <Button 
                className="w-full h-11 text-sm font-bold"
                onClick={() => {
                  setIsCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
              >
                Proceed to Checkout
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
