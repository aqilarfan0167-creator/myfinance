import {
  Briefcase, Clock, Gift, Award, Receipt, Store, TrendingUp, Plus, Utensils, ShoppingBasket, Fuel, Milestone, Bus, Home, Zap, Smartphone, Users,
  ShoppingBag, HeartPulse, GraduationCap, Shield, Film, Repeat, Wrench, Landmark, Banknote, MoreHorizontal, Wallet, CreditCard, PiggyBank, LineChart,
  Coins, Tag, type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  Briefcase, Clock, Gift, Award, Receipt, Store, TrendingUp, Plus, Utensils, ShoppingBasket, Fuel, Milestone, Bus, Home, Zap, Smartphone, Users,
  ShoppingBag, HeartPulse, GraduationCap, Shield, Film, Repeat, Wrench, Landmark, Banknote, MoreHorizontal, Wallet, CreditCard, PiggyBank, LineChart, Coins, Tag,
};
export function Icon({ name, className, color }: { name: string; className?: string; color?: string }) {
  const I = ICONS[name] ?? Tag;
  return <I className={className ?? 'h-4 w-4'} style={color ? { color } : undefined} />;
}
export function IconBadge({ name, color }: { name: string; color: string }) {
  return <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: color + '1f' }}><Icon name={name} color={color} /></span>;
}
