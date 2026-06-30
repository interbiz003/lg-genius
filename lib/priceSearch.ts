import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════
interface PriceItem {
  modelFull: string;
  product: string;
  careType: string;
  careDetail: string;
  visitCycle: string;
  careCombined: string;
  isHiPlaza: boolean;
  isDotcom: boolean;
  activation: number | null;
  price3y: number | null;
  price4y: number | null;
  price5y: number | null;
  price6y: number | null;
  price6y_new: number | null;
  price6y_exist: number | null;
  price6y_smb1: number | null;
  price6y_smb2: number | null;
  price6y_smb4: number | null;
  prepayType: string | null;
  prepayMin: number | null;
  prepayMax: number | null;
}

interface ModelMatch {
  modelFull: string;
  product: string;
  careTypes: PriceItem[];
}

// ═══════════════════════════════════════
// 엑셀 데이터 로드 (서버 시작 시 1회 읽기, 캐싱)
// ═══════════════════════════════════════
let cachedData: PriceItem[] | null = null;
let priceDate: string = '';  // 가격표 기준일자

function loadPriceData(): PriceItem[] {
  if (cachedData) return cachedData;

  // convert-price.js가 생성한 price-data.json 읽기
  const jsonPath = path.join(process.cwd(), 'data', 'price-data.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('[가격표] price-data.json 파일을 찾을 수 없습니다');
    cachedData = [];
    return cachedData;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  priceDate = raw.priceDate || '';
  cachedData = raw.items || [];
  
  console.log(`[가격표] ${cachedData!.length}개 항목 로드 완료`);
  if (priceDate) console.log(`[기준일자] ${priceDate}`);
  
  return cachedData!;
}

// ═══════════════════════════════════════
// 모델명 정규화
// ═══════════════════════════════════════
function normalizeModel(input: string): string {
  return input.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9\-]/g, '');
}

function extractBaseModel(fullCode: string): string {
  let code = fullCode.toUpperCase().trim();
  const dotIndex = code.lastIndexOf('.');
  if (dotIndex > 0) code = code.substring(0, dotIndex);
  return code;
}

// ═══════════════════════════════════════
// 모델명으로 검색
// ═══════════════════════════════════════
export function searchPrice(query: string): ModelMatch | null {
  const data = loadPriceData();
  const queryNorm = normalizeModel(query);

  if (queryNorm.length < 3) return null;

  // 1단계: 정확한 전체 모델코드 매칭
  const exactMatches = data.filter(item => normalizeModel(item.modelFull) === queryNorm);
  if (exactMatches.length > 0) return groupByModel(exactMatches);

  // 2단계: 접미사 제거 후 매칭
  const baseMatches = data.filter(item => {
    const base = normalizeModel(extractBaseModel(item.modelFull));
    return base === queryNorm || base.includes(queryNorm) || queryNorm.includes(base);
  });
  if (baseMatches.length > 0) return groupByModel(baseMatches);

  // 3단계: 부분 매칭
  const partialMatches = data.filter(item => {
    const full = normalizeModel(item.modelFull);
    const base = normalizeModel(extractBaseModel(item.modelFull));
    return full.includes(queryNorm) || base.includes(queryNorm);
  });
  if (partialMatches.length > 0) {
    const models = Array.from(new Set(partialMatches.map(m => extractBaseModel(m.modelFull))));
    if (models.length <= 5) return groupByModel(partialMatches);
  }

  return null;
}

// ═══════════════════════════════════════
// 그룹핑
// ═══════════════════════════════════════
function groupByModel(items: PriceItem[]): ModelMatch {
  const first = items[0];
  const seen = new Set<string>();
  const uniqueItems: PriceItem[] = [];
  for (const item of items) {
    if (!seen.has(item.careCombined)) {
      seen.add(item.careCombined);
      uniqueItems.push(item);
    }
  }
  return { modelFull: first.modelFull, product: first.product, careTypes: uniqueItems };
}

// ═══════════════════════════════════════
// 모델 + 케어십 조회
// ═══════════════════════════════════════
export function getPriceByModelAndCare(query: string, careType: string): PriceItem | null {
  const data = loadPriceData();
  const queryNorm = normalizeModel(query);

  return data.find(item => {
    const full = normalizeModel(item.modelFull);
    const base = normalizeModel(extractBaseModel(item.modelFull));
    const modelMatch = full === queryNorm || base === queryNorm ||
                       full.includes(queryNorm) || base.includes(queryNorm);
    const careMatch = item.careType === careType || item.careCombined.includes(careType);
    return modelMatch && careMatch;
  }) || null;
}

