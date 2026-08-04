import Link from "next/link";
import styles from "./home.module.css";

const WORKFLOW = [
  {
    number: "01",
    title: "데이터 준비",
    body: "지자체별 제출 파일을 하나로 합친 XLSX를 올리고 지자체·사업명·집행률 열을 연결합니다.",
    meta: "분기·월말 취합본",
  },
  {
    number: "02",
    title: "지도 검토",
    body: "저집행 사업, 주소 누락, 사업 구분 오류를 한 번에 보고 보완이 필요한 행만 따로 확인합니다.",
    meta: "집행률과 주소 품질 확인",
  },
  {
    number: "03",
    title: "운영 관리",
    body: "출처·기준일·업데이트 주기를 붙여 내부 링크를 갱신하고, 외부 공개용 정제본과 분리합니다.",
    meta: "버전과 공개 범위 관리",
  },
];

const CAPABILITIES = [
  {
    index: "A",
    value: "집행률",
    title: "낮은 집행률부터 보는 화면",
    body: "사업별 집행률을 대표값으로 연결해 지도, 표, 필터에서 같은 기준으로 정렬하고 비교합니다.",
  },
  {
    index: "B",
    value: "검수",
    title: "취합본 오류를 놓치지 않게",
    body: "주소 실패, 빈 행, 중복 의심, 민감 컬럼을 업로드 전에 분리해 지자체 재확인 목록으로 남깁니다.",
  },
  {
    index: "C",
    value: "내부용",
    title: "실무본과 공개본을 분리",
    body: "팀장·과 내부 검토용 관리 링크와 국민 공개용 링크를 따로 운영해 정제 전 자료가 섞이지 않게 합니다.",
  },
];

const PIPELINE = [
  ["01", "취합본 업로드"],
  ["02", "열 매핑"],
  ["03", "집행률 검수"],
  ["04", "내부 링크 갱신"],
];

const HERO_METRICS = [
  ["취합 지자체", "72", "곳"],
  ["집행률 50% 미만", "18", "사업"],
  ["주소 검수 필요", "9", "건"],
];

