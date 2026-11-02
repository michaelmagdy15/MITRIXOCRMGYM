import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../context';
import { useCart } from './CartContext';
import CartDrawer from './CartDrawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Calendar, MapPin, Clock, Bell, LogIn, LogOut, ShieldAlert, Dumbbell, Map, MessageSquare, ChevronRight, X, Tag, RefreshCcw, ArrowUpRight, Info, ShoppingCart, Building2, Star, Gift, Megaphone, UserPlus, Users, User, LayoutDashboard, Sun, Moon, Sparkles, Search, Filter, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Client, Package, StorefrontConfig } from '../types';
import { getTenantId, db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format, addDays, parseISO, isToday, isSameDay, startOfDay } from 'date-fns';

const STRIKE_STORAGE_IMG = {
  adult10s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fadult-10s.jpg?alt=media&token=4887c4d0-6b8d-48bd-a565-5d5f0026d496",
  adult20s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fadult-20s.jpg?alt=media&token=20c9cab3-abf7-4a2b-bb6a-06ebb877d24d",
  adult30s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fadult-30s.jpg?alt=media&token=6e0913f5-8470-44c5-99e9-a9a2a852b85c",
  adult5s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fadult-5s.jpg?alt=media&token=3daae182-e32d-47b6-9141-5708d79242d5",
  adult6m: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fadult-6m.jpg?alt=media&token=be71852a-e754-464f-8450-e9e950719313",
  adultDrop: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fadult-drop.jpg?alt=media&token=1089f09b-eb78-4a15-bc2f-7082ea7f6595",
  bannerAdults: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fbanner-adults.jpg?alt=media&token=d69a8f65-c2c8-4451-bc45-37b0561ac626",
  bannerImpact: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fbanner-impact.jpg?alt=media&token=bb798c8a-1c8e-49b5-944c-40d1ea17c9b8",
  bannerJuniors: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fbanner-juniors.jpg?alt=media&token=f0f13264-05f2-40ba-853a-dd133679a1f7",
  bannerKids: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fbanner-kids.jpg?alt=media&token=f770d0af-8bcd-4986-8118-50fa18b4632a",
  extraKids: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fextra-kids.jpg?alt=media&token=a9bffcb9-1517-4864-9f18-d00f05c70886",
  extraPro: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fextra-pro.jpg?alt=media&token=d8fef2a6-e9a5-41a2-8eab-5d1ee98d54ec",
  fighterTeam12m: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Ffighter-team-12m.jpg?alt=media&token=5fe271bd-4756-43e8-b831-a75e56543b76",
  fighterTeam3m: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Ffighter-team-3m.jpg?alt=media&token=4a57977a-0402-45da-af00-ef146751091c",
  fighterTeam6m: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Ffighter-team-6m.jpg?alt=media&token=8623f200-a90a-4423-9187-3838c93734c2",
  goldenPackage: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fgolden-package.jpg?alt=media&token=5583fa25-67e5-4501-aa57-2357420d1369",
  heroAdults: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fhero-adults.jpg?alt=media&token=e19d4f0a-3622-4451-a8a9-7cf5b5cd7205",
  heroImpact: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fhero-impact.jpg?alt=media&token=6ea7d734-8fb6-4ced-8a1e-2cf5cbb6e531",
  heroKidsJuniors: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fhero-kids-juniors.jpg?alt=media&token=77f24c77-34a0-4de2-a643-564c85cac206",
  kidsMivida10: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fkids-mivida-10.jpg?alt=media&token=e8c7ebab-dd6c-4493-b3d0-8a2d70979c52",
  kidsMivida20: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fkids-mivida-20.jpg?alt=media&token=88ca10ef-c03a-426c-82d6-b1e08eaa0436",
  kidsMivida30: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fkids-mivida-30.jpg?alt=media&token=48c70db6-767b-4708-aa22-311b84dd88fd",
  program1Welcome: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fprogram-1-welcome.jpg?alt=media&token=62a94a16-25b4-4c4f-889c-a65fc07a7310",
  program2KidsJuniors: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fprogram-2-kids-juniors.jpg?alt=media&token=31109a85-b23b-476e-8a27-4d24589c397f",
  program3KidsJuniorsPro: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fprogram-3-kids-juniors-pro.jpg?alt=media&token=72dd882d-5aac-4254-8a73-c749937f829d",
  pt10s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fpt-10s.jpg?alt=media&token=6780dd1d-551b-4186-a35a-fc665aca0575",
  pt20s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fpt-20s.jpg?alt=media&token=07708820-5750-403c-bd75-71828cab8634",
  pt30s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fpt-30s.jpg?alt=media&token=86e0adfc-36a5-4f13-b81b-ce375a604949",
  pt5s: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fpt-5s.jpg?alt=media&token=865ee9c8-0f7d-49c5-8e31-273707a1f497",
  ptDrop: "https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/strike-packages%2Fpt-drop.jpg?alt=media&token=dfc8d8c7-f29b-4510-a6da-1ba6c6492832",
};

export function getPackageImage(packageName: string, sessions: number): string {
  const lowerName = packageName.toLowerCase();

  // Special New Strike Programs
  if (lowerName.includes('golden')) {
    return STRIKE_STORAGE_IMG.goldenPackage;
  }
  if (lowerName.includes('fighter')) {
    if (lowerName.includes('12 month')) return STRIKE_STORAGE_IMG.fighterTeam12m;
    if (lowerName.includes('6 month')) return STRIKE_STORAGE_IMG.fighterTeam6m;
    return STRIKE_STORAGE_IMG.fighterTeam3m;
  }
  if (lowerName.includes('welcome') || lowerName.includes('program (1)')) {
    return STRIKE_STORAGE_IMG.program1Welcome;
  }
  if (lowerName.includes('program (2)') || lowerName.includes('2 month (20s)')) {
    return STRIKE_STORAGE_IMG.program2KidsJuniors;
  }
  if (lowerName.includes('program (3)') || lowerName.includes('3 month (30s)')) {
    return STRIKE_STORAGE_IMG.program3KidsJuniorsPro;
  }
  if (lowerName.includes('extra')) {
    if (lowerName.includes('pro')) return STRIKE_STORAGE_IMG.extraPro;
    return STRIKE_STORAGE_IMG.extraKids;
  }
  if (lowerName.includes('mivida') && lowerName.includes('kid')) {
    if (sessions === 10) return STRIKE_STORAGE_IMG.kidsMivida10;
    if (sessions === 20) return STRIKE_STORAGE_IMG.kidsMivida20;
    if (sessions === 30) return STRIKE_STORAGE_IMG.kidsMivida30;
    return STRIKE_STORAGE_IMG.kidsMivida10;
  }
  if (lowerName.includes('pt') || lowerName.includes('private')) {
    if (sessions === 1) return STRIKE_STORAGE_IMG.ptDrop;
    if (sessions === 5) return STRIKE_STORAGE_IMG.pt5s;
    if (sessions === 10) return STRIKE_STORAGE_IMG.pt10s;
    if (sessions === 20) return STRIKE_STORAGE_IMG.pt20s;
    if (sessions === 30) return STRIKE_STORAGE_IMG.pt30s;
    return STRIKE_STORAGE_IMG.pt10s;
  }

  // 1. Adults (Maxim, Impact)
  if (!lowerName.includes('kid') && !lowerName.includes('junior')) {
    if (sessions === 1) return STRIKE_STORAGE_IMG.adultDrop;
    if (sessions === 5) return STRIKE_STORAGE_IMG.adult5s;
    if (sessions === 10) return STRIKE_STORAGE_IMG.adult10s;
    if (sessions === 20) return STRIKE_STORAGE_IMG.adult20s;
    if (sessions === 30) return STRIKE_STORAGE_IMG.adult30s;
    if (sessions >= 90 || lowerName.includes('6 month')) return STRIKE_STORAGE_IMG.adult6m;
    return STRIKE_STORAGE_IMG.adult10s;
  }

  // 2. Juniors
  if (lowerName.includes('junior')) {
    const isPro = lowerName.includes('pro') || lowerName.includes('advanced');
    if (isPro) return STRIKE_STORAGE_IMG.program3KidsJuniorsPro;
    return STRIKE_STORAGE_IMG.program2KidsJuniors;
  }

  // 3. Kids
  const isPro = lowerName.includes('pro');
  if (isPro) return STRIKE_STORAGE_IMG.program3KidsJuniorsPro;
  return STRIKE_STORAGE_IMG.kidsMivida20;
}

const BoxingGlovesIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 122.88 117.44"
    fill="currentColor"
    className={className}
  >
    <g>
      <path d="M21.86,19.78c2.94-2.56,6.34-4.67,10.2-6.3l-2.53-2.45c-3.63-0.09-5.12,0.47-8.62,3.17c-1.23,0.95-2.47,1.99-3.7,3.11 c-1.62,2.11-3.23,2.44-4.85,0.79l-0.88-0.79c-0.88-1.43-1.04-3,1.32-5.11l3.98-3.13c1.79-1.41,3.5-3.24,5.9-3.37 c0.44-0.03,0.91-0.01,1.38,0.05l-1.42-1.37c-0.57-0.45-1.15-0.81-1.75-1.07c-0.59-0.25-1.2-0.41-1.82-0.44 c-2.1-0.12-5.32,1.95-8.36,4.68c-3.69,3.31-6.97,7.49-7.68,9.98c-1.13,3.94,3.89,8.28,8.1,11.92c0.58,0.5,1.14,0.99,1.67,1.46 c2.24-4.06,5-7.53,8.26-10.42C21.32,20.24,21.59,20.01,21.86,19.78L21.86,19.78z M102.99,95.63c2.44-3.04,4.42-6.52,5.89-10.44 l2.55,2.43c0.24,3.62-0.27,5.14-2.82,8.74c-0.9,1.27-1.89,2.54-2.96,3.82c-2.04,1.7-2.31,3.33-0.6,4.87l0.83,0.85 c1.46,0.82,3.04,0.93,5.05-1.52l2.97-4.1c1.34-1.84,3.1-3.63,3.14-6.03c0.01-0.44-0.03-0.91-0.11-1.38l1.43,1.37 c0.47,0.55,0.85,1.12,1.13,1.71c0.28,0.58,0.46,1.18,0.52,1.81c0.2,2.09-1.74,5.4-4.34,8.54c-3.17,3.82-7.21,7.26-9.67,8.07 c-3.89,1.29-8.43-3.56-12.23-7.63c-0.52-0.56-1.03-1.1-1.53-1.62c3.97-2.4,7.32-5.29,10.09-8.66 C102.55,96.19,102.78,95.91,102.99,95.63L102.99,95.63z M75.6,69.87c0.36-0.7,0.09-1.56-0.61-1.92s-1.56-0.09-1.92,0.61 c-0.86,1.66-1.84,3.18-2.97,4.53c-1.12,1.33-2.39,2.49-3.84,3.46c-0.66,0.44-0.83,1.32-0.4,1.98c0.44,0.66,1.32,0.83,1.98,0.4 c1.69-1.12,3.16-2.47,4.44-4C73.55,73.42,74.64,71.72,75.6,69.87L75.6,69.87z M81.27,75.11c0.36-0.7,0.09-1.56-0.61-1.92 c-0.7-0.36-1.56-0.09-1.92,0.61c-0.86,1.66-1.84,3.18-2.97,4.53c-1.12,1.33-2.39,2.49-3.84,3.46c-0.66,0.44-0.83,1.32-0.4,1.98 c0.44,0.66,1.32,0.83,1.98,0.4c1.69-1.12,3.16-2.47,4.44-4C79.22,78.66,80.32,76.96,81.27,75.11L81.27,75.11z M92.67,68.4 c-1.54-2.57-3.1-4.77-4.67-6.61l-0.18-0.21c-1.93-3.05-3.32-6.1-1.89-7.18l0,0c0.92-0.69,2.3-0.77,3.76-0.51 c2.17,0.38,4.4,1.49,5.76,2.5c1.77,1.33,3.38,3.05,4.76,4.9c1.65,2.2,2.97,4.57,3.88,6.66c0.92,2.14,1.61,4.44,2.06,6.91 c0.43,2.41,0.62,4.98,0.56,7.73c-1.43,4.26-3.43,8.06-6.03,11.38c-0.19,0.24-0.39,0.48-0.59,0.71c-3,3.49-6.72,6.33-11.1,8.57l0,0 c-0.05,0.03-0.1,0.06-0.15,0.09c-0.54-0.02-1.09-0.05-1.65-0.1c-0.96-0.08-1.9-0.19-2.82-0.34c-3.02-0.5-5.59-1.3-8.03-2.42 c-2.47-1.13-4.82-2.57-7.4-4.32c-1.26-0.85-2.51-1.78-3.75-2.78c-1.24-0.99-2.42-2.03-3.55-3.11h0c-2.46-2.57-4.17-5.07-5.17-7.51 c-0.97-2.37-1.26-4.69-0.9-6.97c0.34-2.12,1.6-4.66,3.24-7.1c2.09-3.13,4.75-6.06,6.86-7.86c0.91-0.77,1.8-1.43,2.68-1.95 c2.86-1.71,5.75-2.25,8.6-1.53c2.91,0.73,5.86,2.77,8.8,6.18c1.24,1.98,2.63,3.83,3.67,5.24c0.29,0.38,0.54,0.72,0.93,1.26 c0.46,0.64,1.35,0.79,1.99,0.32C92.94,69.9,93.1,69.04,92.67,68.4L92.67,68.4z M82.75,56.96c-1.7-1.16-3.41-1.95-5.14-2.38 c-3.62-0.91-7.22-0.26-10.76,1.86c-1.05,0.63-2.07,1.37-3.08,2.23c-2.27,1.94-5.14,5.1-7.38,8.45c-1.84,2.75-3.28,5.67-3.69,8.25 c-0.44,2.79-0.09,5.61,1.09,8.48c1.14,2.79,3.06,5.6,5.79,8.45l0.04,0.04l0,0c1.23,1.17,2.47,2.26,3.74,3.28 c1.25,1.01,2.57,1.98,3.94,2.91c2.71,1.84,5.19,3.36,7.82,4.56c2.66,1.21,5.45,2.09,8.75,2.64c1.05,0.17,2.07,0.3,3.06,0.38 c0.77,0.06,1.56,0.1,2.36,0.11c0.75,0.75,1.55,1.6,2.38,2.49c4.37,4.67,9.59,10.24,15.21,8.38c2.93-0.97,7.52-4.78,10.98-8.96 c3.03-3.66,5.27-7.7,4.99-10.62c-0.1-0.98-0.36-1.9-0.78-2.77c-0.4-0.84-0.94-1.63-1.59-2.38l0,0c-0.03-0.03-0.06-0.07-0.09-0.1 l-10.84-10.36c0.02-2.64-0.19-5.14-0.61-7.51c-0.48-2.67-1.23-5.18-2.25-7.53c-0.99-2.29-2.43-4.87-4.21-7.26 c-1.53-2.05-3.33-3.97-5.33-5.47c-1.64-1.23-4.35-2.57-6.97-3.03c-2.16-0.38-4.32-0.19-5.97,1.05l0,0l0,0 C82.67,53.28,82.36,55.01,82.75,56.96L82.75,56.96z M48.69,46.14c0.69-0.39,1.56-0.15,1.95,0.54c0.39,0.69,0.15,1.56-0.54,1.95 c-1.62,0.92-3.1,1.96-4.41,3.15c-1.29,1.17-2.4,2.48-3.3,3.97c-0.41,0.67-1.29,0.89-1.96,0.48c-0.67-0.41-0.89-1.29-0.48-1.96 c1.06-1.73,2.34-3.25,3.82-4.6C45.22,48.33,46.88,47.17,48.69,46.14L48.69,46.14z M43.22,40.68c0.69-0.39,1.56-0.15,1.95,0.54 c0.39,0.69,0.15,1.56-0.54,1.95c-1.62,0.92-3.1,1.96-4.41,3.15c-1.29,1.17-2.4,2.48-3.3,3.97c-0.41,0.67-1.29,0.89-1.96,0.48 c-0.67-0.41-0.89-1.29-0.48-1.96c1.06-1.73,2.34-3.25,3.82-4.6C39.76,42.86,41.41,41.7,43.22,40.68L43.22,40.68z M49.48,29.03 c2.63,1.44,4.89,2.91,6.79,4.41l0.21,0.17c3.12,1.8,6.23,3.07,7.25,1.61l0,0c0.66-0.95,0.68-2.33,0.36-3.77 c-0.47-2.15-1.66-4.34-2.72-5.65c-1.39-1.72-3.18-3.26-5.08-4.57c-2.27-1.56-4.68-2.79-6.81-3.61c-2.18-0.84-4.5-1.44-6.99-1.78 c-2.43-0.34-5.01-0.42-7.74-0.25c-4.2,1.6-7.92,3.75-11.13,6.47c-0.23,0.2-0.46,0.41-0.68,0.62c-3.37,3.14-6.06,6.96-8.12,11.43 l0,0c-0.02,0.05-0.05,0.1-0.08,0.15c0.04,0.54,0.09,1.09,0.16,1.64c0.12,0.96,0.27,1.89,0.46,2.8c0.62,3,1.52,5.53,2.73,7.92 c1.22,2.42,2.76,4.72,4.61,7.22c0.9,1.22,1.88,2.44,2.92,3.64c1.04,1.2,2.12,2.34,3.24,3.42h0c2.66,2.35,5.23,3.97,7.71,4.87 c2.41,0.88,4.74,1.08,7,0.63c2.11-0.42,4.59-1.79,6.97-3.52c3.04-2.21,5.87-4.99,7.58-7.16c0.74-0.94,1.35-1.86,1.85-2.76 c1.6-2.93,2.02-5.83,1.19-8.65c-0.85-2.88-2.99-5.75-6.52-8.55c-2.03-1.16-3.93-2.47-5.38-3.47c-0.39-0.27-0.74-0.51-1.3-0.88 c-0.66-0.44-0.84-1.32-0.4-1.98C47.97,28.81,48.83,28.62,49.48,29.03L49.48,29.03z M61.3,38.48c1.22,1.65,2.08,3.33,2.58,5.04 c1.05,3.58,0.55,7.21-1.43,10.82c-0.58,1.07-1.29,2.12-2.1,3.16c-1.85,2.35-4.89,5.34-8.15,7.71c-2.68,1.95-5.54,3.5-8.1,4.01 c-2.77,0.55-5.61,0.31-8.52-0.75c-2.83-1.03-5.72-2.84-8.67-5.46l-0.04-0.04l0,0c-1.22-1.18-2.36-2.38-3.42-3.6 c-1.06-1.21-2.08-2.49-3.06-3.82c-1.94-2.63-3.56-5.06-4.87-7.64c-1.32-2.61-2.31-5.37-2.98-8.64c-0.21-1.04-0.38-2.05-0.5-3.04 c-0.09-0.77-0.16-1.55-0.2-2.35c-0.77-0.72-1.66-1.49-2.58-2.28c-4.84-4.19-10.61-9.18-8.98-14.86c0.85-2.96,4.48-7.7,8.52-11.32 c3.53-3.17,7.49-5.57,10.42-5.4c0.99,0.06,1.92,0.29,2.8,0.67c0.85,0.37,1.67,0.87,2.44,1.49l0,0c0.03,0.03,0.07,0.06,0.1,0.09 l10.78,10.42c2.64-0.12,5.15-0.01,7.53,0.32c2.69,0.37,5.22,1.03,7.62,1.95c2.33,0.9,4.96,2.23,7.42,3.92 c2.11,1.45,4.09,3.17,5.67,5.11c1.3,1.59,2.74,4.24,3.31,6.85c0.47,2.15,0.36,4.31-0.81,6l0,0l0,0 C64.98,38.41,63.27,38.79,61.3,38.48L61.3,38.48z" />
    </g>
  </svg>
);

export function getPackageTypeLabel(packageName: string): string | null {
  const upper = packageName.toUpperCase();
  const hasGT = upper.includes('GT') || upper.includes('GP') || upper.includes('GROUP');
  const hasPT = upper.includes('PT') || upper.includes('PERSONAL');
  
  if (hasGT && hasPT) {
    return 'Group Training & Personal Training';
  } else if (hasGT) {
    return 'Group Training (GT)';
  } else if (hasPT) {
    return 'Personal Training (PT)';
  }
  return null;
}

export function getBranchDetails(branchName: string, storefrontConfig?: StorefrontConfig) {
  const nameLower = branchName.toLowerCase();
  
  if (storefrontConfig?.branchLocations) {
    const customLoc = storefrontConfig.branchLocations.find(
      loc => loc.branchName.toLowerCase() === nameLower
    );
    if (customLoc) {
      return {
        displayName: customLoc.displayName,
        address: customLoc.address,
        mapUrl: customLoc.mapUrl || null
      };
    }
  }

  // Fallbacks:
  if (nameLower.includes('complex') || nameLower.includes('maxim compound') || nameLower.includes('maxim country')) {
    return {
      displayName: 'Maxim Compound Branch',
      address: 'Maxim Country Club',
      mapUrl: 'https://maps.app.goo.gl/8BPj5eG8EtsZD66c8'
    };
  }
  if (nameLower.includes('mivida') || nameLower.includes('mvida')) {
    return {
      displayName: 'Mivida Compound Branch',
      address: 'Lake District',
      mapUrl: 'https://maps.app.goo.gl/hEM2eFL4fF2bqS8F7'
    };
  }
  if (nameLower.includes('impact') || nameLower.includes('strike')) {
    return {
      displayName: 'Impact by Strike',
      address: 'Maxim Mall',
      mapUrl: 'https://maps.app.goo.gl/4VnA5jAgiZx1RhjQ8'
    };
  }
  return {
    displayName: branchName,
    address: `${branchName}, Egypt`,
    mapUrl: null
  };
}

interface GuestPortalProps {
  onSwitchToCRM: (tab?: string) => void;
  isLeadPending?: boolean;
  client?: Client | null;
  initialPackageId?: string | null;
}

