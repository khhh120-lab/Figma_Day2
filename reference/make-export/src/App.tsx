import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

type Route = { name: "plans" } | { name: "detail" planId: string } | {
  name: "apply"
  planId: string
} | { name: "complete" }

type Plan = {
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

type Application = {
  number: string
  plan: Plan
  name: string
  phone: string
  appliedAt: string
}

const plans: Plan[] = [
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

const filters = ["데이터 많이", "가성비", "구독 포함", "통화 많이"] as const

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`
}

function readRoute(): Route {
  const path = window.location.pathname
  const match = path.match(/^\/plans\/([^/]+)$/)

  if (match) return { name: "detail", planId: match[1] }
  if (path === "/apply") {
    return {
      name: "apply",
      planId:
        new URLSearchParams(window.location.search).get("plan") ?? plans[0].id,
    }
  }
  if (path === "/complete") return { name: "complete" }
  return { name: "plans" }
}

function pathFor(route: Route) {
  if (route.name === "plans") return "/plans"
  if (route.name === "detail") return `/plans/${route.planId}`
  if (route.name === "apply") return `/apply?plan=${route.planId}`
  return "/complete"
}

function Header({
  title,
  root = false,
  onBack,
}: {
  title: string
  root?: boolean
  onBack?: () => void
}) {
  return (
    <header className={`app-header${root ? " app-header--root" : ""}`}>
      {root ? (
        <span className="header-title">{title}</span>
      ) : (
        <button
          className="icon-button"
          type="button"
          aria-label="이전 화면"
          onClick={onBack}
        >
          <img src="/assets/f152b.svg" alt="" />
        </button>
      )}
      {root ? (
        <img className="logo" src="/assets/38036.svg" alt="U+" />
      ) : (
        <>
          <span className="header-title">{title}</span>
          <span className="header-spacer" aria-hidden="true" />
        </>
      )}
    </header>
  )
}

function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  variant?: "primary" | "secondary"
  disabled?: boolean
}) {
  return (
    <button
      className={`kit-button kit-button--${variant}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`filter-chip${selected ? " filter-chip--selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="tag w-fit self-start">{children}</span>
}

function ListRow({
  label,
  value,
  check = false,
}: {
  label: string
  value?: string
  check?: boolean
}) {
  return (
    <div className={`list-row${check ? " list-row--check" : ""}`}>
      {check && (
        <img className="benefit-bullet" src="/assets/d5cc2.svg" alt="" />
      )}
      <span className={check ? "list-row-value" : "list-row-label"}>
        {label}
      </span>
      {value && <span className="list-row-value">{value}</span>}
    </div>
  )
}

function BottomCta({
  children,
  summary,
}: {
  children: ReactNode
  summary?: { label: string amount: string }
}) {
  return (
    <div className={`bottom-cta${summary ? " bottom-cta--price" : ""}`}>
      {summary && (
        <div className="cta-summary">
          <span>{summary.label}</span>
          <strong>{summary.amount}</strong>
        </div>
      )}
      <div className="cta-actions">{children}</div>
    </div>
  )
}

function PlanCard({ plan, onDetail }: { plan: Plan onDetail: () => void }) {
  return (
    <article className="plan-card">
      {plan.badge && <Tag>{plan.badge}</Tag>}
      <span className="plan-name">{plan.name}</span>
      <span className="plan-description">{plan.description}</span>
      <div className="plan-price-row">
        <div className="plan-price-group">
          <div className="current-price">
            {plan.discount && (
              <strong className="discount">{plan.discount}</strong>
            )}
            <strong>월 {formatPrice(plan.price)}</strong>
          </div>
          {plan.originalPrice && (
            <span className="original-price">
              월 {formatPrice(plan.originalPrice)}
            </span>
          )}
          {plan.promo && <span className="promo-chip">{plan.promo}</span>}
        </div>
        <Button variant="secondary" onClick={onDetail}>
          자세히
        </Button>
      </div>
    </article>
  )
}

function PlansScreen({ navigate }: { navigate: (route: Route) => void }) {
  const [filter, setFilter] = useState<typeof filters[number]>("데이터 많이")
  const visiblePlans = useMemo(
    () => plans.filter((plan) => plan.categories.includes(filter)),
    [filter],
  )

  return (
    <main className="screen screen--muted">
      <Header title="요금제" root />
      <div className="scroll-content plans-content">
        <section className="title-group">
          <h1>
            나에게 맞는 요금제를
            <br />
            골라보세요
          </h1>
          <p>중요하게 보는 조건을 고르면 추천해 드려요</p>
        </section>
        <div className="filter-list" aria-label="요금제 필터">
          {filters.map((item) => (
            <FilterChip
              key={item}
              label={item}
              selected={filter === item}
              onClick={() => setFilter(item)}
            />
          ))}
        </div>
        <section className="plan-list">
          <p className="list-meta">추천순 · {visiblePlans.length}개</p>
          {visiblePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onDetail={() => navigate({ name: "detail", planId: plan.id })}
            />
          ))}
        </section>
      </div>
    </main>
  )
}

function DetailScreen({
  plan,
  navigate,
}: {
  plan: Plan
  navigate: (route: Route) => void
}) {
  return (
    <main className="screen">
      <Header title="요금제 상세" onBack={() => navigate({ name: "plans" })} />
      <div className="scroll-content screen-with-price-cta">
        <section className="detail-title">
          {plan.badge && <Tag>{plan.badge}</Tag>}
          <h1>{plan.name}</h1>
          <p>{plan.description}</p>
        </section>
        <section className="price-card">
          <span>월 요금</span>
          <div className="price-card-current">
            <strong>{formatPrice(plan.price)}</strong>
            {plan.discount && <b>{plan.discount}</b>}
          </div>
          {plan.originalPrice && (
            <small>
              <s>{formatPrice(plan.originalPrice)}/월</s> · 24개월 할인 프로모션
              적용
            </small>
          )}
        </section>
        <section className="detail-section">
          <h2>기본 제공</h2>
          <ListRow label="데이터" value={plan.data} />
          <ListRow label="통화" value="집·이동전화 무제한" />
          <ListRow label="문자" value="기본 제공" />
        </section>
        <section className="detail-section">
          <h2>포함 혜택</h2>
          {plan.benefits.map((benefit) => (
            <ListRow key={benefit} label={benefit} value="포함" check />
          ))}
        </section>
      </div>
      <BottomCta
        summary={{ label: "월 납부 금액", amount: formatPrice(plan.price) }}
      >
        <Button onClick={() => navigate({ name: "apply", planId: plan.id })}>
          구독 신청하기
        </Button>
      </BottomCta>
    </main>
  )
}

function ApplyScreen({
  plan,
  navigate,
  onComplete,
}: {
  plan: Plan
  navigate: (route: Route) => void
  onComplete: (application: Application) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [agreed, setAgreed] = useState(false)
  const valid =
    name.trim().length > 1 && phone.replace(/\D/g, "").length >= 10 && agreed

  function handlePhone(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11)
    const formatted =
      digits.length < 4
        ? digits
        : digits.length < 8
          ? `${digits.slice(0, 3)}-${digits.slice(3)}`
          : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    setPhone(formatted)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const now = new Date()
    onComplete({
      number: `UP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-01`,
      plan,
      name: name.trim(),
      phone,
      appliedAt: new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now),
    })
  }

  return (
    <main className="screen">
      <Header
        title="구독 신청"
        onBack={() => navigate({ name: "detail", planId: plan.id })}
      />
      <form className="application-form" onSubmit={submit}>
        <div className="scroll-content screen-with-cta">
          <section className="title-group title-only">
            <h1>
              신청 정보를
              <br />
              입력해주세요
            </h1>
          </section>
          <section className="apply-summary">
            <ListRow label="선택 요금제" value={plan.name} />
            <ListRow label="월 요금" value={formatPrice(plan.price)} />
          </section>
          <div className="fields">
            <label className="field">
              <span>이름</span>
              <input
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value.replace(
                      /[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\s]/g,
                      "",
                    ),
                  )
                }
                placeholder="이름을 입력해주세요"
                autoComplete="name"
                inputMode="text"
              />
            </label>
            <label className="field">
              <span>휴대폰 번호</span>
              <input
                value={phone}
                onChange={(event) => handlePhone(event.target.value)}
                placeholder="010-0000-0000"
                inputMode="numeric"
                autoComplete="tel"
              />
            </label>
            <label className="agreement">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span className="check-control" aria-hidden="true">
                {agreed && <img src="/assets/e8d68.svg" alt="" />}
              </span>
              <span>[필수] 개인정보 수집·이용에 동의합니다</span>
            </label>
          </div>
        </div>
        <BottomCta>
          <Button type="submit" disabled={!valid}>
            신청하기
          </Button>
        </BottomCta>
      </form>
    </main>
  )
}

function CompleteScreen({
  application,
  navigate,
}: {
  application: Application
  navigate: (route: Route) => void
}) {
  const maskedName =
    application.name.length > 1
      ? `${application.name[0]}${"*".repeat(Math.max(1, application.name.length - 2))}${application.name.at(-1)}`
      : application.name
  const phoneDigits = application.phone.replace(/\D/g, "")
  const maskedPhone =
    phoneDigits.length >= 7
      ? `${phoneDigits.slice(0, 3)}-****-${phoneDigits.slice(-4)}`
      : application.phone

  return (
    <main className="screen">
      <Header title="신청 완료" onBack={() => window.history.back()} />
      <div className="scroll-content screen-with-cta complete-content">
        <section className="complete-result">
          <span className="done-mark" aria-hidden="true">
            <img src="/assets/7c149.svg" alt="" />
          </span>
          <h1>구독 신청이 완료됐어요</h1>
          <p>개통 안내는 문자로 보내드려요</p>
        </section>
        <section className="application-card">
          <h2>신청 내역</h2>
          <ListRow label="신청 번호" value={application.number} />
          <ListRow label="요금제" value={application.plan.name} />
          <ListRow
            label="월 요금"
            value={formatPrice(application.plan.price)}
          />
          <ListRow label="신청 일시" value={application.appliedAt} />
          <ListRow label="신청자" value={`${maskedName} · ${maskedPhone}`} />
        </section>
      </div>
      <BottomCta>
        <Button onClick={() => window.location.assign("/plans")}>
          요금제 더 보기
        </Button>
      </BottomCta>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute())
  const [application, setApplication] = useState<Application | null>(null)

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/plans")
    }
    const onPopState = () => setRoute(readRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function navigate(next: Route) {
    window.history.pushState({}, "", pathFor(next))
    setRoute(next)
    window.scrollTo(0, 0)
  }

  if (route.name === "plans") return <PlansScreen navigate={navigate} />

  if (route.name === "complete") {
    const completed =
      application ??
      {
        number: "UP20250616-01",
        plan: plans[0],
        name: "신청자",
        phone: "010-0000-0000",
        appliedAt: "2025. 06. 16. 14:30",
      } satisfies Application
    return <CompleteScreen application={completed} navigate={navigate} />
  }

  const selectedPlan =
    plans.find((plan) => plan.id === route.planId) ?? plans[0]

  if (route.name === "apply") {
    return (
      <ApplyScreen
        plan={selectedPlan}
        navigate={navigate}
        onComplete={(completed) => {
          setApplication(completed)
          navigate({ name: "complete" })
        }}
      />
    )
  }

  return <DetailScreen plan={selectedPlan} navigate={navigate} />
}