function PolicyMapPreview() {
  return (
    <div className={styles.mapStage}>
      <input
        className={`${styles.modeInput} ${styles.modeExecution}`}
        type="radio"
        name="fund-map-mode"
        id="fund-map-execution"
        defaultChecked
      />
      <input
        className={`${styles.modeInput} ${styles.modeAddress}`}
        type="radio"
        name="fund-map-mode"
        id="fund-map-address"
      />
      <input
        className={`${styles.modeInput} ${styles.modeVersion}`}
        type="radio"
        name="fund-map-mode"
        id="fund-map-version"
      />
      <div className={styles.mapTopbar}>
        <div>
          <span className={styles.mapOverline}>INTERNAL FUND BOARD</span>
          <strong>2026. 3월말 지방소멸대응기금</strong>
        </div>
        <span className={styles.liveStatus}><i /> 내부 검토중</span>
      </div>

      <div className={styles.mapModes} role="radiogroup" aria-label="지도 보기 전환">
        <label className={`${styles.modeLabel} ${styles.modeLabelExecution}`} htmlFor="fund-map-execution">
          <span>집행률</span>
          <strong>50% 미만 우선</strong>
        </label>
        <label className={`${styles.modeLabel} ${styles.modeLabelAddress}`} htmlFor="fund-map-address">
          <span>주소 검수</span>
          <strong>좌표 보완</strong>
        </label>
        <label className={`${styles.modeLabel} ${styles.modeLabelVersion}`} htmlFor="fund-map-version">
          <span>업데이트</span>
          <strong>기준일 비교</strong>
        </label>
      </div>

      <div className={styles.mapShell}>
        <div className={styles.mapCanvas}>
          <svg className={styles.mapSvg} viewBox="0 0 720 540" role="img" aria-label="지방소멸대응기금 사업 집행률과 검수 상태를 나타내는 예시 지도">
            <defs>
              <linearGradient id="terrain" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#426d58" />
                <stop offset="1" stopColor="#1d3c31" />
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
            <circle className={`${styles.routePoint} ${styles.pointExecution}`} cx="214" cy="353" r="7" />
            <circle className={`${styles.routePoint} ${styles.pointAddress}`} cx="389" cy="204" r="7" />
            <circle className={`${styles.routePoint} ${styles.pointVersion}`} cx="524" cy="308" r="7" />
            <circle className={styles.pinHalo} cx="389" cy="204" r="24" />
            <circle className={styles.pin} cx="389" cy="204" r="10" filter="url(#softGlow)" />
            <circle className={styles.pinSmall} cx="266" cy="130" r="8" />
            <circle className={styles.pinSmall} cx="482" cy="379" r="8" />
            <circle className={styles.pinWarm} cx="214" cy="353" r="9" />
          </svg>

          <div className={`${styles.mapLabel} ${styles.labelSeoul} ${styles.layerExecution}`}>
            <span>전북 남원 · 집행률</span><strong>42%</strong>
          </div>
          <div className={`${styles.mapLabel} ${styles.labelSejong} ${styles.layerAddress}`}>
            <span>경북 의성 · 보완</span><strong>주소 4건</strong>
          </div>
          <div className={`${styles.mapLabel} ${styles.labelBusan} ${styles.layerVersion}`}>
            <span>전남 신안 · 기준일</span><strong>2026.03</strong>
          </div>

          <div className={styles.mapSummary}>
            <span>평균 집행률</span>
            <strong>64.2</strong>
            <small>%</small>
          </div>
        </div>

        <aside className={styles.mapInspector} aria-label="선택한 지도 보기 설명">
          <div className={`${styles.inspectorPanel} ${styles.panelExecution}`}>
            <p>집행률 보기</p>
            <h2>저집행 사업 18건을 먼저 봅니다.</h2>
            <span>집행률 50% 미만 사업을 지도에서 강조하고, 같은 조건이 하단 표와 필터에도 이어집니다.</span>
          </div>
          <div className={`${styles.inspectorPanel} ${styles.panelAddress}`}>
            <p>주소 검수 보기</p>
            <h2>좌표 보완 9건을 분리합니다.</h2>
            <span>주소 누락, 도로명 불일치, 지번만 있는 행을 지자체 재확인 목록으로 따로 확인합니다.</span>
          </div>
          <div className={`${styles.inspectorPanel} ${styles.panelVersion}`}>
            <p>업데이트 보기</p>
            <h2>3월말 취합본 v4 기준입니다.</h2>
            <span>다음 분기 파일을 올리면 기준일과 변경 사업 수를 함께 남겨 내부 보고 이력을 유지합니다.</span>
          </div>
          <Link href="/upload" className={styles.inspectorAction}>엑셀 취합본으로 갱신 <span>→</span></Link>
        </aside>
      </div>

      <div className={styles.previewLedger}>
        <div className={styles.previewRow}>
          <span>현재 선택</span>
          <strong>지도 모드를 눌러 집행률·주소·업데이트 관점을 전환</strong>
          <i>interactive</i>
        </div>
      </div>

      <div className={styles.mapFooter}>
        <span>출처 · 지자체 제출 취합본</span>
        <span>기준일 · 2026. 03. 31</span>
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
            <a href="#capabilities">검토 기준</a>
            <Link href="/templates">템플릿</Link>
            <Link href="/guide">가이드</Link>
          </nav>
          <Link href="/upload" className={styles.headerCta}>취합본 업로드 <span>↗</span></Link>
        </header>

        <div className={styles.heroInner}>
          <div className={styles.heroVisual}>
            <PolicyMapPreview />
          </div>

          <div className={styles.heroCopy}>
            <p className={styles.productName}>지방소멸대응기금 <span>내부 실무용</span></p>
            <p className={styles.eyebrow}>업무 흐름 그대로</p>
            <h1>엑셀 취합본으로<br />집행률과 현장을<br /><em>같이 봅니다.</em></h1>
            <p className={styles.lede}>
              담당자가 합친 한 파일을 올리면 사업 위치, 집행률, 검수 필요 항목이 같은 화면에서 갱신됩니다.
            </p>
            <div className={styles.heroActions}>
              <Link href="/upload" className={styles.primaryAction}>취합본 업로드 <span>→</span></Link>
              <Link href="/demo" className={styles.secondaryAction}>실무 보드 미리보기 <span>↗</span></Link>
            </div>
            <dl className={styles.heroStats} aria-label="현재 업무 지표 예시">
              {HERO_METRICS.map(([label, value, unit]) => (
                <div className={styles.heroStat} key={label}>
                  <dt>{label}</dt>
                  <dd><strong>{value}</strong><span>{unit}</span></dd>
                </div>
              ))}
            </dl>
            <p className={styles.microcopy}>XLSX·CSV 지원 <i /> 기준일 기록 <i /> 내부 관리 링크 분리</p>
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
        <span>지방소멸대응기금</span><i />
        <span>집행률 점검</span><i />
        <span>지자체 제출자료</span><i />
        <span>현장 주소 검수</span><i />
        <span>내부 보고</span>
      </div>

      <section id="workflow" className={styles.workflowSection}>
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.sectionKicker}>발행 흐름</p>
            <h2>취합부터 보고까지,<br />반복 업무에 맞춰.</h2>
          </div>
          <p>지자체별 양식 차이가 있어도 한 파일로 합친 뒤 열 연결, 오류 확인, 내부 공유 순서로 처리합니다.</p>
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
          <p className={styles.sectionKicker}>실무 검토 기준</p>
          <h2>숫자는 빠르게,<br />공개는 신중하게.</h2>
          <p>집행률 모니터링은 내부 의사결정용으로 촘촘하게 보고, 대외 공개 전에는 별도 정제 단계를 둡니다.</p>
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
          <p>NEXT UPDATE</p>
          <h2>다음 취합본도<br />같은 방식으로 갱신합니다.</h2>
        </div>
        <div className={styles.finalActions}>
          <Link href="/upload">새 취합본 올리기 <span>→</span></Link>
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
