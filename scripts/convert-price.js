// scripts/convert-price.js
// Vercel 빌드 시 자동 실행: Master_YYYYMMDD.xlsx → price-data.json 변환
// 새 양식: 1행=1모델×1계약기간×1결합유형 (세로 펼침)

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const outputPath = path.join(dataDir, 'price-data.json');

// price_ 또는 Master_ 로 시작하는 xlsx 파일 자동 탐색
const files = fs.readdirSync(dataDir);
const priceFile = files.find(f => (f.startsWith('price_') || f.startsWith('Master_')) && f.endsWith('.xlsx'));

if (!priceFile) {
  console.error('[오류] price_*.xlsx 또는 Master_*.xlsx 파일을 찾을 수 없습니다');
  process.exit(1);
}

// 파일명에서 날짜 추출
const dateMatch = priceFile.match(/(\d{6,8})/);
let priceDate = '';
if (dateMatch) {
  const d = dateMatch[1];
  if (d.length === 8) {
    priceDate = `${d.substring(0,4)}년 ${d.substring(4,6)}월 ${d.substring(6,8)}일`;
  } else {
    priceDate = `20${d.substring(0,2)}년 ${d.substring(2,4)}월 ${d.substring(4,6)}일`;
  }
}

console.log(`[변환 시작] ${priceFile} → price-data.json`);
if (priceDate) console.log(`[기준일자] ${priceDate}`);

const inputPath = path.join(dataDir, priceFile);
const workbook = XLSX.readFile(inputPath);

// 모델별로 데이터 집계
const modelMap = {};

const sheets = ['전자랜드', '홈플러스', '이마트'];

const safeNum = (val) => {
  if (val === null || val === undefined || val === '' || val === 0) return null;
  const n = Number(val);
  return isNaN(n) ? null : Math.round(n);
};

// 헤더 이름 → 열 인덱스 매핑 (공백/줄바꿈 무시)
// 컬럼 순서가 바뀌어도(예: 새 컬럼 삽입) 헤더 이름으로 찾기 때문에 깨지지 않음
const normHeader = (s) => String(s || '').replace(/\s+/g, '').trim();

function buildColumnMap(headerRow, sheetName) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const key = normHeader(h);
    if (key && !(key in map)) map[key] = idx;
  });

  const required = [
    '제품군', '모델명', 'H', 'O', '케어십형태', '케어십구분', '방문주기',
    '계약기간', '결합유형', '소상공인구분', '활성화', '최종요금',
    '선납가능정률', '선납정액최소금액', '선납정액최대금액',
  ];
  const missing = required.filter(k => !(k in map));
  if (missing.length > 0) {
    console.error(`[오류] ${sheetName} 시트에서 다음 컬럼을 찾을 수 없습니다: ${missing.join(', ')} — 원본 엑셀의 헤더명이 바뀌었는지 확인하세요.`);
  }
  return map;
}

for (const sheetName of sheets) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) continue;

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length === 0) continue;

  const col = buildColumnMap(rows[0], sheetName);
  const get = (row, headerName) => {
    const idx = col[headerName];
    return idx === undefined ? null : row[idx];
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !get(row, '모델명')) continue;

    const modelFull = String(get(row, '모델명') || '').trim();
    if (!modelFull) continue;

    const product = String(get(row, '제품군') || '').trim();
    const hiPlazaVal = String(get(row, 'H') || '').trim().toUpperCase();
    const dotcomVal = String(get(row, 'O') || '').trim();
    const isHiPlaza = hiPlazaVal === 'H';
    const isDotcom = dotcomVal === 'O' || dotcomVal === 'o' || dotcomVal === 'ㅇ';
    const careType = String(get(row, '케어십형태') || '').trim();
    const careDetail = String(get(row, '케어십구분') || '').trim();
    const visitCycle = String(get(row, '방문주기') || '').trim();
    const period = String(get(row, '계약기간') || '').trim();
    const combType = String(get(row, '결합유형') || '').trim();
    const smbDetail = String(get(row, '소상공인구분') || '').trim();

    const careCombined = [careType, careDetail, visitCycle].filter(v => v).join(' > ');
    const key = `${modelFull}|${careCombined}`;

    if (!modelMap[key]) {
      modelMap[key] = {
        modelFull,
        product,
        careType,
        careDetail,
        visitCycle,
        careCombined,
        isHiPlaza,
        isDotcom,
        activation: null,
        price3y: null,
        price4y: null,
        price5y: null,
        price6y: null,
        price6y_new: null,
        price6y_exist: null,
        price6y_smb1: null,
        price6y_smb2: null,
        price6y_smb4: null,
        prepayType: null,
        prepayMin: null,
        prepayMax: null,
      };
    }

    const item = modelMap[key];
    const finalPrice = safeNum(get(row, '최종요금'));
    const activation = safeNum(get(row, '활성화'));

    if (combType === '결합없음') {
      if (activation) item.activation = activation;

      if (period === '36') item.price3y = finalPrice;
      else if (period === '48') item.price4y = finalPrice;
      else if (period === '60') item.price5y = finalPrice;
      else if (period === '72') {
        item.price6y = finalPrice;
        // 선납 가능 정률 — '30,50' 같은 텍스트가 숫자로 변환되지 않도록 안전하게 문자열 강제
        const prepayTypeRaw = get(row, '선납가능정률');
        item.prepayType = prepayTypeRaw !== null && prepayTypeRaw !== undefined
          ? String(prepayTypeRaw).trim()
          : null;
        item.prepayMin = safeNum(get(row, '선납정액최소금액'));
        item.prepayMax = safeNum(get(row, '선납정액최대금액'));
      }
    } else if (period === '72') {
      if (combType === '신규결합') item.price6y_new = finalPrice;
      else if (combType === '기존결합') item.price6y_exist = finalPrice;
      else if (combType === '소상공인') {
        if (smbDetail === '1대') item.price6y_smb1 = finalPrice;
        else if (smbDetail === '2대이상') item.price6y_smb2 = finalPrice;
        else if (smbDetail === '4대이상') item.price6y_smb4 = finalPrice;
      }
    }
  }
}

const allData = Object.values(modelMap);
const output = { priceDate, items: allData };
fs.writeFileSync(outputPath, JSON.stringify(output, null, 0), 'utf-8');
console.log(`[변환 완료] ${allData.length}개 항목 저장됨`);

// 디버그: prepayType이 있는 처음 5개 샘플 출력
const prepayTypeSamples = allData
  .filter(it => it.prepayType !== null && it.prepayType !== '')
  .slice(0, 5)
  .map(it => ({ model: it.modelFull, prepayType: it.prepayType, prepayMin: it.prepayMin, prepayMax: it.prepayMax }));
console.log('[디버그] 첫 5개 prepayType 샘플:', prepayTypeSamples);
