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

for (const sheetName of sheets) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) continue;

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;

    const modelFull = String(row[1] || '').trim();
    if (!modelFull) continue;

    const product = String(row[0] || '').trim();
    const careType = String(row[2] || '').trim();
    const careDetail = String(row[3] || '').trim();
    const visitCycle = String(row[4] || '').trim();
    const period = String(row[5] || '').trim();
    const combType = String(row[6] || '').trim();

    // 결합없음만 기본으로 사용 (중복 방지)
    if (combType !== '결합없음') continue;

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
        activation: null,
        price3y: null,
        price4y: null,
        price5y: null,
        price6y: null,
        prepay30_lump: null,
        prepay30_monthly: null,
        prepay50_lump: null,
        prepay50_monthly: null,
      };
    }

    const item = modelMap[key];
    const finalPrice = safeNum(row[12]);     // M열: 최종요금 (기존 L→M)
    const activation = safeNum(row[11]);     // L열: 활성화 (기존 K→L)

    if (activation) item.activation = activation;

    if (period === '36') item.price3y = finalPrice;
    else if (period === '48') item.price4y = finalPrice;
    else if (period === '60') item.price5y = finalPrice;
    else if (period === '72') {
      item.price6y = finalPrice;
      item.prepay30_lump = safeNum(row[13]);     // N열 (기존 M→N)
      item.prepay30_monthly = safeNum(row[14]);   // O열 (기존 N→O)
      item.prepay50_lump = safeNum(row[15]);     // P열 (기존 O→P)
      item.prepay50_monthly = safeNum(row[16]);   // Q열 (기존 P→Q)
    }
  }
}

const allData = Object.values(modelMap);
const output = { priceDate, items: allData };
fs.writeFileSync(outputPath, JSON.stringify(output, null, 0), 'utf-8');
console.log(`[변환 완료] ${allData.length}개 항목 저장됨`);
