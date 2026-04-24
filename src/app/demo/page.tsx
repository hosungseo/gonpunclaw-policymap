import type { Metadata } from "next";
import { MapClient } from "../m/[slug]/MapClient";
import type { MarkerData } from "@/components/map/MarkerLayer";

export const metadata: Metadata = {
  title: "샘플 정책지도 · GonpunClaw PolicyMap",
  description: "업로드 없이 공개 정책지도 화면을 확인할 수 있는 샘플 데이터입니다.",
};

const SAMPLE_MARKERS: MarkerData[] = [
  {
    id: "demo-seocho-welfare",
    lat: 37.483712,
    lng: 127.032411,
    name: "서초복지관",
    value: 48,
    category: "복지",
    address_normalized: "서울특별시 서초구 강남대로 201",
    extra: { 담당: "지역복지팀", 상태: "운영 중" },
  },
  {
    id: "demo-haeundae-center",
    lat: 35.168755,
    lng: 129.136174,
    name: "해운대센터",
    value: 36,
    category: "청년",
    address_normalized: "부산광역시 해운대구 센텀중앙로 79",
    extra: { 담당: "청년지원팀", 상태: "운영 중" },
  },
  {
    id: "demo-sejong-office",
    lat: 36.504073,
    lng: 127.265363,
    name: "세종정책지원실",
    value: 72,
    category: "행정",
    address_normalized: "세종특별자치시 도움6로 11",
    extra: { 담당: "정책총괄", 상태: "검토" },
  },
  {
    id: "demo-gwangju-field",
    lat: 35.160032,
    lng: 126.851338,
    name: "광주현장지원소",
    value: 22,
    category: "점검",
    address_normalized: "광주광역시 서구 내방로 111",
    extra: { 담당: "현장점검반", 상태: "점검 예정" },
  },
  {
    id: "demo-daegu-hub",
    lat: 35.871435,
    lng: 128.601445,
    name: "대구상담허브",
    value: 31,
    category: "복지",
    address_normalized: "대구광역시 중구 공평로 88",
    extra: { 담당: "상담지원팀", 상태: "운영 중" },
  },
];

export default function DemoPage() {
  return (
    <MapClient
      slug="demo"
      title="샘플 정책지도"
      description="검색, 분류 필터, 값 범위, 표 보기를 먼저 확인할 수 있습니다."
      valueLabel="대상 수"
      valueUnit="건"
      categoryLabel="분류"
      markers={SAMPLE_MARKERS}
      isDemo
    />
  );
}
