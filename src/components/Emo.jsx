/* design-gate: ignore-file — 이모지→아이콘 대응표(키가 이모지일 수밖에 없다) */
// 화면 글자 속 이모지 자리를 lucide 아이콘으로(2026-11-18 리디자인 — 이모지 대신 선 아이콘, design-gate ⑦).
//   코드모드가 JSX 글자 속 이모지를  로 바꿨다. 모르는 기호는 아무것도 그리지 않는다.
import React from "react";
import {
  Printer, Rocket, BarChart3, Flame, VolumeX, Wrench, Lightbulb, Check, AlertTriangle, Sparkles, CheckCircle2, PenLine,
  FlaskConical, X, ClipboardList, PartyPopper, Sprout, BookOpen, Pin, Pencil, Bot, Gem, Target, Hourglass, Snowflake,
  User, Palette, Dumbbell, Trophy, Gift, Eye, Search, MessageCircle, Clock, Inbox, XCircle, Clover, RefreshCw, School,
  Mic, Trash2, Medal, Home, Lock, Shield, Users, Coins, Star, Megaphone, Calendar, Wand2, Undo2, Pointer, Settings,
  ThumbsUp, Ruler, Frown, Music, Puzzle, ShoppingCart, Scissors, Handshake, Globe, PawPrint, Plane, Flower2, Utensils,
  Volleyball, Microscope, Landmark, Gamepad2, TreePine, Briefcase, Mail, Notebook, Clapperboard, Newspaper, Scale,
  Download, Dice5, Tag, Folder, FileText, ArrowLeft, TrendingUp, Upload, Timer, Wifi, Hand, Save, HelpCircle, Construction,
  Award, Heart, Theater, GraduationCap,
} from "lucide-react";

const MAP = {
  "🚀": Rocket, "📊": BarChart3, "🔥": Flame, "🔇": VolumeX, "🔧": Wrench, "💡": Lightbulb, "✓": Check, "✔": Check,
  "⚠": AlertTriangle, "✨": Sparkles, "✅": CheckCircle2, "📝": PenLine, "🧪": FlaskConical, "✗": X, "✕": X, "✖": X,
  "📋": ClipboardList, "🎉": PartyPopper, "🌱": Sprout, "📚": BookOpen, "📖": BookOpen, "📌": Pin, "✏": Pencil, "✍": PenLine,
  "🤖": Bot, "💎": Gem, "🎯": Target, "⏳": Hourglass, "❄": Snowflake, "👤": User, "🎨": Palette, "💪": Dumbbell,
  "🏆": Trophy, "🎁": Gift, "👀": Eye, "🔍": Search, "💬": MessageCircle, "⏰": Clock, "🕐": Clock, "📭": Inbox, "❌": XCircle,
  "🍀": Clover, "🔄": RefreshCw, "🏫": School, "🎤": Mic, "🗑": Trash2, "🥇": Medal, "🥈": Medal, "🥉": Medal, "🏅": Award,
  "🏠": Home, "🔒": Lock, "🛡": Shield, "👨‍🏫": GraduationCap, "👩‍🏫": GraduationCap, "👨‍👩‍👧‍👦": Users, "💰": Coins,
  "🌟": Star, "⭐": Star, "🎭": Theater, "📢": Megaphone, "📅": Calendar, "🪄": Wand2, "↩": Undo2, "👆": Pointer, "👈": ArrowLeft,
  "⚙": Settings, "👍": ThumbsUp, "👏": ThumbsUp, "📏": Ruler, "😔": Frown, "😵": Frown, "♪": Music, "♫": Music, "♩": Music,
  "🧩": Puzzle, "🛒": ShoppingCart, "✂": Scissors, "🤝": Handshake, "🌍": Globe, "🐾": PawPrint, "✈": Plane, "🌸": Flower2,
  "🍽": Utensils, "⚽": Volleyball, "🔬": Microscope, "🏛": Landmark, "🎮": Gamepad2, "🌳": TreePine, "💼": Briefcase,
  "✉": Mail, "📔": Notebook, "🎬": Clapperboard, "🦄": Sparkles, "📰": Newspaper, "⚖": Scale, "🗣": Megaphone, "📥": Download,
  "🎲": Dice5, "🏷": Tag, "📁": Folder, "📄": FileText, "📈": TrendingUp, "📤": Upload, "⏱": Timer, "📶": Wifi, "👋": Hand,
  "💾": Save, "❓": HelpCircle, "🏗": Construction, "❤": Heart, "💕": Heart,
};

const BY_NAME = { Printer, Rocket, BarChart3, Flame, VolumeX, Wrench, Lightbulb, Check, AlertTriangle, Sparkles, CheckCircle2, PenLine, FlaskConical, X, ClipboardList, PartyPopper, Sprout, BookOpen, Pin, Pencil, Bot, Gem, Target, Hourglass, Snowflake, User, Palette, Dumbbell, Trophy, Gift, Eye, Search, MessageCircle, Clock, Inbox, XCircle, Clover, RefreshCw, School, Mic, Trash2, Medal, Home, Lock, Shield, Users, Coins, Star, Megaphone, Calendar, Wand2, Undo2, Pointer, Settings, ThumbsUp, Ruler, Frown, Music, Puzzle, ShoppingCart, Scissors, Handshake, Globe, PawPrint, Plane, Flower2, Utensils, Volleyball, Microscope, Landmark, Gamepad2, TreePine, Briefcase, Mail, Notebook, Clapperboard, Newspaper, Scale, Download, Dice5, Tag, Folder, FileText, ArrowLeft, TrendingUp, Upload, Timer, Wifi, Hand, Save, HelpCircle, Construction, Award, Heart, Theater, GraduationCap };

// n = lucide 이름(코드에 박힌 자리), e = 데이터에 든 이모지 값(icon: "…")을 그릴 때
export default function Emo({ n, e, className = "" }) {
  const key = String(e || "").replace(/\uFE0F/g, "");
  const own = (o, k) => (k && Object.hasOwn(o, k) ? o[k] : undefined); // «__proto__» 같은 키가 상속 객체를 집지 않게
  // 매핑 없는 데이터 이모지(e=)는 빈칸 대신 기본 아이콘 — 교차검증(grok·meta) 2026-11-18
  const Icon = n ? own(BY_NAME, n) : (own(MAP, key) || (key ? Sparkles : undefined));
  if (!Icon) return null;
  return <Icon aria-hidden="true" strokeWidth={2.2} className={`inline-block h-[1.05em] w-[1.05em] align-[-0.15em] ${className}`} />;
}