// ═══════════════════════════════════════
// 가격 포맷팅
// ═══════════════════════════════════════
export function formatPrice(price: number | null): string {
  if (price === null || price === 0) return '-';
  return price.toLocaleString('ko-KR') + '원';
}

// ═══════════════════════════════════════
// 선납 후 월구독료 계산
// ═══════════════════════════════════════
function calcPrepayMonthly(monthlyPrice: number, prepayAmount: number, activation: number): number {
  const totalAmount = monthlyPrice * 72;
  const interestAdjusted = prepayAmount * 1.135;
  const remaining = totalAmount - interestAdjusted;
  const monthlyBase = Math.floor((remaining / 72) / 100) * 100;
  return Math.max(0, monthlyBase - activation);
}

export function formatPriceResponse(item: PriceItem): string {
  const lines: string[] = [];

  lines.push(`📦 ${item.product} | ${item.modelFull}`);
  if (item.isHiPlaza && item.isDotcom) {
    lines.push('🏪 하이프라자 | 닷컴 운영모델');
  } else if (item.isHiPlaza) {
    lines.push('🏪 하이프라자 운영모델');
  } else if (item.isDotcom) {
    lines.push('🌐 닷컴 운영모델');
  }
  lines.push(`🔧 케어십: ${item.careCombined}`);
  if (priceDate) {
    lines.push(`📅 ${priceDate} 기준`);
  }
  lines.push('');

  lines.push('💰 월 구독료 (기본요금)');
  if (item.price6y) lines.push(`  • 6년: ${formatPrice(item.price6y)}`);
  if (item.price5y) lines.push(`  • 5년: ${formatPrice(item.price5y)}`);
  if (item.price4y) lines.push(`  • 4년: ${formatPrice(item.price4y)}`);
  if (item.price3y) lines.push(`  • 3년: ${formatPrice(item.price3y)}`);

  if (item.activation) {
    lines.push('');
    lines.push(`⚡ 활성화 금액: ${formatPrice(item.activation)}`);
  }

  if (item.prepayType && item.price6y) {
    const types = item.prepayType.split(',').map(s => s.trim());
    const has30 = types.includes('30');
    const has50 = types.includes('50');
    const activation = item.activation ?? 0;

    lines.push('');
    lines.push('📋 선납 시 (6년 기준)');

    if (has30 && item.prepayMin) {
      const monthly30 = calcPrepayMonthly(item.price6y, item.prepayMin, activation);
      lines.push(`  • 30% 선납금: ${formatPrice(item.prepayMin)} / 월 ${formatPrice(monthly30)}`);
    }
    if (has50 && item.prepayMax) {
      const monthly50 = calcPrepayMonthly(item.price6y, item.prepayMax, activation);
      lines.push(`  • 50% 선납금: ${formatPrice(item.prepayMax)} / 월 ${formatPrice(monthly50)}`);
    }
    if (item.prepayMin && item.prepayMax) {
      lines.push(`  • 정액 선택: ${formatPrice(item.prepayMin)} ~ ${formatPrice(item.prepayMax)} (10만원 단위)`);
    } else if (item.prepayMin) {
      lines.push(`  • 정액 선택: ${formatPrice(item.prepayMin)} (10만원 단위 올림)`);
    }
  }

  if (item.price6y_new) {
    lines.push('');
    lines.push('🤝 결합할인 (6년 기준)');
    lines.push(`  • 신규결합: ${formatPrice(item.price6y_new)}`);
    if (item.price6y_exist) lines.push(`  • 기존결합: ${formatPrice(item.price6y_exist)}`);
    if (item.price6y_smb1) lines.push(`  • 소상공인 1대: ${formatPrice(item.price6y_smb1)}`);
    if (item.price6y_smb2) lines.push(`  • 소상공인 2대이상: ${formatPrice(item.price6y_smb2)}`);
    if (item.price6y_smb4) lines.push(`  • 소상공인 4대이상: ${formatPrice(item.price6y_smb4)}`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════
// 모델명 판별
// ═══════════════════════════════════════
export function looksLikeModelName(query: string): boolean {
  const cleaned = query.trim().toUpperCase();
  const alphanumeric = cleaned.replace(/[^A-Z0-9]/g, '');
  return alphanumeric.length >= 3 && /[A-Z]/.test(cleaned) && /[0-9]/.test(cleaned);
}
