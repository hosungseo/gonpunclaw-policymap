import Link from "next/link";
import styles from "./home.module.css";

const WORKFLOW = [
  {
    number: "01",
    title: "데이터 준비",
    body: "기존 XLSX·CSV를 올리면 시트와 주소·이름·대표값 열을 먼저 읽습니다.",
    meta: "파일 구조 자동 감지",
  },
  {
    number: "02",
    title: "지도 검토",
    body: "좌표 변환 결과와 실패 주소를 확인하고, 공개할 열만 직접 선택합니다.",
    meta: "주소 품질과 민감정보 확인",
  },
  {
    number: "03",
    title: "운영 관리",
    body: "출처·기준일·공개 범위를 붙여 발행하고, 버전과 관리 링크를 이어서 운영합니다.",
    meta: "공개 범위와 변경 이력",
  },
];

const CAPABILITIES = [
  {
    index: "A",
    value: "3단계",
    title: "주소 자동 좌표화",
    body: "카카오·VWorld·도로명주소 API를 순서대로 사용하고, 찾지 못한 주소는 검수 목록으로 분리합니다.",
  },
  {
    index: "B",
    value: "즉시",
    title: "공개 링크 발행",
    body: "검수가 끝나면 지도 링크와 내부 관리 링크를 분리해 발급합니다. 비공개·링크 공개·전체 공개를 선택할 수 있습니다.",
  },
  {
    index: "C",
    value: "지도 + 표",
    title: "현황을 보는 두 가지 방식",
    body: "검색·분류·값 범위로 좁혀 보고, 같은 결과를 지도와 표 사이에서 오가며 확인합니다.",
  },
];

const PIPELINE = [
  ["01", "파일 업로드"],
  ["02", "주소 품질 검수"],
  ["03", "공개 범위 확인"],
  ["04", "지도 링크 발행"],
];

