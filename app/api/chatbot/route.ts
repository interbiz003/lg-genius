import { NextRequest, NextResponse } from 'next/server';
import { searchFaq, findByQuestion, findMenuByKeyword, FaqItem } from '../../../lib/search';
import { searchPrice, formatPriceResponse, looksLikeModelName } from '../../../lib/priceSearch';

// ═══════════════════════════════════════
// 응답 생성 (faq.json quickButtons 기반)
// ═══════════════════════════════════════
function makeResponse(item: FaqItem) {
  const quickReplies = (item.quickButtons || []).map(btn => ({
    messageText: btn.text,
    action: 'message' as const,
    label: btn.label.length > 14 ? btn.label.substring(0, 14) + '..' : btn.label,
  }));

  const hasUrl1 = item.url && item.url.trim() !== '';
  const hasUrl2 = item.url2 && item.url2.trim() !== '';

  // URL 1개 이상 → BasicCard (thumbnail + 링크 버튼 1~2개)
  if (hasUrl1) {
    const truncateLabel = (s: string) => s.length > 14 ? s.substring(0, 13) + '..' : s;
    const description = item.answer.length > 230 ? item.answer.substring(0, 227) + '...' : item.answer;
    const buttons = [
      { label: truncateLabel(item.urlButton || '상세보기'), action: 'webLink', webLinkUrl: item.url },
    ];
    if (hasUrl2) {
      buttons.push({ label: truncateLabel(item.url2ButtonName || '상세보기'), action: 'webLink', webLinkUrl: item.url2 });
    }
    return {
      version: '2.0',
      template: {
        outputs: [{
          basicCard: {
            thumbnail: { imageUrl: item.url },
            description,
            buttons,
          },
        }],
        ...(quickReplies.length > 0 ? { quickReplies } : {}),
      },
    };
  }

  // URL 없음 → 기존 simpleText 방식
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: item.answer } }],
      ...(quickReplies.length > 0 ? { quickReplies } : {}),
    },
  };
}

function makeTextResponse(text: string, quickReplies: any[] = []) {
  const response: any = {
    version: '2.0',
    template: { outputs: [{ simpleText: { text } }] },
  };
  if (quickReplies.length > 0) response.template.quickReplies = quickReplies;
  return response;
}

// ═══════════════════════════════════════
// 가격 단계별 조회
// ═══════════════════════════════════════
function priceStepResponse(utterance: string) {
  const parts = utterance.split('::');
  const modelQuery = parts[0].trim();
  const gFilter = parts[1]?.trim() || null;
  const hFilter = parts[2]?.trim() || null;
  const iFilter = parts[3]?.trim() || null;

  const result = searchPrice(modelQuery);
  if (!result) return null;

  let items = result.careTypes;
  if (gFilter) items = items.filter(i => i.careType === gFilter);
  if (hFilter) items = items.filter(i => i.careDetail === hFilter);
  if (iFilter) items = items.filter(i => i.visitCycle === iFilter);
  if (items.length === 0) return null;

  if (items.length === 1) {
    return makeTextResponse(formatPriceResponse(items[0]), [
      { messageText: '메인메뉴', action: 'message', label: '🏠 처음으로' },
      { messageText: '구독 가격 조회', action: 'message', label: '💰 다른 모델 조회' },
    ]);
  }

  if (!gFilter) {
    const gTypes = Array.from(new Set(items.map(i => i.careType).filter(v => v)));
    if (gTypes.length === 1) return priceStepResponse(`${modelQuery}::${gTypes[0]}`);
    const qr = gTypes.slice(0, 10).map(g => ({ messageText: `${modelQuery}::${g}`, action: 'message' as const, label: g }));
    qr.push({ messageText: '메인메뉴', action: 'message' as const, label: '🏠 처음으로' });
    return makeTextResponse(`📦 ${result.product} | ${result.modelFull}\n\n케어십 유형을 선택해주세요!`, qr);
  }
  if (!hFilter) {
    const hTypes = Array.from(new Set(items.map(i => i.careDetail).filter(v => v)));
    if (hTypes.length <= 1) return priceStepResponse(`${modelQuery}::${gFilter}::${hTypes[0] || ''}`);
    const qr = hTypes.slice(0, 10).map(h => ({ messageText: `${modelQuery}::${gFilter}::${h}`, action: 'message' as const, label: h }));
    qr.push({ messageText: '메인메뉴', action: 'message' as const, label: '🏠 처음으로' });
    return makeTextResponse(`📦 ${result.product} | ${result.modelFull}\n🔧 케어십: ${gFilter}\n\n세부 유형을 선택해주세요!`, qr);
  }
  if (!iFilter) {
    const iTypes = Array.from(new Set(items.map(i => i.visitCycle).filter(v => v)));
    if (iTypes.length <= 1) {
      return makeTextResponse(formatPriceResponse(items[0]), [
        { messageText: '메인메뉴', action: 'message', label: '🏠 처음으로' },
        { messageText: '구독 가격 조회', action: 'message', label: '💰 다른 모델 조회' },
      ]);
    }
    const qr = iTypes.slice(0, 10).map(iv => ({ messageText: `${modelQuery}::${gFilter}::${hFilter}::${iv}`, action: 'message' as const, label: iv }));
    qr.push({ messageText: '메인메뉴', action: 'message' as const, label: '🏠 처음으로' });
    return makeTextResponse(`📦 ${result.product} | ${result.modelFull}\n🔧 케어십: ${gFilter} > ${hFilter}\n\n방문주기를 선택해주세요!`, qr);
  }

  return makeTextResponse(formatPriceResponse(items[0]), [
    { messageText: '메인메뉴', action: 'message', label: '🏠 처음으로' },
    { messageText: '구독 가격 조회', action: 'message', label: '💰 다른 모델 조회' },
  ]);
}

