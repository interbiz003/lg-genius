import rawFaqData from '../data/faq.json';

interface QuickButton {
  label: string;
  text: string;
}

export interface FaqItem {
  type: string;
  category: string;
  question: string;
  keywords: string[];
  answer: string;
  url: string;
  urlButton: string;
  url2: string;
  url2ButtonName: string;
  quickButtons?: QuickButton[];
}

// faq.json → FaqItem 변환 (followButtons → quickButtons)
const faqData: FaqItem[] = (rawFaqData as any[]).map(item => {
  const quickButtons: QuickButton[] = (item.followButtons || []).map((btn: string) => ({
    label: btn,
    text: btn,
  }));

  // 처음으로 버튼 자동 추가
  if (item.type === 'faq' && quickButtons.length > 0) {
    quickButtons.push({ label: '🏠 처음으로', text: '메인메뉴' });
  }

  return {
    ...item,
    url: item.url || '',
    urlButton: item.urlButtonName || item.urlButton || '',
    url2: item.url2 || '',
    url2ButtonName: item.url2ButtonName || '',
    quickButtons: quickButtons.length > 0 ? quickButtons : undefined,
  };
});

interface SearchResult {
  item: FaqItem;
  score: number;
}

// ═══════════════════════════════════════
// 유사어 사전 (엑셀 유사어 + 기존)
// ═══════════════════════════════════════
const synonymMap: Record<string, string> = {
  // 엑셀 유사어
  '할인카드': '제휴카드',
  '묶음할인': '결합', '다중할인': '결합', '2대할인': '결합', '두대할인': '결합',
  '두 대': '결합', '두대': '결합', '여러대': '결합',
  '케어쉽': '케어십', '케어쉽 가입': '케어십 가입', '케어쉽 해피콜': '케어십 가입',
  '선불': '선납', '미리납부': '선납',
  '연체': '미납', '밀림': '미납', '밀린요금': '미납', '미납금': '미납',
  '체납': '미납', '안냄': '미납', '밀린': '미납', '안냈': '미납', '못냈': '미납',
  '할인카드 등록': '제휴카드 등록', '할인카드 결제': '제휴카드 등록',
  '자가케어': '방문관리', '방문케어': '방문관리', '자관': '방문관리', '방관': '방문관리',
  '셀프관리': '방문관리',
  '완납': '일시불', '한번에': '일시불', '한번에 내': '일시불', '한꺼번에': '일시불',
  '바꾸고 싶': '변경', '바꿀 수': '변경',
  '취소': '해지', '구독취소': '해지', '그만': '해지', '안할래': '해지',
  '핏엔맥스': '핏앤맥스', '핏엔맥': '핏앤맥스',
  '김냉': '김치냉장고',
  '에어콘': '에어컨', '냉방기': '에어컨',
  '정수': '정수기',
  '공청': '공기청정기',
  '식세': '식기세척기',
  '콜센터': '고객센터', '상담원': '고객센터', '상담사연결': '고객센터',
  '월구독료': '구독료',
  // 추가 유사어 (기존 코드 기반)
  '취소금': '해약금', '취소비용': '해약금', '패널티': '해약금', '해약비': '해약금',
  '중도해지금': '해약금', '돈 내야': '해약금', '얼마나 내야': '해약금',
  '이름변경': '명의변경', '명의이전': '명의변경', '명의이관': '명의변경',
  '넘길 수': '명의변경', '넘기고 싶': '명의변경',
  '카변': '결제변경', '결제수단변경': '결제변경', '결제방법': '결제변경',
  '카드 바꾸': '결제변경', '카드 변경': '결제변경',
  '월요금': '요금', '월납': '요금', '납부금': '요금',
  'KB카드': '국민카드',
  '실적빠지는': '실적제외', '제외항목': '실적제외', '빠지는거': '실적제외',
  '실적조회': '실적확인',
  '관리서비스': '케어서비스', '방문서비스': '케어서비스',
  '필터교체': '소모품', '교체주기': '소모품',
  '배달': '배송', '언제오나': '배송', '언제와': '배송',
  '냉장': '냉장고',
  '혜액': '혜택',
};