export default function GuestPortal({ onSwitchToCRM, isLeadPending = false, client = null, initialPackageId = null }: GuestPortalProps) {
  const { t } = useLanguage();
  const { packages, branding, branches, coaches } = useAppContext();
  const { currentUser, logout } = useAuth();
  const { storefrontConfig } = useSettings();
  const { theme, toggleTheme, themeLocked } = useTheme();
  // Detect if user is logged in (either passed as prop or via auth context)
  const isLoggedIn = !!(client || currentUser);
  const displayName = client?.name || currentUser?.name || '';
  
  const tenantId = getTenantId();
  const isStrike = tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|mitrixogymcrmCRM|Strike|Inzan/i.test(navigator.userAgent) || window.innerWidth < 768;
  const { addToCart, setIsCartOpen } = useCart();
  const [preloaderState, setPreloaderState] = useState<'loading' | 'exiting' | 'hidden'>('hidden');
  const [extraTierTab, setExtraTierTab] = useState<'kids' | 'pro'>('kids');

  // Seamless pass-through: if navigated here from class booking with a specific package, auto-add to cart and open cart
  useEffect(() => {
    if (!initialPackageId || packages.length === 0) return;
    const targetPkg = packages.find(p => p.id === initialPackageId);
    if (targetPkg) {
      addToCart(targetPkg as any);
      setIsCartOpen(true);
      setSelectedPackage(targetPkg as any);
    }
  }, [initialPackageId, packages, addToCart, setIsCartOpen]);
  
  const enabledTabs = React.useMemo(() => {
    const list = [
      { id: 'book', label: 'Book', icon: <Calendar className="h-4 w-4" /> },
      { id: 'locations', label: 'Locations', icon: <MapPin className="h-4 w-4" /> },
      { id: 'schedule', label: 'Schedule', icon: <Clock className="h-4 w-4" /> },
      { id: 'announcements', label: 'Announcements', icon: <Bell className="h-4 w-4" /> }
    ];
    return list.filter(tab => storefrontConfig?.tabs?.[tab.id as keyof typeof storefrontConfig.tabs] !== false);
  }, [storefrontConfig?.tabs]);

  const [activeTab, setActiveTab] = useState<'book' | 'locations' | 'schedule' | 'announcements'>('book');

  // Adjust active tab if it's disabled in settings
  useEffect(() => {
    if (enabledTabs.length > 0 && !enabledTabs.some(t => t.id === activeTab)) {
      setActiveTab(enabledTabs[0]!.id as any);
    }
  }, [enabledTabs, activeTab]);

  useEffect(() => {
    (window as any).__dismissMobileSplash?.();
  }, []);

  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  
  // Slide index state for slideshow
  const [slideIndex, setSlideIndex] = useState(0);

  // Whitelabel dynamic configurations
  const activeSlides = React.useMemo(() => {
    const slides = (storefrontConfig?.heroSlides || []).filter(s => s.enabled !== false);
    if (slides.length > 0) return slides;
    return [
      { id: 'default-1', title: 'Elite Fitness & Training', subtitle: 'Timings available now', badgeText: 'Featured', badgeColor: 'white', imageUrl: '', ctaText: 'Book Now!', enabled: true, order: 0 },
      { id: 'default-2', title: 'Kids & Juniors Programs', subtitle: 'Specialized youth fitness and coaching', badgeText: 'Popular', badgeColor: 'primary', imageUrl: '', ctaText: 'Book Now!', enabled: true, order: 1 },
      { id: 'default-3', title: 'Personal Coaching', subtitle: 'Certified personal trainers', badgeText: 'New', badgeColor: 'red', imageUrl: '', ctaText: 'Book Now!', enabled: true, order: 2 },
    ];
  }, [storefrontConfig?.heroSlides]);

  const bannerSection = React.useMemo(() => {
    return (storefrontConfig?.sections || []).find(s => s.type === 'banner');
  }, [storefrontConfig?.sections]);

  const getSlideImage = (slideId: string | undefined, customUrl: string | undefined, index: number) => {
    if (customUrl) return customUrl;
    if (index === 0) return isStrike ? STRIKE_STORAGE_IMG.heroAdults : "/mitrixogymcrm_sessions_slide.png";
    if (index === 1) return isStrike ? STRIKE_STORAGE_IMG.heroKidsJuniors : "/mitrixogymcrm_kids_boxing.png";
    return isStrike ? STRIKE_STORAGE_IMG.heroImpact : "/impact_sister_company.png";
  };

  const getBannerImage = () => {
    if (bannerSection?.imageUrl) return bannerSection.imageUrl;
    return isStrike ? STRIKE_STORAGE_IMG.bannerImpact : "/impact_sister_company.png";
  };

  // Refs for scrolling to sections
  const kidsSectionRef = useRef<HTMLDivElement>(null);
  const juniorSectionRef = useRef<HTMLDivElement>(null);
  const adultSectionRef = useRef<HTMLDivElement>(null);

  // Smart Package Filter States
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | 'kids' | 'juniors' | 'adults' | 'pt'>('all');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedDurationFilter, setSelectedDurationFilter] = useState<string>('all');
  const [packageSearchQuery, setPackageSearchQuery] = useState<string>('');

  const dateScrollRef = useRef<HTMLDivElement>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [loadingClasses, setLoadingClasses] = useState(true);

  // Generate date range: 7 days before and 14 days after today
  const dateRange = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i - 7));

  useEffect(() => {
    // Cost Optimization: Query strictly within the active 21-day window
    const minDateStr = format(addDays(new Date(), -7), 'yyyy-MM-dd');
    const maxDateStr = format(addDays(new Date(), 14), 'yyyy-MM-dd');

    const q = query(
      collection(db, 'classSchedules'),
      where('date', '>=', minDateStr),
      where('date', '<=', maxDateStr)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        const dateStr = data.date || (data.startTime ? data.startTime.substring(0, 10) : '');
        const timeStr = data.time || (data.startTime && data.endTime 
          ? `${data.startTime.substring(11, 16)} - ${data.endTime.substring(11, 16)}` 
          : '10:00 - 11:15');

        return {
          id: doc.id,
          ...data,
          date: dateStr,
          time: timeStr
        };
      }) as any[];
      list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
      setClasses(list);
      setLoadingClasses(false);
    }, (err) => {
      console.error("Error loading classes for GuestPortal:", err);
      setLoadingClasses(false);
    });
    return () => unsub();
  }, []);

  // Preloader: wait for logo image to load with minimal delay for instant feel
  useEffect(() => {
    if (preloaderState !== 'loading') return;
    let cancelled = false;
    const minDelay = new Promise(r => setTimeout(r, 200));
    
    const logoLoad = branding.logoUrl
      ? new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Don't block on error
          img.src = branding.logoUrl;
        })
      : Promise.resolve();

    Promise.all([minDelay, logoLoad]).then(() => {
      if (!cancelled) {
        setPreloaderState('exiting');
        setTimeout(() => {
          setPreloaderState('hidden');
        }, 300);
      }
    });
    return () => { cancelled = true; };
  }, [branding.logoUrl]);

  // Slideshow auto-advance
  useEffect(() => {
    if (activeTab !== 'book' || activeSlides.length === 0) return;
    const interval = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % activeSlides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, activeSlides.length]);

  // ─── Package Grouping & Smart Filter ───
  
  // Define location groups with branch matching
  const LOCATION_GROUP_IDS = ['Maxim', 'Mivida', 'Impact'] as const;
  type LocationGroupId = typeof LOCATION_GROUP_IDS[number];
  
  type AgeCategory = 'kids' | 'juniors' | 'adults' | 'pt';
  
  const isYouthProgramName = (n: string) =>
    n.includes('kid') ||
    n.includes('junior') ||
    n.includes('welcome session') ||
    n.includes('golden package') ||
    n.includes('fighter team') ||
    n.includes('extra ');

  // Intentional, logical ordering for Strike packages
  const getPackageSortOrder = (pkg: Package): number => {
    const n = (pkg.name || '').toLowerCase();
    // 1. Golden Bundle first
    if (n.includes('golden package')) return 10;
    // 2. Core Youth Progression (Program 1 -> 2 -> 3)
    if (n.includes('welcome session') || n.includes('program (1)')) return 20;
    if (n.includes('2 month (20s)') || n.includes('program (2)')) return 30;
    if (n.includes('3 month (30s)') || n.includes('program (3)')) return 40;
    // 3. Program 4 Fighter Team (3m -> 6m -> 12m)
    if (n.includes('fighter team')) {
      if (n.includes('3 month')) return 50;
      if (n.includes('6 month')) return 51;
      if (n.includes('12 month')) return 52;
      return 55;
    }
    // 4. Mivida Kids (10 -> 20 -> 30)
    if (n.includes('kids mivida')) {
      return 100 + (pkg.sessions || 0);
    }
    // 5. Extra Sessions (Kids 5->10->15, then Pro 5->10->15)
    if (n.includes('extra ')) {
      const isPro = n.includes('pro');
      return (isPro ? 250 : 200) + (pkg.sessions || 0);
    }
    // 6. Adult Group Training (Drop -> 5 -> 10 -> 20 -> 30 -> 6 Month)
    const isPT = n.includes('pt') || n.includes('private') || pkg.type === 'Private';
    if (!isYouthProgramName(n) && !isPT) {
      if (n.includes('drop') || pkg.sessions === 1) return 301;
      if (pkg.sessions === 5) return 305;
      if (pkg.sessions === 10) return 310;
      if (pkg.sessions === 20) return 320;
      if (pkg.sessions === 30) return 330;
      if (n.includes('6 month') || pkg.sessions >= 90) return 360;
      return 300 + (pkg.sessions || 0);
    }
    // 7. Private Coaching PT (Drop -> 5 -> 10 -> 20 -> 30)
    if (isPT) {
      if (n.includes('drop') || pkg.sessions === 1) return 401;
      return 400 + (pkg.sessions || 0);
    }
    return 500 + (pkg.sessions || 0);
  };

  const formatCleanPackageName = (rawName: string): string => {
    return rawName.replace(/\s*-\s*NEW$/i, '').trim();
  };

  const formatSessionsLabel = (pkg: Package): string => {
    const n = (pkg.name || '').toLowerCase();
    if (n.includes('12 month')) return '12 Months Membership';
    if (n.includes('6 month') && !n.includes('golden')) return '6 Months Membership';
    if (n.includes('golden package')) return '55 Sessions (5 + 20 + 30)';
    if (pkg.sessions === 1) return '1 Drop-In Session';
    return `${pkg.sessions} Sessions`;
  };

  const formatValidityLabel = (pkg: Package): string => {
    if (pkg.expiryDays === 365) return '12 Months (365d)';
    if (pkg.expiryDays === 180) return '6 Months (180d)';
    if (pkg.expiryDays === 90) return '3 Months (90d)';
    if (pkg.expiryDays === 80) return '80 Days (~3m)';
    if (pkg.expiryDays === 60) return '2 Months (60d)';
    if (pkg.expiryDays === 1) return '1 Day Validity';
    return `${pkg.expiryDays} Days Validity`;
  };

  // Helper to get age category from package name
  const getAgeCategory = (pkgName: string): AgeCategory | null => {
    const n = pkgName.toLowerCase();
    if (n.includes('corporate') || n.includes('company')) return null;
    if (n.includes('kid') && !n.includes('junior')) return 'kids';
    if (n.includes('junior')) return 'juniors';
    if (isYouthProgramName(n)) return 'kids';
    if (n.includes('private') || n.includes('pt') || n.includes('1-on-1')) return 'pt';
    if (!isYouthProgramName(n) && n.includes('group') === false) return 'adults';
    return 'adults';
  };
  
  // Helper to determine location from package branch
  const getLocationForPackage = (pkg: Package): LocationGroupId | null => {
    const branchName = (pkg.branch || '').toLowerCase();
    const pkgName = (pkg.name || '').toLowerCase();
    if (branchName.includes('maxim') || pkgName.includes('maxim')) return 'Maxim';
    if (branchName.includes('mivida') || branchName.includes('mvida') || pkgName.includes('mivida')) return 'Mivida';
    if (branchName.includes('impact') || branchName.includes('strike') || pkgName.includes('impact')) return 'Impact';
    return null;
  };

  // Primary branch for display
  const primaryBranch = branches[0] || 'Main Branch';

  // Public packages: strictly exclude corporate and company packages, and archived packages
  const publicPackages = useMemo(() => {
    return packages.filter(p => {
      const archived = p.isActive === false || p.is_active === false || !!p.archivedAt;
      const n = (p.name || '').toLowerCase();
      const isCorporate = n.includes('corporate') || n.includes('company') || (p.category || '').toLowerCase().includes('corporate');
      return !archived && !isCorporate;
    });
  }, [packages]);

  // Check if any filter is active
  const isFilterActive = useMemo(() => {
    return (
      packageSearchQuery.trim() !== '' ||
      selectedBranchFilter !== 'all' ||
      selectedDurationFilter !== 'all' ||
      selectedCategoryFilter !== 'all'
    );
  }, [packageSearchQuery, selectedBranchFilter, selectedDurationFilter, selectedCategoryFilter]);

  // Filtered packages for search / filter mode
  const filteredCatalogPackages = useMemo(() => {
    return publicPackages.filter(pkg => {
      const name = (pkg.name || '').toLowerCase();
      const branchName = (pkg.branch || '').toLowerCase();

      // 1. Branch match
      if (selectedBranchFilter !== 'all') {
        const targetBranch = selectedBranchFilter.toLowerCase();
        const isAllBranches = branchName === 'all' || branchName === 'all branches' || (pkg as any).is_all_branches === true;
        const isTargetMivida = targetBranch.includes('mivida') || targetBranch.includes('mvida');
        const isPkgMivida = branchName.includes('mivida') || branchName.includes('mvida') || name.includes('mivida') || name.includes('mvida');
        const matchesBranch = isAllBranches || branchName.includes(targetBranch) || name.includes(targetBranch) || (isTargetMivida && isPkgMivida);
        if (!matchesBranch) return false;
      }

      // 2. Category match
      if (selectedCategoryFilter !== 'all') {
        const cat = getAgeCategory(pkg.name);
        if (selectedCategoryFilter === 'pt') {
          const isPT = name.includes('private') || name.includes('pt') || pkg.type === 'Private';
          if (!isPT) return false;
        } else if (selectedCategoryFilter === 'kids') {
          if (!isYouthProgramName(name)) return false;
        } else if (selectedCategoryFilter === 'juniors') {
          if (!isYouthProgramName(name) || name.includes('kids mivida')) return false;
        } else if (cat !== selectedCategoryFilter) {
          return false;
        }
      }

      // 3. Duration match
      if (selectedDurationFilter !== 'all') {
        if (selectedDurationFilter === '1' && pkg.sessions !== 1) return false;
        if (selectedDurationFilter === '8' && pkg.sessions !== 8) return false;
        if (selectedDurationFilter === '12' && pkg.sessions !== 12) return false;
        if (selectedDurationFilter === '20' && pkg.sessions !== 20) return false;
        if (selectedDurationFilter === '24' && pkg.sessions !== 24) return false;
        if (selectedDurationFilter === '30' && pkg.sessions !== 30) return false;
        if (selectedDurationFilter === '48' && pkg.sessions !== 48) return false;
        if (selectedDurationFilter === 'unlimited') return false;
      }

      // 4. Search query text match
      if (packageSearchQuery.trim()) {
        const q = packageSearchQuery.toLowerCase().trim();
        const matchesQuery = name.includes(q) || branchName.includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    }).sort((a, b) => getPackageSortOrder(a) - getPackageSortOrder(b));
  }, [publicPackages, selectedBranchFilter, selectedCategoryFilter, selectedDurationFilter, packageSearchQuery]);

  // Packages for each age category (across all locations)
  const displayKids = useMemo(() => {
    return publicPackages.filter(p => {
      const n = p.name.toLowerCase();
      return isYouthProgramName(n);
    }).sort((a, b) => getPackageSortOrder(a) - getPackageSortOrder(b));
  }, [publicPackages]);

  const displayJuniors = useMemo(() => {
    return publicPackages.filter(p => {
      const n = p.name.toLowerCase();
      return (n.includes('junior') || n.includes('welcome session') || n.includes('golden package') || n.includes('fighter team') || n.includes('extra ')) && !n.includes('kids mivida');
    }).sort((a, b) => getPackageSortOrder(a) - getPackageSortOrder(b));
  }, [publicPackages]);

  const displayAdults = useMemo(() => {
    return publicPackages.filter(p => {
      const n = p.name.toLowerCase();
      return !isYouthProgramName(n);
    }).sort((a, b) => getPackageSortOrder(a) - getPackageSortOrder(b));
  }, [publicPackages]);

  // Structured sub-groups for clean visual presentation
  const youthGoldenPkg = useMemo(() => displayKids.find(p => p.name.toLowerCase().includes('golden package')), [displayKids]);
  const youthCorePrograms = useMemo(
    () =>
      displayKids.filter(p => {
        const n = p.name.toLowerCase();
        return (
          n.includes('welcome session') ||
          n.includes('2 month (20s)') ||
          n.includes('3 month (30s)') ||
          n.includes('program (1)') ||
          n.includes('program (2)') ||
          n.includes('program (3)')
        );
      }),
    [displayKids]
  );
  const youthFighterTeam = useMemo(() => displayKids.filter(p => p.name.toLowerCase().includes('fighter team')), [displayKids]);
  const youthMividaKids = useMemo(() => displayKids.filter(p => p.name.toLowerCase().includes('kids mivida')), [displayKids]);
  const youthExtraSessions = useMemo(() => displayKids.filter(p => p.name.toLowerCase().includes('extra ')), [displayKids]);

  const adultGroupPackages = useMemo(
    () => displayAdults.filter(p => p.type !== 'Private' && !p.name.toLowerCase().includes('pt') && !p.name.toLowerCase().includes('private')),
    [displayAdults]
  );
  const adultPtPackages = useMemo(
    () => displayAdults.filter(p => p.type === 'Private' || p.name.toLowerCase().includes('pt') || p.name.toLowerCase().includes('private')),
    [displayAdults]
  );

  const getProgramStepBadge = (pkg: Package): { label: string; colorClass: string } | null => {
    const n = (pkg.name || '').toLowerCase();
    if (n.includes('golden package')) {
      return { label: 'GOLDEN BUNDLE • PROGRAMS 1+2+3', colorClass: 'bg-amber-500 text-black border-amber-400' };
    }
    if (n.includes('welcome session') || n.includes('program (1)')) {
      return { label: 'PROGRAM 1 • NEW MEMBERS', colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    }
    if (n.includes('2 month (20s)') || n.includes('program (2)')) {
      return { label: 'PROGRAM 2 • FOUNDATION', colorClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30' };
    }
    if (n.includes('3 month (30s)') || n.includes('program (3)')) {
      return { label: 'PROGRAM 3 • PRO LEVEL', colorClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
    }
    if (n.includes('fighter team')) {
      return { label: 'PROGRAM 4 • FIGHTER TEAM', colorClass: 'bg-primary/15 text-primary border-primary/30' };
    }
    if (n.includes('kids mivida')) {
      return { label: 'MIVIDA COMPOUND', colorClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    }
    if (n.includes('extra ')) {
      return {
        label: n.includes('pro') ? 'ADD-ON • PRO LEVEL' : 'ADD-ON • KIDS & JUNIORS',
        colorClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      };
    }
    if (pkg.type === 'Private' || n.includes('pt') || n.includes('private')) {
      const perSession = pkg.sessions > 0 ? Math.round(pkg.price / pkg.sessions) : pkg.price;
      return {
        label: `1-ON-1 PT • ${perSession.toLocaleString()} LE / SESSION`,
        colorClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
    }
    if (n.includes('6 month')) {
      return { label: 'BEST VALUE • 6 MONTHS', colorClass: 'bg-primary/15 text-primary border-primary/30' };
    }
    if (n.includes('drop') || pkg.sessions === 1) {
      return { label: 'SINGLE PASS', colorClass: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
    return { label: 'GROUP TRAINING • ALL BRANCHES', colorClass: 'bg-primary/10 text-primary border-primary/20' };
  };

  const renderPremiumPackageCard = (pkg: Package, isFeaturedGold = false) => {
    const stepBadge = getProgramStepBadge(pkg);
    const hasFreeze = (pkg.freezeAllowanceDays ?? pkg.benefits?.freezeAllowanceDays ?? 0) > 0;
    const freezeDays = pkg.freezeAllowanceDays ?? pkg.benefits?.freezeAllowanceDays ?? 0;

    return (
      <div
        key={pkg.id}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          setSelectedPackage(pkg);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if ((e.target as HTMLElement).closest('button')) return;
            setSelectedPackage(pkg);
          }
        }}
        className={`relative rounded-2xl p-4 flex gap-4 transition-all cursor-pointer active:scale-[0.98] sf-card-stagger outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          isFeaturedGold
            ? 'bg-gradient-to-br from-amber-500/15 via-card to-card border-2 border-amber-500/50 shadow-[0_8px_30px_rgba(245,158,11,0.15)]'
            : 'bg-card border border-border/80 shadow-sm md:hover:border-primary/40'
        }`}
      >
        <div
          className={`h-20 w-20 rounded-2xl bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center border ${
            isFeaturedGold ? 'border-amber-400/50 ring-2 ring-amber-500/20' : 'border-white/10'
          }`}
        >
          <img
            src={pkg.imageUrl || getPackageImage(pkg.name, pkg.sessions)}
            alt={pkg.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {stepBadge && (
              <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${stepBadge.colorClass}`}>
                {isFeaturedGold && <Star className="h-2.5 w-2.5 mr-1 fill-current" />}
                {stepBadge.label}
              </span>
            )}
            {hasFreeze && (
              <span className="inline-flex items-center text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/30">
                ❄️ {freezeDays === 30 ? '1 Month Freeze' : `${freezeDays}d Freeze`}
              </span>
            )}
          </div>
          <h3 className={`font-black text-xs sm:text-sm uppercase leading-snug ${isFeaturedGold ? 'text-amber-400' : 'text-foreground'}`}>
            {formatCleanPackageName(pkg.name)}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-semibold">
            {formatSessionsLabel(pkg)} • {formatValidityLabel(pkg)}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className={`font-black text-base leading-none ${isFeaturedGold ? 'text-amber-400' : 'text-primary'}`}>
                {pkg.price.toLocaleString()} {t('payments.currency_le')}
              </span>
              {isFeaturedGold && (
                <span className="text-[9px] text-amber-400/80 font-bold mt-0.5">
                  Save 1,500 LE vs buying Programs 1, 2 & 3 separately
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPackage(pkg);
              }}
              className={`h-8 px-4 text-xs font-extrabold rounded-xl shrink-0 ${
                isFeaturedGold
                  ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-sm'
                  : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
              }`}
            >
              <Info className="h-3 w-3 mr-1" /> Details
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderYouthAcademySection = (bannerTitle?: string, bannerSubtitle?: string, bannerImageUrl?: string) => {
    const filteredExtras = youthExtraSessions.filter(pkg => {
      const isPro = pkg.name.toLowerCase().includes('pro');
      return extraTierTab === 'pro' ? isPro : !isPro;
    });

    return (
      <div ref={kidsSectionRef} className="px-4 pt-3 space-y-6">
        {/* Section Title */}
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block mb-0.5">
              YOUTH ACADEMY • COMPLEX & MIVIDA
            </span>
            <h2 className="text-xl font-black tracking-tight uppercase leading-none">
              {bannerTitle || 'Kids & Juniors Programs'}
            </h2>
          </div>
          <Badge variant="outline" className="text-[10px] font-bold border-amber-500/30 text-amber-400">
            4-Step Path
          </Badge>
        </div>

        {/* 1. GOLDEN PACKAGE — FULL-BLEED VIP PASS CARD */}
        {youthGoldenPkg && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPackage(youthGoldenPkg)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(youthGoldenPkg);
            }}
            className="relative rounded-3xl overflow-hidden border-2 border-amber-400/60 shadow-[0_12px_40px_rgba(245,158,11,0.22)] cursor-pointer active:scale-[0.99] transition-all group"
          >
            <div className="relative h-44 w-full overflow-hidden">
              <img
                src={youthGoldenPkg.imageUrl || getPackageImage(youthGoldenPkg.name, youthGoldenPkg.sessions)}
                alt="Golden Package"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/65 to-black/20" />
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
                  <Star className="h-3 w-3 fill-current" /> Golden Bundle • Best Value
                </span>
                <span className="inline-flex items-center gap-1 bg-sky-500/90 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md">
                  ❄️ 1 Month Freeze Included
                </span>
              </div>
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
                    All-In-One Youth Pass • Complex (Maxim Compound)
                  </p>
                  <h3 className="text-white font-black text-lg sm:text-xl uppercase tracking-tight leading-tight">
                    Golden Package (Programs 1 + 2 + 3)
                  </h3>
                </div>
              </div>
            </div>

            {/* Visual Breakdown Bar Inside Golden Card */}
            <div className="bg-gradient-to-b from-zinc-950 to-zinc-900 p-4 space-y-3.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 py-2 px-1.5">
                  <span className="text-[9px] font-bold uppercase text-amber-300/80 block">Step 1</span>
                  <span className="text-xs font-black text-white block">5 Welcome</span>
                </div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 py-2 px-1.5">
                  <span className="text-[9px] font-bold uppercase text-amber-300/80 block">Step 2</span>
                  <span className="text-xs font-black text-white block">20 Foundation</span>
                </div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 py-2 px-1.5">
                  <span className="text-[9px] font-bold uppercase text-amber-300/80 block">Step 3</span>
                  <span className="text-xs font-black text-white block">30 Pro Level</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-400">
                      {youthGoldenPkg.price.toLocaleString()} {t('payments.currency_le')}
                    </span>
                    <span className="text-xs text-zinc-500 line-through font-bold">10,000 LE</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-semibold">
                    55 Total Sessions • 6 Months (180d) Validity • Save 1,500 LE
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPackage(youthGoldenPkg);
                  }}
                  className="bg-amber-400 text-black hover:bg-amber-300 font-black text-xs rounded-xl h-9 px-4 shrink-0"
                >
                  Select Pass <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 2. VISUAL 3-STEP PROGRESSION ROADMAP (Programs 1 -> 2 -> 3) */}
        {youthCorePrograms.length > 0 && (
          <div className="rounded-3xl bg-card border p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                  STEP-BY-STEP PROGRESSION
                </span>
                <h3 className="text-sm font-black uppercase text-foreground">
                  Or Start Individual Programs (1 → 3)
                </h3>
              </div>
              <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-muted-foreground">
                Complex / Maxim
              </Badge>
            </div>

            <div className="relative pl-4 space-y-3 before:content-[''] before:absolute before:left-[15px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-sky-500 before:to-purple-500">
              {youthCorePrograms.map((pkg, idx) => {
                const stepColors = [
                  { ring: 'bg-emerald-500 text-black', tag: 'STEP 01 • NEW MEMBER WELCOME', text: 'text-emerald-400' },
                  { ring: 'bg-sky-500 text-black', tag: 'STEP 02 • 2-MONTH FOUNDATION', text: 'text-sky-400' },
                  { ring: 'bg-purple-500 text-white', tag: 'STEP 03 • 3-MONTH PRO LEVEL', text: 'text-purple-400' },
                ][idx] || { ring: 'bg-primary text-white', tag: `STEP 0${idx + 1}`, text: 'text-primary' };

                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackage(pkg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(pkg);
                    }}
                    className="relative flex items-center gap-3 bg-muted/30 hover:bg-muted/60 border border-border/70 rounded-2xl p-3 transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <div className={`-ml-5 h-7 w-7 rounded-full font-black text-[10px] flex items-center justify-center shrink-0 shadow-md ring-4 ring-card ${stepColors.ring}`}>
                      0{idx + 1}
                    </div>
                    <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-zinc-900">
                      <img
                        src={pkg.imageUrl || getPackageImage(pkg.name, pkg.sessions)}
                        alt={pkg.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[9px] font-black uppercase tracking-wider block ${stepColors.text}`}>
                        {stepColors.tag}
                      </span>
                      <h4 className="font-black text-xs uppercase text-foreground truncate">
                        {formatCleanPackageName(pkg.name)}
                      </h4>
                      <p className="text-[10px] text-muted-foreground font-semibold">
                        {pkg.sessions} Sessions • {formatValidityLabel(pkg)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-foreground block">
                        {pkg.price.toLocaleString()}
                      </span>
                      <span className="text-[9px] text-primary font-extrabold uppercase flex items-center justify-end">
                        {t('payments.currency_le')} <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. PROGRAM (4) FIGHTER TEAM — 3-COLUMN VISUAL TIER GRID (3M | 6M | 12M) */}
        {youthFighterTeam.length > 0 && (
          <div ref={juniorSectionRef} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                  PROGRAM (4) • NEW & RENEW
                </span>
                <h3 className="text-sm font-black uppercase text-foreground">
                  Fighter Team Memberships (Kids Pro & Juniors Pro)
                </h3>
              </div>
              <Badge variant="outline" className="text-[9px] font-bold border-primary/30 text-primary">
                Complex
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {youthFighterTeam.map((pkg, idx) => {
                const months = pkg.expiryDays >= 360 ? 12 : pkg.expiryDays >= 170 ? 6 : 3;
                const monthlyAvg = Math.round(pkg.price / months);
                const isBest = months === 12;

                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackage(pkg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(pkg);
                    }}
                    className={`rounded-2xl overflow-hidden border flex flex-col justify-between cursor-pointer active:scale-[0.97] transition-all ${
                      isBest
                        ? 'border-primary bg-gradient-to-b from-primary/15 to-card shadow-md'
                        : 'border-border/80 bg-card hover:border-primary/40'
                    }`}
                  >
                    <div className="relative h-24 w-full overflow-hidden">
                      <img
                        src={pkg.imageUrl || getPackageImage(pkg.name, pkg.sessions)}
                        alt={pkg.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                      {isBest && (
                        <span className="absolute top-1.5 right-1.5 bg-primary text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md">
                          PRO PICK
                        </span>
                      )}
                      <div className="absolute bottom-1.5 left-2.5">
                        <span className="text-white font-black text-lg leading-none block">{months} MO</span>
                        <span className="text-white/70 text-[9px] font-bold uppercase">{pkg.expiryDays} Days</span>
                      </div>
                    </div>

                    <div className="p-2.5 text-center space-y-1">
                      <div className="font-black text-xs sm:text-sm text-primary">
                        {pkg.price.toLocaleString()} {t('payments.currency_le')}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-semibold">
                        ~{monthlyAvg.toLocaleString()} LE / mo
                      </div>
                      <div className="pt-1">
                        <span className="inline-block w-full py-1 rounded-lg bg-primary/10 text-primary text-[9px] font-black uppercase">
                          Select
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. MIVIDA COMPOUND — 3-COLUMN KIDS SESSION PACKS (10S | 20S | 30S) */}
        {youthMividaKids.length > 0 && (
          <div className="rounded-3xl bg-card border p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                  MIVIDA COMPOUND BRANCH
                </span>
                <h3 className="text-sm font-black uppercase text-foreground">
                  Kids Group Packages (Mivida)
                </h3>
              </div>
              <Badge variant="outline" className="text-[9px] font-bold border-amber-500/30 text-amber-400">
                Unchanged Rates
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {youthMividaKids.map((pkg) => {
                const perSess = Math.round(pkg.price / pkg.sessions);
                const isBest = pkg.sessions === 30;
                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackage(pkg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(pkg);
                    }}
                    className={`rounded-2xl overflow-hidden border flex flex-col justify-between cursor-pointer active:scale-[0.97] transition-all ${
                      isBest ? 'border-amber-500/60 bg-amber-500/5' : 'border-border/80 bg-muted/20'
                    }`}
                  >
                    <div className="relative h-20 w-full overflow-hidden">
                      <img
                        src={pkg.imageUrl || getPackageImage(pkg.name, pkg.sessions)}
                        alt={pkg.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                      <div className="absolute bottom-1.5 left-2.5">
                        <span className="text-white font-black text-base leading-none block">
                          {pkg.sessions} <span className="text-[10px] font-bold">SESSIONS</span>
                        </span>
                      </div>
                    </div>
                    <div className="p-2.5 text-center space-y-0.5">
                      <span className="text-[9px] text-muted-foreground font-bold block">
                        {pkg.expiryDays} Days Validity
                      </span>
                      <span className="font-black text-xs sm:text-sm text-foreground block">
                        {pkg.price.toLocaleString()} {t('payments.currency_le')}
                      </span>
                      <span className="text-[9px] text-amber-400 font-bold block">
                        {perSess} LE / session
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. INTERACTIVE EXTRA SESSIONS TOP-UP WIDGET (Toggle Kids vs Pro + 3 Tiles) */}
        {youthExtraSessions.length > 0 && (
          <div className="rounded-3xl bg-card border p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                  NEED EXTRA SESSIONS?
                </span>
                <h3 className="text-sm font-black uppercase text-foreground">
                  Quick Session Top-Ups (Complex)
                </h3>
              </div>
              <div className="flex items-center bg-muted p-1 rounded-xl border border-border/60">
                <button
                  type="button"
                  onClick={() => setExtraTierTab('kids')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                    extraTierTab === 'kids'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Kids (K)
                </button>
                <button
                  type="button"
                  onClick={() => setExtraTierTab('pro')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                    extraTierTab === 'pro'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Pro Level
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {filteredExtras.map((pkg) => {
                const perSess = Math.round(pkg.price / pkg.sessions);
                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackage(pkg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(pkg);
                    }}
                    className="rounded-2xl border border-border/80 bg-muted/25 hover:border-primary/50 p-3 text-center space-y-1 cursor-pointer active:scale-[0.97] transition-all"
                  >
                    <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      +{pkg.sessions} Sessions
                    </span>
                    <div className="font-black text-sm text-foreground pt-0.5">
                      {pkg.price.toLocaleString()} {t('payments.currency_le')}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-semibold">
                      {perSess} LE / session
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAdultSection = (bannerTitle?: string, bannerSubtitle?: string, bannerImageUrl?: string) => {
    const adultSixMonth = adultGroupPackages.find(p => p.name.toLowerCase().includes('6 month') || p.sessions >= 90);
    const adultDropIn = adultGroupPackages.find(p => p.sessions === 1 || p.name.toLowerCase().includes('drop'));
    const adultSessionPacks = adultGroupPackages.filter(p => p !== adultSixMonth && p !== adultDropIn);

    const ptDropIn = adultPtPackages.find(p => p.sessions === 1 || p.name.toLowerCase().includes('drop'));
    const ptSessionPacks = adultPtPackages.filter(p => p !== ptDropIn);

    return (
      <div ref={adultSectionRef} className="px-4 pt-3 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary block mb-0.5">
              MIVIDA • COMPLEX • IMPACT
            </span>
            <h2 className="text-xl font-black tracking-tight uppercase leading-none">
              {bannerTitle || 'Adults & Private Coaching'}
            </h2>
          </div>
          <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary uppercase">
            All Branches
          </Badge>
        </div>

        {/* 1. ADULT GROUP TRAINING — BENTO GRID + 6-MONTH SPOTLIGHT */}
        {adultGroupPackages.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-sm font-black uppercase text-foreground">
                  Adult Group Training (GT)
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Valid across Mivida, Complex (Maxim Compound) & Impact
                </p>
              </div>
              {adultDropIn && (
                <button
                  type="button"
                  onClick={() => setSelectedPackage(adultDropIn)}
                  className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-muted border border-border hover:border-primary/40 text-foreground shrink-0"
                >
                  Drop-In: {adultDropIn.price.toLocaleString()} LE →
                </button>
              )}
            </div>

            {/* 2x2 Visual Session Cards (5S, 10S, 20S, 30S) */}
            <div className="grid grid-cols-2 gap-3">
              {adultSessionPacks.map((pkg) => {
                const perSess = Math.round(pkg.price / pkg.sessions);
                const isPopular = pkg.sessions === 20 || pkg.sessions === 30;
                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackage(pkg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(pkg);
                    }}
                    className={`rounded-2xl overflow-hidden border flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all ${
                      isPopular ? 'border-primary/50 bg-card shadow-md' : 'border-border/80 bg-card'
                    }`}
                  >
                    <div className="relative h-28 w-full overflow-hidden">
                      <img
                        src={pkg.imageUrl || getPackageImage(pkg.name, pkg.sessions)}
                        alt={pkg.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
                      {pkg.sessions === 20 && (
                        <span className="absolute top-2 right-2 bg-primary text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full">
                          POPULAR
                        </span>
                      )}
                      {pkg.sessions === 30 && (
                        <span className="absolute top-2 right-2 bg-amber-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full">
                          BEST RATE
                        </span>
                      )}
                      <div className="absolute bottom-2 left-3 right-3 flex items-baseline justify-between">
                        <div>
                          <span className="text-white font-black text-2xl leading-none">{pkg.sessions}</span>
                          <span className="text-white/80 text-[10px] font-extrabold uppercase ml-1">Sessions</span>
                        </div>
                        <span className="text-white/70 text-[9px] font-bold">{pkg.expiryDays}d</span>
                      </div>
                    </div>

                    <div className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-black text-sm text-primary block leading-none">
                          {pkg.price.toLocaleString()} {t('payments.currency_le')}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-semibold mt-0.5 block">
                          {perSess} LE / session
                        </span>
                      </div>
                      <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 6-Month Unlimited Adult Spotlight Bar */}
            {adultSixMonth && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPackage(adultSixMonth)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(adultSixMonth);
                }}
                className="relative rounded-2xl overflow-hidden border border-primary/40 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-4 flex items-center gap-4 cursor-pointer active:scale-[0.99] shadow-md"
              >
                <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border border-primary/30">
                  <img
                    src={adultSixMonth.imageUrl || getPackageImage(adultSixMonth.name, adultSixMonth.sessions)}
                    alt={adultSixMonth.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary text-white mb-1">
                    6 MONTHS MEMBERSHIP • 180 DAYS
                  </span>
                  <h4 className="text-white font-black text-sm uppercase truncate">
                    {formatCleanPackageName(adultSixMonth.name)}
                  </h4>
                  <p className="text-zinc-400 text-[10px] font-semibold">
                    All-Access Group Training • Mivida, Complex & Impact
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-black text-base text-primary block">
                    {adultSixMonth.price.toLocaleString()} {t('payments.currency_le')}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-bold">~1,966 LE / mo</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. 1-ON-1 PRIVATE COACHING (PT) — PER-SESSION RATE COMPARISON GRID */}
        {adultPtPackages.length > 0 && (
          <div className="rounded-3xl bg-card border p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                  1-ON-1 PERSONAL TRAINING • ALL BRANCHES
                </span>
                <h3 className="text-sm font-black uppercase text-foreground">
                  Private Coaching Packages (PT)
                </h3>
              </div>
              {ptDropIn && (
                <button
                  type="button"
                  onClick={() => setSelectedPackage(ptDropIn)}
                  className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0"
                >
                  1 PT Drop-In: {ptDropIn.price.toLocaleString()} LE →
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {ptSessionPacks.map((pkg) => {
                const perSess = Math.round(pkg.price / pkg.sessions);
                const savingsPct = Math.round(((900 - perSess) / 900) * 100);
                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackage(pkg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedPackage(pkg);
                    }}
                    className="rounded-2xl border border-border/80 hover:border-amber-500/50 bg-muted/20 overflow-hidden flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <div className="relative h-24 w-full overflow-hidden">
                      <img
                        src={pkg.imageUrl || getPackageImage(pkg.name, pkg.sessions)}
                        alt={pkg.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                      {savingsPct > 0 && (
                        <span className="absolute top-2 right-2 bg-amber-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full">
                          SAVE {savingsPct}%
                        </span>
                      )}
                      <div className="absolute bottom-2 left-3">
                        <span className="text-white font-black text-xl leading-none">{pkg.sessions} PT</span>
                        <span className="text-white/70 text-[9px] font-bold block">{pkg.expiryDays} Days Validity</span>
                      </div>
                    </div>
                    <div className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-amber-400 block">
                          {perSess} LE / session
                        </span>
                        <span className="text-xs font-extrabold text-foreground">
                          Total: {pkg.price.toLocaleString()} {t('payments.currency_le')}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-amber-400 shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };
  // Active offers from storefront config
  const activeOffers = storefrontConfig.offers.filter(o => o.enabled).sort((a, b) => a.order - b.order);

  // Price per session calculator
  const pricePerSession = (pkg: Package) => Math.round(pkg.price / pkg.sessions);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (preloaderState !== 'hidden') {
    return (
      <div 
        className={`fixed inset-0 z-50 bg-[#070709] flex flex-col items-center justify-center transition-all ${
          preloaderState === 'exiting' ? 'preloader-exit' : ''
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(194,14,26,0.12)_0%,transparent_65%)] pointer-events-none" />
        
        <div className="relative flex flex-col items-center z-10 scale-95 animate-[fadeIn_1s_ease-out_forwards]">
          {branding.logoUrl ? (
            <div className="relative p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]">
              <img src={branding.logoUrl} alt={branding.companyName || 'CRM'} className="h-28 w-auto object-contain drop-shadow-[0_0_20px_rgba(194,14,26,0.4)]" />
            </div>
          ) : (
            <h1 className="text-5xl font-black tracking-[0.3em] text-white drop-shadow-[0_0_30px_rgba(194,14,26,0.5)]">
              {(branding.companyName || 'CRM').toUpperCase()}
            </h1>
          )}
          <p className="text-[11px] tracking-[0.5em] text-zinc-400 uppercase mt-6 font-bold">{branding?.companyName ?? ''}</p>
          
          <div className="h-1.5 w-32 bg-zinc-900 mt-10 rounded-full overflow-hidden border border-white/5 relative">
            <div className="h-full bg-gradient-to-r from-strike-green to-strike-green/60 rounded-full animate-[slide_1.8s_infinite_ease-in-out] shadow-[0_0_10px] shadow-strike-green/50" />
          </div>
        </div>
        
        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          @keyframes fadeIn {
            0% { opacity: 0; transform: scale(0.9); filter: blur(10px); }
            100% { opacity: 1; transform: scale(1); filter: blur(0); }
          }
          @keyframes fadeOutUp {
            0% { opacity: 1; transform: scale(1); filter: blur(0); }
            100% { opacity: 0; transform: scale(1.05); filter: blur(8px); }
          }
          .preloader-exit {
            animation: fadeOutUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            pointer-events: none;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col font-sans select-none">
      
      {/* ── LEADS PENDING BANNER ── */}
      {isLeadPending && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-xs px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))] text-center font-bold flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Account Pending Activation. Pay at branch to unlock member features.</span>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b px-4 min-h-[calc(3.75rem+var(--safe-top))] pt-[var(--safe-top)] flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setActiveTab('book')}
        >
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName || 'CRM'} className="h-8 w-auto object-contain dark:brightness-0 dark:invert" referrerPolicy="no-referrer" />
          ) : (
            <h1 className="text-xl font-black tracking-[0.2em]">{(branding.companyName || 'CRM').toUpperCase()}</h1>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!isLoggedIn && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSwitchToCRM()}
              className="h-8 text-xs font-bold rounded-lg border-primary/30 text-primary hover:bg-primary/10 gap-1.5 sf-interactive"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Button>
          )}
          {isLoggedIn && displayName && (
            <button 
              onClick={() => onSwitchToCRM('profile')}
              className="text-[11px] font-black mr-1 truncate max-w-[120px] bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 text-primary cursor-pointer hover:bg-primary/20 transition-all flex items-center gap-1 active:scale-95"
            >
              👤 {displayName.split(' ')[0]}
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme} disabled={themeLocked}
            className="h-8 w-8 rounded-lg text-foreground hover:bg-muted shrink-0"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <CartDrawer />
        </div>
      </header>

      {/* ── TABS (DESKTOP) ── */}
      {!isMobile && enabledTabs.length > 0 && (
        <div className="bg-card border-b px-2 flex overflow-x-auto no-scrollbar py-2 gap-2 sticky top-[calc(4rem+env(safe-area-inset-top))] z-30">
          {enabledTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition-all sf-interactive ${
                activeTab === tab.id 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'bg-muted/80 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── MAIN STOREFRONT CONTENT ── */}
      <main className={`flex-1 overflow-y-auto ${isMobile ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : ''}`}>
        
        {activeTab === 'book' && (
          <div className="space-y-8 py-6 sf-tab-enter">
          <div className="space-y-6 pt-4">
            {/* QUICK SHORTCUTS */}
            <div className="px-4">
              <h2 className="text-[17px] font-black tracking-tight uppercase mb-3 text-foreground/90">
                Quick Shortcuts
              </h2>
              <div className="grid grid-cols-4 gap-2 bg-card/60 backdrop-blur-md border border-border/40 rounded-3xl p-4 shadow-sm">
                
                {/* Book Shortcut */}
                <button
                  onClick={() => scrollToSection(kidsSectionRef)}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 group-hover:-translate-y-1">
                    {isStrike ? (
                      <BoxingGlovesIcon className="h-7 w-7 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
                    ) : (
                      <Dumbbell className="h-7 w-7 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
                    )}
                  </div>
                  <span className="text-[11px] font-bold mt-1 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Book
                  </span>
                </button>

                {/* Locations Shortcut */}
                <button
                  onClick={() => setActiveTab('locations')}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 group-hover:-translate-y-1">
                    <MapPin strokeWidth={1.25} className="h-7 w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] text-foreground" />
                  </div>
                  <span className="text-[11px] font-bold mt-1 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Locations
                  </span>
                </button>

                {/* Schedule Shortcut */}
                <button
                  onClick={() => setActiveTab('schedule')}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 group-hover:-translate-y-1">
                    <Calendar strokeWidth={1.25} className="h-7 w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] text-foreground" />
                  </div>
                  <span className="text-[11px] font-bold mt-1 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Schedule
                  </span>
                </button>

                {/* Announcements Shortcut */}
                <button
                  onClick={() => setActiveTab('announcements')}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 group-hover:-translate-y-1">
                    <Megaphone strokeWidth={1.25} className="h-7 w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] text-foreground" />
                  </div>
                  <span className="text-[11px] font-bold mt-1 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Announcements
                  </span>
                </button>

              </div>
            </div>

            {/* ─── SMART PACKAGE SEARCH & MULTI-CRITERIA FILTER BAR ─── */}
            <div className="p-4 border-b bg-card/40 space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search packages by program, branch or keywords..."
                  value={packageSearchQuery}
                  onChange={(e) => setPackageSearchQuery(e.target.value)}
                  className="h-10 pl-10 pr-9 rounded-2xl bg-background border text-xs focus:border-primary shadow-sm"
                />
                {packageSearchQuery && (
                  <button
                    onClick={() => setPackageSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filter Dropdowns Row */}
              <div className="grid grid-cols-3 gap-2">
                {/* 1. Branch / Location */}
                <Select value={selectedBranchFilter} onValueChange={(v) => setSelectedBranchFilter(v || 'all')}>
                  <SelectTrigger className="h-9 text-[11px] rounded-xl bg-background font-bold border-border/80">
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 2. Target Category */}
                <Select value={selectedCategoryFilter} onValueChange={(v) => setSelectedCategoryFilter(v as any)}>
                  <SelectTrigger className="h-9 text-[11px] rounded-xl bg-background font-bold border-border/80">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    <SelectItem value="adults">Adults Boxing</SelectItem>
                    <SelectItem value="kids">Kids Martial Arts</SelectItem>
                    <SelectItem value="juniors">Juniors Boxing</SelectItem>
                    <SelectItem value="pt">Private 1-on-1 (PT)</SelectItem>
                  </SelectContent>
                </Select>

                {/* 3. Duration / Sessions */}
                <Select value={selectedDurationFilter} onValueChange={(v) => setSelectedDurationFilter(v || 'all')}>
                  <SelectTrigger className="h-9 text-[11px] rounded-xl bg-background font-bold border-border/80">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plans</SelectItem>
                    <SelectItem value="1">1 Drop-In Pass</SelectItem>
                    <SelectItem value="8">8 Sessions (1 Mo)</SelectItem>
                    <SelectItem value="12">12 Sessions</SelectItem>
                    <SelectItem value="20">20 Sessions</SelectItem>
                    <SelectItem value="24">24 Sessions (3 Mo)</SelectItem>
                    <SelectItem value="30">30 Sessions</SelectItem>
                    <SelectItem value="48">48 Sessions (6 Mo)</SelectItem>
                    <SelectItem value="unlimited">Unlimited Pass</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category Quick Pills & Reset */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {[
                    { id: 'all', label: 'All', icon: <Dumbbell className="h-3 w-3" /> },
                    { id: 'adults', label: 'Adults', icon: <User className="h-3 w-3" /> },
                    { id: 'kids', label: 'Kids', icon: <Sparkles className="h-3 w-3" /> },
                    { id: 'juniors', label: 'Juniors', icon: <Tag className="h-3 w-3" /> },
                    { id: 'pt', label: 'PT', icon: <Star className="h-3 w-3" /> }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategoryFilter(cat.id as any)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full whitespace-nowrap text-[10px] font-black transition-all ${
                        selectedCategoryFilter === cat.id 
                          ? 'bg-primary text-primary-foreground shadow-sm' 
                          : 'bg-background border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {cat.icon}
                      {cat.label}
                    </button>
                  ))}
                </div>

                {isFilterActive && (
                  <button
                    onClick={() => {
                      setPackageSearchQuery('');
                      setSelectedBranchFilter('all');
                      setSelectedDurationFilter('all');
                      setSelectedCategoryFilter('all');
                    }}
                    className="text-primary text-[10px] font-bold shrink-0 ml-2 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* ─── FILTERED SEARCH RESULTS VIEW (When search or dropdown filters applied) ─── */}
            {isFilterActive && (
              <div className="p-4 space-y-4 sf-tab-enter">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black tracking-tight uppercase flex items-center gap-1.5 text-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> Filtered Packages
                  </h2>
                  <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary">
                    {filteredCatalogPackages.length} available
                  </Badge>
                </div>

                {filteredCatalogPackages.length === 0 ? (
                  <div className="p-8 text-center border border-dashed rounded-3xl bg-muted/20 space-y-3">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground opacity-30" />
                    <p className="text-xs font-bold text-foreground">No matching packages found</p>
                    <p className="text-[11px] text-muted-foreground">Try clearing or adjusting your branch or program filters.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs font-bold"
                      onClick={() => {
                        setPackageSearchQuery('');
                        setSelectedBranchFilter('all');
                        setSelectedDurationFilter('all');
                        setSelectedCategoryFilter('all');
                      }}
                    >
                      Reset Filters
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredCatalogPackages.map(pkg => renderPremiumPackageCard(pkg, pkg.name.toLowerCase().includes('golden package')))}
                  </div>
                )}
              </div>
            )}

            {/* 1. SLIDESHOW HERO */}
            {selectedCategoryFilter === 'all' && (
              <div className="px-4">
                <div className="relative h-52 rounded-3xl overflow-hidden shadow-xl border">
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/95 via-black/40 to-transparent z-10" />
                  <img 
                    src={getSlideImage(activeSlides[slideIndex]?.id, activeSlides[slideIndex]?.imageUrl, slideIndex)} 
                    alt="Training Sessions" 
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-out scale-105"
                  />
                  
                  <div className="absolute inset-0 z-20 flex flex-col justify-end p-6">
                    {activeSlides.map((slide, idx) => {
                      if (idx !== slideIndex) return null;
                      return (
                        <div key={slide.id} className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                          <Badge 
                            className="mb-2" 
                            style={{
                              backgroundColor: slide.badgeColor === 'primary' ? 'var(--brand-accent)' : slide.badgeColor || 'white',
                              color: slide.badgeColor === 'primary' ? 'white' : 'black'
                            }}
                          >
                            {slide.badgeText || 'Featured'}
                          </Badge>
                          <h3 className="text-white font-black text-xl leading-tight uppercase">{slide.title}</h3>
                          <p className="text-white/70 text-xs mt-1 mb-3">
                            {slide.subtitle || `${primaryBranch} • Timings available now`}
                          </p>
                        </div>
                      );
                    })}
                    <Button size="sm" className="w-full font-bold h-10 rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => scrollToSection(kidsSectionRef)}>
                      {activeSlides[slideIndex]?.ctaText || 'Book Now!'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* DYNAMIC SECTIONS FROM CONFIG */}
            {!isFilterActive && (storefrontConfig?.sections && storefrontConfig.sections.length > 0 ? (
              (() => {
                const list = [...storefrontConfig.sections];
                return list
                  .filter(sec => sec.enabled !== false)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((section) => {
                  if (section.type === 'packages-kids' && displayKids.length > 0 && (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'kids' || selectedCategoryFilter === 'juniors')) {
                    return (
                      <React.Fragment key={section.id}>
                        {renderYouthAcademySection(section.title, section.subtitle, section.imageUrl)}
                      </React.Fragment>
                    );
                  }

                  if (section.type === 'packages-juniors') {
                    // Consolidated into the structured Youth Academy section above so packages are never duplicated
                    return null;
                  }

                  if (section.type === 'packages-adults' && displayAdults.length > 0 && (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'adults' || selectedCategoryFilter === 'pt')) {
                    return (
                      <React.Fragment key={section.id}>
                        {renderAdultSection(section.title, section.subtitle, section.imageUrl)}
                      </React.Fragment>
                    );
                  }

                  if (section.type === 'banner' && selectedCategoryFilter === 'all') {
                    const bannerImg = section.imageUrl || (isStrike ? STRIKE_STORAGE_IMG.bannerImpact : "/impact_sister_company.png");
                    return (
                      <div key={section.id} className="px-4 my-6">
                        <div className="rounded-3xl overflow-hidden relative shadow-xl border">
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10" />
                          <img 
                            src={bannerImg} 
                            alt={section.title || "Promotional Banner"} 
                            className="w-full h-56 object-cover"
                          />
                          <div className="absolute inset-0 z-20 flex flex-col items-center justify-end p-6 text-center">
                            <h2 className="text-3xl font-black tracking-tighter text-white uppercase">{section.title || "IMPACT"}</h2>
                            <p className="text-white/80 text-[11px] mb-4 max-w-[240px] leading-relaxed">
                              {section.subtitle || "Our premium sister company focusing on functional conditioning, adult fitness, and high intensity classes."}
                            </p>
                            <Button 
                              variant="outline" 
                              className="bg-white text-black border-none hover:bg-zinc-200 transition-colors rounded-xl font-bold text-xs h-10 px-8 w-full"
                              onClick={() => scrollToSection(adultSectionRef)}
                            >
                              Discover More
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                });
              })()
            ) : (
              <>
                {/* Fallback to default sections if config has none */}
                {displayKids.length > 0 && (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'kids' || selectedCategoryFilter === 'juniors') &&
                  renderYouthAcademySection()
                }

                {/* 3. IMPACT SISTER COMPANY */}
                {selectedCategoryFilter === 'all' && (
                  <div className="px-4 my-6">
                    <div className="rounded-3xl overflow-hidden relative shadow-xl border">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10" />
                      <img 
                        src={getBannerImage()} 
                        alt={bannerSection?.title || "IMPACT Sister Company"} 
                        className="w-full h-56 object-cover"
                      />
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-end p-6 text-center">
                        <h2 className="text-3xl font-black tracking-tighter text-white uppercase">{bannerSection?.title || "IMPACT"}</h2>
                        <p className="text-white/80 text-[11px] mb-4 max-w-[240px] leading-relaxed">
                          {bannerSection?.subtitle || "Our premium sister company focusing on functional conditioning, adult fitness, and high intensity classes."}
                        </p>
                        <Button 
                          variant="outline" 
                          className="bg-white text-black border-none hover:bg-zinc-200 transition-colors rounded-xl font-bold text-xs h-10 px-8 w-full"
                          onClick={() => scrollToSection(adultSectionRef)}
                        >
                          Discover More
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ADULT PACKAGES */}
                {displayAdults.length > 0 && (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'adults' || selectedCategoryFilter === 'pt') &&
                  renderAdultSection()
                }
              </>
            ))}

            {/* 6. OFFERS & DISCOUNTS SECTION */}
            {activeOffers.length > 0 && (
            <div className="px-4 pt-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase flex items-center gap-2">
                  <Gift className="h-5 w-5 text-strike-green" /> Offers & Discounts
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {activeOffers.map(offer => (
                  <div key={offer.id} className="relative overflow-hidden bg-gradient-to-br from-strike-green/10 via-transparent to-primary/5 border border-strike-green/20 rounded-2xl p-4 shadow-sm sf-card-stagger">
                    {offer.badgeText && (
                      <Badge className="absolute top-3 right-3 bg-strike-green text-black text-[9px] font-black px-2">{offer.badgeText}</Badge>
                    )}
                    <div className="flex items-start gap-3">
                      {offer.imageUrl ? (
                        <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border">
                          <img src={offer.imageUrl} alt={offer.title} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-strike-green/10 flex items-center justify-center shrink-0">
                          <Tag className="h-6 w-6 text-strike-green" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-extrabold text-sm uppercase">{offer.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{offer.description}</p>
                        {offer.validUntil && (
                          <p className="text-[10px] text-strike-green font-bold mt-2">Valid until {new Date(offer.validUntil).toLocaleDateString()}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* 7. MEMBER RENEW / UPGRADE SECTION (only for logged-in members) */}
            {isLoggedIn && (
            <div className="px-4 pt-4">
              <div className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Star className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm uppercase">Manage Membership</h3>
                    <p className="text-[10px] text-muted-foreground">Renew, upgrade, or switch your plan</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-10 text-xs font-bold rounded-xl gap-1" onClick={() => onSwitchToCRM()}>
                    <RefreshCcw className="h-3 w-3" /> Renew
                  </Button>
                  <Button size="sm" className="flex-1 h-10 text-xs font-bold rounded-xl gap-1" onClick={() => onSwitchToCRM()}>
                    <ArrowUpRight className="h-3 w-3" /> Upgrade
                  </Button>
                </div>
              </div>
            </div>
            )}

            {/* EMPTY STATE - No packages at all */}
            {packages.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Dumbbell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-bold text-muted-foreground">Packages Coming Soon</h3>
                <p className="text-xs text-muted-foreground/60 mt-1">Our membership packages are being set up. Check back soon!</p>
              </div>
            )}

          </div>
        </div>
      )}

        {/* ── LOCATIONS TAB ── */}
        {activeTab === 'locations' && (
          <div className="p-4 space-y-4 sf-tab-enter">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Our Locations</h2>
            
            {branches.map((branch, idx) => {
              const details = getBranchDetails(branch, storefrontConfig);
              return (
                <div key={branch} className={`bg-card border rounded-2xl p-5 shadow-sm space-y-3 sf-card-stagger ${idx === 0 ? 'border-primary/20 bg-primary/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-sm uppercase">{details.displayName}</h3>
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px]">Open</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Welcome to our {details.displayName} location. Coached by certified instructors, featuring state-of-the-art facilities and equipment.
                  </p>
                  <div className="pt-2 border-t text-[11px] space-y-1 text-muted-foreground font-semibold">
                    <p>
                      📍 Location:{' '}
                      {details.mapUrl ? (
                        <a 
                          href={details.mapUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          {details.address} <ArrowUpRight className="h-3 w-3" />
                        </a>
                      ) : (
                        details.address
                      )}
                    </p>
                    <p>⏰ Timings: 6:00 AM - 11:00 PM</p>
                    <p>📞 Contact: {branding.companyName} Reception</p>
                  </div>
                  
                  {details.mapUrl && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2 rounded-xl text-xs font-bold bg-primary/5 text-primary border-primary/10 hover:bg-primary/10 flex items-center justify-center gap-1.5"
                      onClick={() => window.open(details.mapUrl!, '_blank', 'noopener,noreferrer')}
                    >
                      <Map className="h-3.5 w-3.5" /> Get Directions
                    </Button>
                  )}
                </div>
              );
            })}
            
            {branches.length === 0 && (
              <div className="text-center p-8 text-muted-foreground text-xs font-semibold">
                No active branches configured. Please check back later.
              </div>
            )}
          </div>
        )}

        {/* ── SCHEDULE TAB ── */}
        {activeTab === 'schedule' && (
          <div className="p-4 space-y-4 sf-tab-enter">
            <div>
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" /> Classes & Events
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Browse daily schedule and upcoming club sessions.</p>
            </div>

            {/* ─── BeFit-Style Horizontal Date Ribbon ─── */}
            <div className="relative">
              <div
                ref={dateScrollRef}
                className="flex gap-1 overflow-x-auto no-scrollbar py-1 px-0.5"
              >
                {dateRange.map((date, idx) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const isSelected = isSameDay(date, selectedDate);
                  const today = isToday(date);
                  const hasClasses = classes.some(c => c.date === dateKey);

                  return (
                    <button
                      key={idx}
                      data-today={today ? 'true' : undefined}
                      onClick={() => setSelectedDate(startOfDay(date))}
                      className={`flex flex-col items-center min-w-[48px] py-2 px-1 rounded-xl transition-all duration-200 shrink-0 ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105'
                          : today
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wider">
                        {format(date, 'EEE')}
                      </span>
                      <span className="text-lg font-bold leading-none mt-0.5">
                        {format(date, 'd')}
                      </span>
                      <span className="text-[8px] font-medium mt-0.5 uppercase">
                        {format(date, 'MMM')}
                      </span>
                      {hasClasses && (
                        <div className={`h-1 w-1 rounded-full mt-1 ${
                          isSelected ? 'bg-primary-foreground' : 'bg-primary'
                        }`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Selected Date Header ─── */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground">
                {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, dd MMM')}
                <span className="ml-2 font-normal">
                  {classes.filter(c => {
                    try {
                      return isSameDay(parseISO(c.date), selectedDate);
                    } catch { return false; }
                  }).length} sessions
                </span>
              </p>
            </div>

            {/* ─── Class Cards ─── */}
            <div className="space-y-3">
              {loadingClasses ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : classes.filter(c => {
                try {
                  return isSameDay(parseISO(c.date), selectedDate);
                } catch { return false; }
              }).length === 0 ? (
                <div className="border border-dashed bg-muted/20 rounded-2xl py-10 text-center text-muted-foreground text-xs italic">
                  <Calendar className="h-8 w-8 mx-auto opacity-20 mb-2" />
                  No sessions scheduled for {isToday(selectedDate) ? 'today' : format(selectedDate, 'dd MMM')}.
                </div>
              ) : (
                classes.filter(c => {
                  try {
                    return isSameDay(parseISO(c.date), selectedDate);
                  } catch { return false; }
                }).map(gymClass => {
                  const isFull = gymClass.attendees ? gymClass.attendees.length >= gymClass.capacity : false;
                  const spotsLeft = gymClass.attendees ? Math.max(0, gymClass.capacity - gymClass.attendees.length) : gymClass.capacity;

                  return (
                    <div key={gymClass.id} className="bg-card border rounded-2xl p-4 space-y-3 shadow-sm hover:bg-card/75 transition-all">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={gymClass.type === 'Event' ? 'default' : 'secondary'} className="text-[9px] uppercase tracking-wider h-4">
                              {gymClass.type}
                            </Badge>
                            <span className="text-[10px] text-primary uppercase font-mono tracking-wider font-bold">
                              {gymClass.branch}
                            </span>
                          </div>
                          <h4 className="text-xs font-black uppercase leading-snug tracking-tight text-foreground">{gymClass.name}</h4>
                          {gymClass.coachName && gymClass.coachName.trim().toLowerCase() !== 'no coach' && (
                            <p className="text-[10px] text-muted-foreground">Led by <strong>{gymClass.coachName}</strong></p>
                          )}
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {gymClass.time}
                          </div>
                        </div>
                      </div>

                      {gymClass.description && (
                        <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border leading-relaxed">
                          {gymClass.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between border-t pt-2.5 mt-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                          <Users className="h-3.5 w-3.5" />
                          <span>{gymClass.attendees ? gymClass.attendees.length : 0} / {gymClass.capacity} Joined</span>
                          {spotsLeft <= 3 && spotsLeft > 0 && (
                            <Badge className="bg-strike-green/10 text-strike-green border-strike-green/25 text-[9px] font-bold">
                              {spotsLeft} spots left!
                            </Badge>
                          )}
                        </div>

                        {isLoggedIn ? (
                          <Button
                            size="sm"
                            className="h-8 text-xs font-bold rounded-xl"
                            onClick={() => onSwitchToCRM()}
                          >
                            Go to Portal to Join
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 text-xs font-bold rounded-xl"
                            onClick={() => onSwitchToCRM()}
                          >
                            Login to Book
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── ANNOUNCEMENTS TAB ── */}
        {activeTab === 'announcements' && (
          <div className="p-4 space-y-4 sf-tab-enter">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Club News</h2>
            
            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-bold uppercase">Update</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 15, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">Welcome to {branding.companyName}!</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Our mobile guest portal is fully active. Check out our locations, schedules, and purchase membership packages directly from your mobile device.
              </p>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-zinc-400 uppercase">Announcement</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 12, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">{branding.companyName} Packages Live</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We have updated our membership packages. Browse the 'Book' tab to choose your plan and complete your registration.
              </p>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-zinc-400 uppercase">Billing</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 10, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">Support & Inquiries</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                For support, please contact the reception at any of our branches: {branches.join(', ') || 'our main location'}.
              </p>
            </div>
          </div>
        )}

      </main>

      {/* ── PACKAGE DETAIL DRAWER ── */}
      {selectedPackage && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setSelectedPackage(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div 
            className="relative w-full max-w-md bg-background rounded-t-3xl shadow-2xl border-t sf-tab-enter"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>
            
            {/* Close button */}
            <button 
              className="absolute top-3 right-4 h-11 w-11 flex items-center justify-center rounded-full bg-muted/80 hover:bg-muted text-foreground/80"
              onClick={() => setSelectedPackage(null)}
            >
              <X className="h-5 w-5" />
            </button>

            {/* Package Image */}
            <div className="px-5 pt-2">
              <div className="h-48 rounded-2xl overflow-hidden border bg-zinc-900">
                <img 
                  src={selectedPackage.imageUrl || getPackageImage(selectedPackage.name, selectedPackage.sessions)} 
                  alt={selectedPackage.name} 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Package Info */}
            <div className="px-5 pt-4 pb-2 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[8px] font-bold border-primary/20 text-primary uppercase">{selectedPackage.type || 'Package'}</Badge>
                  {selectedPackage.branch !== 'ALL' && (
                    <Badge variant="outline" className="text-[8px] font-bold border-zinc-700 text-zinc-400 uppercase">{selectedPackage.branch}</Badge>
                  )}
                </div>
                <h2 className="text-xl font-black tracking-tight uppercase">{selectedPackage.name}</h2>
                {getPackageTypeLabel(selectedPackage.name) && (
                  <p className="text-xs text-primary font-bold tracking-wide uppercase mt-1">
                    {getPackageTypeLabel(selectedPackage.name)}
                  </p>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Sessions</p>
                  <p className="text-lg font-black text-foreground">{selectedPackage.sessions}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Validity</p>
                  <p className="text-lg font-black text-foreground">{selectedPackage.expiryDays}<span className="text-xs"> days</span></p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Per Session</p>
                   <p className="text-lg font-black text-primary">{pricePerSession(selectedPackage)}<span className="text-[10px]"> {t('payments.currency_le')}</span></p>
                </div>
              </div>

              {/* Features List */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  {selectedPackage.sessions} training sessions included
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  Valid for {selectedPackage.expiryDays} days from activation
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  {selectedPackage.branch === 'ALL' ? 'Access to all branches' : `Available at ${selectedPackage.branch} branch`}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  {selectedPackage.type === 'Private' ? 'Private 1-on-1 training' : 'Group class access'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-5 pb-8 pt-2 flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground font-semibold mb-1">Total Price</p>
                 <p className="text-2xl font-black text-primary">{selectedPackage.price.toLocaleString()} <span className="text-sm">{t('payments.currency_le')}</span></p>
              </div>
              <Button 
                className="h-12 px-6 rounded-xl text-sm font-bold gap-2 sf-interactive"
                onClick={() => { addToCart(selectedPackage as any); setSelectedPackage(null); }}
              >
                <ShoppingCart className="h-4 w-4" /> Add to Cart
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR (DESKTOP) ── */}
      {!isMobile && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-40 flex flex-col items-center gap-2">
          {isLoggedIn ? (
            <div className="flex gap-2 w-[90vw] max-w-sm">
              <Button 
                variant="outline" 
                className="flex-1 rounded-full shadow-xl bg-background/90 backdrop-blur-md border-primary/30 text-xs font-bold h-12 sf-interactive"
                onClick={() => onSwitchToCRM()}
              >
                <Dumbbell className="h-4 w-4 mr-2" />
                My Portal
              </Button>
              <Button 
                variant="outline" 
                className="rounded-full shadow-xl text-xs font-bold h-12 px-6 bg-secondary/40 hover:bg-secondary text-muted-foreground hover:text-foreground"
                onClick={() => logout()}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="w-[90vw] max-w-sm rounded-full shadow-xl bg-background/90 backdrop-blur-md border-border/50 text-xs font-bold h-12 sf-interactive"
              onClick={() => onSwitchToCRM()}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Member / Staff Login
            </Button>
          )}
        </div>
      )}

      {/* ── BOTTOM NAV BAR (MOBILE) ── */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-card/95 border-t z-50 flex justify-around pt-1.5 pb-[max(0.5rem,var(--safe-bottom))] shadow-lg backdrop-blur-xl">
          {[
            { 
              id: 'signin', 
              label: isLoggedIn ? 'My Portal' : 'Sign In', 
              icon: isLoggedIn ? <LayoutDashboard className="h-5 w-5" /> : <LogIn className="h-5 w-5" />, 
              action: () => onSwitchToCRM(isLoggedIn ? 'profile' : undefined) 
            },
            ...enabledTabs.map(t => ({
              id: t.id,
              label: t.label,
              icon: t.id === 'book' ? <Calendar className="h-5 w-5" /> :
                    t.id === 'locations' ? <MapPin className="h-5 w-5" /> :
                    t.id === 'schedule' ? <Clock className="h-5 w-5" /> :
                    <Bell className="h-5 w-5" />,
              action: () => setActiveTab(t.id as any)
            }))
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={item.action}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 min-w-[56px] transition-colors rounded-xl ${
                  isActive ? 'text-primary font-bold' : 'text-muted-foreground font-semibold'
                }`}
              >
                {item.icon}
                <span className="text-[9px] tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

    </div>
  );
}
