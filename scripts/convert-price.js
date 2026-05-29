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
    const hiPlazaVal = String(row[2] || '').trim().toUpperCase();
    const dotcomVal = String(row[3] || '').trim();
    const isHiPlaza = hiPlazaVal === 'H';
    const isDotcom = dotcomVal === 'O' || dotcomVal === 'o' || dotcomVal === 'ㅇ';
    const careType = String(row[4] || '').trim();
    const careDetail = String(row[5] || '').trim();
    const visitCycle = String(row[6] || '').trim();
    const period = String(row[7] || '').trim();
    const combType = String(row[8] || '').trim();
    const smbDetail = String(row[9] || '').trim();   // J열: 소상공인구분

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
        prepay30_lump: null,
        prepay30_monthly: null,
        prepay50_lump: null,
        prepay50_monthly: null,
      };
    }

    const item = modelMap[key];
    const finalPrice = safeNum(row[15]);     // P열: 최종요금
    const activation = safeNum(row[14]);     // O열: 활성화

    if (combType === '결합없음') {
      if (activation) item.activation = activation;

      if (period === '36') item.price3y = finalPrice;
      else if (period === '48') item.price4y = finalPrice;
      else if (period === '60') item.price5y = finalPrice;
      else if (period === '72') {
        item.price6y = finalPrice;
        item.prepay30_lump = safeNum(row[16]);     // Q열: 선납30%금액
        item.prepay30_monthly = safeNum(row[17]);   // R열: 선납30%최종
        item.prepay50_lump = safeNum(row[18]);     // S열: 선납50%금액
        item.prepay50_monthly = safeNum(row[19]);   // T열: 선납50%최종
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
