import WorkspaceHeader from "@/components/WorkspaceHeader";
import Link from "next/link";

export default function Guide() {
  return <><WorkspaceHeader /><main id="main-content" className="workflow-main service-guide">
    <div className="screen-heading"><h1>이용 방법과 자료 처리 안내</h1><p>과제 자료를 넣기 전에 저장 위치와 AI 전송 범위를 확인하세요.</p></div>
    <section><h2>처음 사용한다면</h2><ol><li>교사용은 학생에게 줄 과제를 점검하고 수정합니다. 학생용은 받은 과제의 수행 순서를 확인합니다. 두 화면은 기능 선택이며 로그인이나 접근 권한 구분이 아닙니다.</li><li>PDF, PNG, JPG 파일과 추가 설명을 입력하세요. 파일만 입력해도 됩니다.</li><li>화살표 순서도의 단계를 누르면 상세 내용을 확인합니다. 펼침 항목은 눌러 열거나 닫습니다.</li><li>AI가 놓치거나 잘못 읽은 내용은 원본과 비교하세요. 안전 수칙과 평가 기준은 교사에게 확인하세요.</li></ol></section>
    <section><h2>자료는 어디에 저장되나요?</h2><p>첨부 파일, 입력한 글, 분석 결과와 교사용 변경 이력은 현재 브라우저의 저장 공간에 남습니다. 다른 기기로 자동 동기화되지 않으며, 브라우저 데이터를 삭제하면 사라질 수 있습니다. 공용 컴퓨터에서는 다른 사용자가 자료를 다시 열 수 있으므로 사용 후 사이트 데이터를 지우세요.</p></section>
    <section><h2>외부 AI로 전송되는 내용</h2><p>분석과 수정 요청 시 입력한 글, PDF와 이미지 원본, 학습 목표, 분석 결과 중 해당 기능에 필요한 내용이 서비스 서버를 거쳐 OpenAI API로 전송됩니다. 참고 자료 검색 시 과제 제목과 선택한 활동 내용도 전송됩니다. 이 브라우저에 저장된다는 설명은 외부 전송이 없다는 뜻이 아닙니다.</p><p>새 API 요청에는 응답 저장을 끄는 설정을 사용합니다. 이 설정만으로 제공사의 모든 로그가 즉시 삭제되는 것은 아닙니다. 자세한 보관 정책은 <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">OpenAI 데이터 처리 안내 (새 창)</a>를 확인하세요.</p></section>
    <section><h2>넣기 전에 확인할 정보</h2><p>학생 이름, 학번, 연락처, 성적과 건강정보 등 과제 수행에 필요하지 않은 개인정보를 지우고 입력하세요. 업로드할 권한이 있는 자료인지 확인하세요. 개인정보를 자동으로 지워 주는 기능은 현재 없습니다.</p></section>
    <section><h2>삭제 범위와 한계</h2><p>상단의 ‘초기화’는 확인 후 이 브라우저의 학생용 자료, 교사용 과제와 원본 파일 및 변경 이력을 모두 지웁니다. 학생용의 ‘새 과제 시작’은 현재 학생용 자료와 안내만 초기화합니다. 교사용의 첨부 파일 삭제와 변경 이력 삭제는 별도입니다. 브라우저의 자료를 삭제해도 이미 내려받은 파일이나 외부 서비스에 전송된 자료까지 회수되지는 않습니다.</p></section>
    <section><h2>공개 운영 전에 확정할 사항</h2><p>이 페이지는 현재 구현을 설명하는 이용 안내입니다. 운영자와 개인정보 담당자 연락처, 처리 목적과 법적 근거, 보유기간, 국외이전 조건, 권리 행사 절차가 확정된 정식 개인정보처리방침과 이용약관을 대신하지 않습니다.</p></section>
    <Link className="button button--secondary" href="/">시작 화면으로 돌아가기</Link>
  </main></>;
}
