\# 2026 AI·SW체험 수피아여고 포토부스 (웹 테스트 버전)



\## 실행

\- GitHub Pages: Settings → Pages → Branch `main` / `/ (root)`

\- 접속: `https://<사용자명>.github.io/<저장소명>/`

\- 로컬: `python -m http.server 8000` → `http://localhost:8000`

\- 관리자 설정(농도, 디더링, 파일 테스트): 주소 뒤에 `?admin=1` 추가



\## 요구 사항

\- Chrome 또는 Edge (WebUSB 지원)

\- HTTPS 또는 localhost에서만 카메라/WebUSB 동작

\- 프린터: Epson TM-m30III (USB)



\## 흐름

1\. 촬영하기 → 결과 모달에 영수증 미리보기

2\. 영수증 인쇄하기 → 프린터 선택 팝업에서 TM 프린터 선택

3\. 다시 촬영하기 → 카메라 화면으로 복귀

