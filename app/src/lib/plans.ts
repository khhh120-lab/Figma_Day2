export type Plan = {
  id: string
  name: string
  price: number
  originalPrice?: number
  discount?: string
  data: string
  description: string
  badge?: string
  promo?: string
  categories: Array<"데이터 많이" | "가성비" | "구독 포함" | "통화 많이">
  benefits: string[]
}

export const plans: Plan[] = [
  {
    id: "unlimited",
    name: "넉넉 무제한",
    price: 85000,
    originalPrice: 100000,
    discount: "15%",
    data: "무제한",
    description: "영상·게임을 하루 종일 해도 걱정 없어요",
    badge: "추천",
    promo: "24개월 할인 프로모션",
    categories: ["데이터 많이", "구독 포함", "통화 많이"],
    benefits: ["넷플릭스 스탠다드", "유튜브 프리미엄"],
  },
  {
    id: "standard",
    name: "스탠다드 110",
    price: 69000,
    originalPrice: 78000,
    discount: "12%",
    data: "110GB",
    description: "데이터 110GB · 통화 무제한",
    badge: "추천",
    promo: "24개월 할인 프로모션",
    categories: ["데이터 많이", "가성비", "통화 많이"],
    benefits: ["데이터 소진 후 5Mbps", "테더링 40GB"],
  },
  {
    id: "light",
    name: "라이트 30",
    price: 49000,
    data: "30GB",
    description: "데이터 30GB · 통화 무제한",
    badge: "추천",
    categories: ["데이터 많이", "가성비", "통화 많이"],
    benefits: ["데이터 소진 후 1Mbps", "테더링 10GB"],
  },
  {
    id: "slim",
    name: "슬림 10",
    price: 39000,
    originalPrice: 43000,
    discount: "10%",
    data: "10GB",
    description: "데이터 10GB · 통화 무제한",
    badge: "추천",
    categories: ["데이터 많이", "가성비", "통화 많이"],
    benefits: ["데이터 소진 후 1Mbps", "U+zone 무료"],
  },
]

