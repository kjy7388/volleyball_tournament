import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="not-found">
      <span className="eyebrow">OUT OF BOUNDS</span>
      <h1>404</h1>
      <h2>코트 밖으로 나왔네요.</h2>
      <p>요청한 페이지를 찾을 수 없습니다.</p>
      <Link className="button" to="/">
        홈으로 돌아가기
      </Link>
    </div>
  );
}
