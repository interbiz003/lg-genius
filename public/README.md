# public/

Next.js 정적 파일 폴더. 이 안의 파일은 도메인 루트로 바로 서빙됩니다.

    public/thumb-default.png  →  https://도메인/thumb-default.png

## 용도

`app/api/chatbot/route.ts`의 `DEFAULT_THUMBNAIL`이 여기 있는 이미지를 가리킵니다.
카드 URL이 이미지가 아닌 웹페이지 링크일 때(케어서비스, 서비스센터 등 24개 항목)
썸네일 자리에 대신 표시됩니다.

## 이미지 규격

- 카카오 basicCard 썸네일은 가로형으로 표시되므로 800×400(2:1) 권장
- png / jpg
- 교체 시 파일명을 유지하면 코드 수정 없이 반영됩니다
