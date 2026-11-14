import React from 'react';
import {
  Utensils,
  Car,
  ShoppingBag,
  Gamepad2,
  Home,
  HeartPulse,
  Smartphone,
  Shirt,
  Gift,
  MoreHorizontal,
  Briefcase,
  Zap,
  TrendingUp,
  Award,
  Coins,
  Wallet,
  CreditCard,
  Tag,
  Circle,
  CircleDollarSign,
  ArrowRightLeft,
  DollarSign,
  Calendar,
  Coffee,
  Plane,
  Film,
  BookOpen,
  Laptop,
  Tv,
  Armchair,
  Watch,
  Package,
  Clock,
  Wrench,
  ShieldCheck,
  Snowflake,
  Heart,
  Flame,
  ShieldAlert,
  Layers,
  Scissors,
  Dumbbell,
  Sparkles,
  Ticket,
  Fuel,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Utensils,
  Car,
  ShoppingBag,
  Gamepad2,
  Home,
  HeartPulse,
  Smartphone,
  Shirt,
  Gift,
  MoreHorizontal,
  Briefcase,
  Zap,
  TrendingUp,
  Award,
  Coins,
  Wallet,
  CreditCard,
  Tag,
  Circle,
  CircleDollarSign,
  ArrowRightLeft,
  DollarSign,
  Calendar,
  Coffee,
  Plane,
  Film,
  BookOpen,
  Laptop,
  Tv,
  Armchair,
  Watch,
  Package,
  Clock,
  Wrench,
  ShieldCheck,
  Snowflake,
  Heart,
  Flame,
  ShieldAlert,
  Layers,
  Scissors,
  Dumbbell,
  Sparkles,
  Ticket,
  Fuel,
};

interface Props {
  name?: string;
  className?: string;
}

export const DynamicIcon: React.FC<Props> = ({ name, className = 'w-5 h-5' }) => {
  if (!name) return <Circle className={className} />;

  // Special aliases for common accounts
  if (name.toLowerCase() === 'alipay') {
    return (
      <span className={`inline-flex items-center justify-center font-bold text-xs bg-blue-500 text-white rounded-full ${className}`}>
        支
      </span>
    );
  }
  if (name.toLowerCase() === 'wechat') {
    return (
      <span className={`inline-flex items-center justify-center font-bold text-xs bg-emerald-500 text-white rounded-full ${className}`}>
        微
      </span>
    );
  }

  const IconComponent = ICON_MAP[name] || CircleDollarSign;
  return <IconComponent className={className} />;
};