function applySynonyms(query: string): string {
  let result = query;
  const sortedKeys = Object.keys(synonymMap).sort((a, b) => b.length - a.length);
  for (const synonym of sortedKeys) {
    if (result.includes(synonym)) {
      result = result.replace(synonym, synonymMap[synonym]);
    }
  }
  return result;
}

// ── question 정확히 일치 ──
export function findByQuestion(question: string): FaqItem | null {
  const data = faqData as FaqItem[];
  return data.find(item => item.question === question) || null;
}

// ── 키워드로 메뉴 항목 찾기 ──
export function findMenuByKeyword(query: string): FaqItem | null {
  const data = faqData as FaqItem[];
  const queryLower = applySynonyms(query.toLowerCase().trim());

  for (const item of data) {
    if (item.type !== 'menu') continue;
    for (const keyword of item.keywords) {
      if (queryLower === keyword.toLowerCase()) {
        return item;
      }
    }
  }
  return null;
}

// ── 한국어 조사/어미 제거 ──
function removeParticles(text: string): string[] {
  const particles = /(?:을|를|이|가|은|는|도|에서|에|의|로|으로|하고|싶은데|싶어요|싶어|되면|되나요|인가요|인데|할때|해야|어떻게|알려줘|보고싶|해줘|좀|나요|까요|때|해요|할까요|한가요|하려고|하려면|요)$/;
  const words = text.split(/\s+/).filter(w => w.length >= 1);
  const cleaned: string[] = [];
  for (const word of words) {
    let w = word;
    for (let i = 0; i < 3; i++) {
      const prev = w;
      w = w.replace(particles, '');
      if (w === prev) break;
    }
    if (w.length >= 1) cleaned.push(w);
  }
  return cleaned;
}

// ── FAQ 키워드 검색 ──
export function searchFaq(query: string): SearchResult[] {
  const data = faqData as FaqItem[];
  const queryLower = query.toLowerCase().trim();
  const queryConverted = applySynonyms(queryLower);
  const queryWords = removeParticles(queryConverted);

  const results: SearchResult[] = [];

  for (const item of data) {
    if (item.type === 'menu') continue;

    let score = 0;
    let matchedCount = 0;

    if (queryConverted === item.question.toLowerCase()) {
      score += 100;
    }

    // 쿼리를 단어로 분리 (조사 제거된 queryWords 사용)
    const matchedWords = new Set<string>();

    for (const keyword of item.keywords) {
      const kwLower = keyword.toLowerCase();
      const kwNoSpace = kwLower.replace(/\s+/g, '');  // 공백 제거 버전

      if (queryConverted === kwLower || queryConverted === kwNoSpace) {
        score += 20;
        matchedCount++;
      } else if ((queryConverted.includes(kwLower) || queryConverted.includes(kwNoSpace)) && kwLower.length >= 2) {
        score += 10 + kwLower.length;
        matchedCount++;
      } else if ((kwLower.includes(queryConverted) || kwNoSpace.includes(queryConverted)) && queryConverted.length >= 2) {
        score += 5;
        matchedCount++;
      } else {
        // 단어 단위 매칭 (같은 단어는 1회만 카운트)
        for (const word of queryWords) {
          if (matchedWords.has(word)) continue;
          if (word === kwLower || (word.length >= 2 && kwLower.includes(word)) || (kwLower.length >= 2 && word.includes(kwLower))) {
            score += word.length <= 2 ? 3 : 8;
            matchedCount++;
            matchedWords.add(word);
            break;
          }
        }
      }
    }

    if (matchedCount >= 2) {
      score += matchedCount * 5;
    }

    const questionLower = item.question.toLowerCase();
    if (queryConverted !== questionLower) {
      if (queryConverted.includes(questionLower)) {
        score += 8;
      } else if (questionLower.includes(queryConverted) && queryConverted.length >= 2) {
        score += 5;
      }
    }

    if (score > 0) results.push({ item, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}