function PolicyMapPreview() {
  return (
    <div className={styles.mapStage} aria-hidden="true">
      <div className={styles.mapTopbar}>
        <div>
          <span className={styles.mapOverline}>LIVE WORKSPACE</span>
          <strong>생활SOC 운영 현황</strong>
        </div>
        <span className={styles.liveStatus}><i /> 공개 준비</span>
      </div>

      <div className={styles.mapCanvas}>
        <svg className={styles.mapSvg} viewBox="0 0 720 540" role="presentation">
          <defs>
            <linearGradient id="terrain" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#18263b" />
              <stop offset="1" stopColor="#0c1728" />
            </linearGradient>
            <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path
            className={styles.landmass}
            d="M179 85C229 48 297 51 335 82c31 25 49 59 91 78 58 27 101 21 121 66 21 48-12 81-37 111-28 33-40 82-91 104-54 24-83-5-122 7-49 15-105 1-130-42-20-35 8-75-9-107-22-39-63-56-57-105 5-42 36-76 69-107Z"
          />
          <path className={styles.regionLine} d="M191 155c73 37 109 17 165 42 57 26 81 65 170 59" />
          <path className={styles.regionLine} d="M175 274c55-29 95-22 138 3 42 24 72 20 109 4 39-16 76-12 109 14" />
          <path className={styles.regionLine} d="M234 101c6 60-21 95-10 144 13 57 62 71 68 124 3 30-9 56-26 76" />
          <path className={styles.regionLine} d="M359 83c-18 58-17 99 14 135 42 48 13 107 47 160 13 21 35 39 61 50" />
          <path className={styles.route} d="M214 353C282 302 304 196 389 204c63 6 71 83 135 104" />
          <circle className={styles.routePoint} cx="214" cy="353" r="7" />
          <circle className={styles.routePoint} cx="389" cy="204" r="7" />
          <circle className={styles.routePoint} cx="524" cy="308" r="7" />
          <circle className={styles.pinHalo} cx="389" cy="204" r="24" />
          <circle className={styles.pin} cx="389" cy="204" r="10" filter="url(#softGlow)" />
          <circle className={styles.pinSmall} cx="266" cy="130" r="8" />
          <circle className={styles.pinSmall} cx="482" cy="379" r="8" />
          <circle className={styles.pinWarm} cx="214" cy="353" r="9" />
        </svg>

        <div className={`${styles.mapLabel} ${styles.labelSeoul}`}>
          <span>서울 중구</span><strong>18곳</strong>
        </div>
        <div className={`${styles.mapLabel} ${styles.labelSejong}`}>
          <span>세종</span><strong>검수 2</strong>
        </div>
        <div className={`${styles.mapLabel} ${styles.labelBusan}`}>
          <span>부산</span><strong>12곳</strong>
        </div>

        <div className={styles.mapSummary}>
          <span>현재 조건</span>
          <strong>128</strong>
          <small>개 정책 거점</small>
        </div>
      </div>

      <div className={styles.mapFooter}>
        <span>출처 · 2026 생활SOC 현황</span>
        <span>기준일 · 2026. 07. 31</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGrid} />
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="GonpunClaw PolicyMap 홈">
            <span className={styles.brandMark}>P</span>
            <span><strong>GonpunClaw</strong><small>PolicyMap</small></span>
          </Link>
          <nav className={styles.nav} aria-label="주요 메뉴">
            <a href="#workflow">흐름</a>
            <a href="#capabilities">기능</a>
            <Link href="/templates">템플릿</Link>
            <Link href="/guide">가이드</Link>
          </nav>
          <Link href="/upload" className={styles.headerCta}>지도 만들기 <span>↗</span></Link>
        </header>

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.productName}>GonpunClaw <span>PolicyMap</span></p>
            <p className={styles.eyebrow}>업무 흐름 그대로</p>
            <h1>엑셀 주소 목록을<br />바로 공유 가능한<br /><em>정책 지도로.</em></h1>
            <p className={styles.lede}>
              별도 GIS 도구 없이, 주소가 있는 업무 데이터를 검수 가능한 지도와 표로 바꿉니다.
            </p>
            <div className={styles.heroActions}>
              <Link href="/upload" className={styles.primaryAction}>지도 만들기 <span>→</span></Link>
              <Link href="/demo" className={styles.secondaryAction}>샘플 지도 보기 <span>↗</span></Link>
            </div>
            <p className={styles.microcopy}>XLSX·CSV 지원 <i /> 가입 없이 시작 <i /> 공개 범위 직접 선택</p>
          </div>

          <div className={styles.heroVisual}>
            <PolicyMapPreview />
          </div>
        </div>

        <ol className={styles.pipeline} aria-label="지도 발행 과정">
          {PIPELINE.map(([number, label], index) => (
            <li key={number}>
              <span>{number}</span>
              <strong>{label}</strong>
              {index < PIPELINE.length - 1 && <i>→</i>}
            </li>
          ))}
        </ol>
      </section>

      <div className={styles.useCaseBand} aria-label="활용 분야">
        <span>복지시설 분포</span><i />
        <span>생활SOC</span><i />
        <span>현장 점검 대상</span><i />
        <span>정책 거점기관</span><i />
        <span>지원 대상 위치</span>
      </div>

      <section id="workflow" className={styles.workflowSection}>
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.sectionKicker}>발행 흐름</p>
            <h2>파일에서 현장까지,<br />한 화면 안에서.</h2>
          </div>
          <p>처음 쓰는 사람도 데이터 구조 확인, 주소 검수, 공개 범위 설정 순서로 바로 따라갈 수 있습니다.</p>
        </div>

        <ol className={styles.workflowList}>
          {WORKFLOW.map((step) => (
            <li key={step.number}>
              <span className={styles.stepNumber}>{step.number}</span>
              <div>
                <p>{step.meta}</p>
                <h3>{step.title}</h3>
                <span>{step.body}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className={styles.workflowLinks}>
          <Link href="/templates">업무별 템플릿 보기 <span>→</span></Link>
          <a href="/template.xlsx">엑셀 템플릿 받기 <span>↓</span></a>
        </div>
      </section>

      <section id="capabilities" className={styles.capabilitiesSection}>
        <div className={styles.capabilitiesIntro}>
          <p className={styles.sectionKicker}>정책 데이터를 다루는 기준</p>
          <h2>빠르게 만들고,<br />근거 있게 운영합니다.</h2>
          <p>지도 생성에서 끝나지 않도록 출처, 기준일, 검수 이력과 공개 범위를 함께 관리합니다.</p>
          <Link href="/guide">전체 사용법 보기 <span>→</span></Link>
        </div>

        <ol className={styles.capabilityList}>
          {CAPABILITIES.map((item) => (
            <li key={item.index}>
              <span className={styles.capabilityIndex}>{item.index}</span>
              <strong>{item.value}</strong>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p>READY TO MAP</p>
          <h2>주소 목록이 있다면,<br />첫 지도는 이미 절반쯤 완성됐습니다.</h2>
        </div>
        <div className={styles.finalActions}>
          <Link href="/upload">새 지도 만들기 <span>→</span></Link>
          <Link href="/guide">사용법 보기</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand}>GonpunClaw PolicyMap</Link>
        <p>공공 데이터를 설명 가능한 지도로.</p>
        <nav aria-label="하단 메뉴">
          <Link href="/templates">템플릿</Link>
          <Link href="/guide">가이드</Link>
          <Link href="/llms.txt">llms.txt</Link>
        </nav>
      </footer>
    </main>
  );
}