// ═══════════════════════════════════════
// FAQ 검색 결과 응답
// ═══════════════════════════════════════
function searchResultResponse(query: string) {
  const results = searchFaq(query);

  if (results.length === 0) {
    return makeTextResponse(
      `😅 입력하신 내용에 대한 답변을 찾지 못했어요.\n\n💡 이렇게 질문해보세요!\n• 키워드로 검색: "해약금", "미납", "결합할인"\n• 카드사 혜택: "롯데카드 혜택", "신한카드 실적"\n• 구독료 조회: 모델명 입력 (예: A720WA)\n\n아래 버튼을 눌러보셔도 좋아요!`,
      [
        { messageText: '웹사이트 주소', action: 'message', label: '🌐 웹사이트' },
        { messageText: '카드사별 자세히', action: 'message', label: '💳 제휴카드' },
        { messageText: 'LG 고객센터', action: 'message', label: '📞 고객센터' },
        { messageText: '메인메뉴', action: 'message', label: '🏠 처음으로' },
      ]
    );
  }

  const best = results[0];

  if (best.score >= 30) {
    return makeResponse(best.item);
  }

  if (results.length >= 2) {
    const scoreRatio = results[1].score / best.score;
    if (scoreRatio >= 0.7) {
      const threshold = best.score * 0.6;
      const candidates = results.filter(r => r.score >= threshold).slice(0, 5);
      if (candidates.length >= 2) {
        const quickReplies = candidates.map(c => ({
          messageText: c.item.question,
          action: 'message' as const,
          label: c.item.question.length > 14 ? c.item.question.substring(0, 14) + '..' : c.item.question,
        }));
        quickReplies.push({ messageText: '메인메뉴', action: 'message' as const, label: '🏠 처음으로' });
        return makeTextResponse(`🔍 "${query}" 관련 항목이 여러 개 있어요.\n어떤 내용이 궁금하세요?`, quickReplies);
      }
    }
  }

  return makeResponse(best.item);
}

// ═══════════════════════════════════════
// POST 핸들러
// ═══════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const utterance = body?.userRequest?.utterance?.trim() || '';
    if (!utterance) {
      const main = findByQuestion('메인메뉴');
      return NextResponse.json(main ? makeResponse(main) : makeTextResponse('안녕하세요!'));
    }

    // 1. question 정확 일치 (버튼 클릭)
    const exactMatch = findByQuestion(utterance);
    if (exactMatch) {
      return NextResponse.json(makeResponse(exactMatch));
    }

    // 2. 메인메뉴 키워드
    const menuKeywords = ['처음으로', '홈', '시작', '도움말'];
    if (menuKeywords.includes(utterance)) {
      const main = findByQuestion('메인메뉴');
      return NextResponse.json(main ? makeResponse(main) : makeTextResponse('안녕하세요!'));
    }

    // 3. 메뉴 키워드 매칭 (카드사, 카테고리 등)
    const menuMatch = findMenuByKeyword(utterance);
    if (menuMatch) {
      return NextResponse.json(makeResponse(menuMatch));
    }

    // 4. 가격 단계별 조회
    if (utterance.includes('::')) {
      const stepResult = priceStepResponse(utterance);
      if (stepResult) return NextResponse.json(stepResult);
    }

    // 5. 모델명 → 가격 조회
    if (looksLikeModelName(utterance)) {
      const stepResult = priceStepResponse(utterance);
      if (stepResult) return NextResponse.json(stepResult);
    }

    // 6. FAQ 키워드 검색
    return NextResponse.json(searchResultResponse(utterance));

  } catch (error) {
    console.error('Chatbot API error:', error);
    return NextResponse.json(
      makeTextResponse('죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        [{ messageText: '메인메뉴', action: 'message', label: '🏠 처음으로' }])
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'LG 구독 챗봇 API v8', timestamp: new Date().toISOString() });
}
