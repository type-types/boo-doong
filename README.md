## 부등부등 웹스터디 (채팅/공부방 데모)

간단한 공부방 생성·입장과 실시간 채팅, 개인 LLM 대화를 제공하는 데모 애플리케이션입니다.
백엔드는 Express 5 + Socket.IO, 프런트는 정적 HTML로 구성되어 있습니다.

### 주요 기능

- **공부방 관리**: 방 목록 조회, 방 생성(제목/정원/시간/옵션), 방 입장
- **실시간 채팅**: 참가자/방장 역할, 타이핑 표시, 시스템 메시지, 최근 50개 이력 로드
- **참가자 목록**: 방장/참가자 구분 표시, 인원 수 제한(기본 6명, 최대 12명)
- **LLM 개인 대화**: `/api/llm/chat`로 간단한 개인 챗. OpenAI 키 없으면 모의 응답

### 기술 스택

- Node.js, TypeScript
- Express 5, Socket.IO 4
- ts-node, nodemon

---

## 빠른 시작

### 요구사항

- Node.js 18 이상 권장

### 설치

```bash
# pnpm 권장
pnpm install

# (또는 npm)
npm install
```

### 환경 변수

프로젝트 루트에 `.env` 파일을 생성합니다.

```bash
# 서버 포트 (기본 4000)
PORT=4000

# 필수: OpenAI 연동용 API 키
OPENAI_API_KEY=sk-...
```

### 실행

```bash
# 개발 모드 (자동 재시작)
pnpm dev

# 또는
npm run dev
```

서버가 시작되면 다음 페이지로 접속합니다.

- 공부방 목록: `http://localhost:4000/rooms.html`
- 채팅 테스트: `http://localhost:4000/index.html`
  - 참고: 루트 경로(`/`)로 접속해도 `rooms.html`로 자동 이동합니다.

---

## 사용법

### 1) 닉네임 설정

- 상단 닉네임 영역 또는 다이얼로그에서 닉네임을 저장합니다. (로컬 저장)

### 2) 방 만들기/입장 (`rooms.html`)

- 방 개설 버튼으로 새 방을 만들 수 있습니다.
- 옵션: 최대 인원(2~12), 공부 시간(시:분), 학습 노트 사용, 비공개 여부
- 생성 후 목록에서 방에 입장 가능하며, 생성자는 자동으로 방장 역할로 입장합니다.

### 3) 채팅 (`index.html`)

- 쿼리 `?roomId=...`로 특정 방에 자동 입장합니다.
- 메시지 입력, 타이핑 표시, 시스템 입장/퇴장 메시지를 확인할 수 있습니다.

### 4) LLM 개인 대화

- 하단 LLM 영역에 질문을 입력하면 `/api/llm/chat`으로 요청합니다.
- `OPENAI_API_KEY`가 없으면 에러(400)와 함께 메시지(`OPENAI_API_KEY를 .env 파일에 설정하세요.`)를 반환합니다.

---

## REST API

### API 문서(Swagger)

- 현재 별도의 Swagger/OpenAPI UI 페이지는 제공되지 않습니다.
- 추후 도입 시 예시 경로: `/docs` 또는 `/api-docs` (팀 합의 후 반영 예정)

### GET `/api/rooms`

현재 서버에 존재하는 방 목록을 반환합니다.

응답 예시:

```json
{
  "items": [
    {
      "id": "room-xxxx",
      "title": "새 공부방",
      "maxMembers": 6,
      "hostPresent": true,
      "players": 2,
      "createdAt": 1710000000000,
      "studyStart": "09:00",
      "studyEnd": "10:00",
      "noteRequired": false,
      "isPrivate": false
    }
  ]
}
```

### POST `/api/rooms`

방을 생성합니다.

요청 바디:

```json
{
  "title": "문제풀이 스터디",
  "maxMembers": 6, // 2~12
  "studyStart": "09:00", // HH:MM (선택)
  "studyEnd": "10:00", // HH:MM (선택)
  "noteRequired": true, // 선택
  "isPrivate": false // 선택
}
```

응답: 생성된 방 메타데이터

예시(curl):

```bash
curl -X POST http://localhost:4000/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"알고리즘 스터디",
    "maxMembers":6,
    "studyStart":"20:00",
    "studyEnd":"21:00",
    "noteRequired":true,
    "isPrivate":false
  }'
```

### POST `/api/llm/chat`

개인 LLM 대화 API입니다. `OPENAI_API_KEY`가 설정되어 있으면 OpenAI(`gpt-4o-mini`)에 프록시 요청을 하고, 없으면 에러(400)를 반환합니다.

요청 바디(둘 중 하나):

```json
{ "message": "정규표현식에서 그룹은 뭐야?" }
```

```json
{
  "messages": [
    { "role": "user", "content": "안녕" },
    { "role": "assistant", "content": "안녕하세요!" },
    { "role": "user", "content": "요약해줘" }
  ]
}
```

응답 예시(키 없음):

```json
{
  "error": "missing_openai_api_key",
  "message": "OPENAI_API_KEY를 .env 파일에 설정하세요."
}
```

---

## WebSocket 이벤트 (Socket.IO)

네임스페이스: 기본(`/`)

- `join` (클라이언트 → 서버)

  - payload: `{ roomId, nickname, role }` (`role`: `host` | `player`)
  - 에러 시 `error_msg` 이벤트로 사유 반환

- `joined` (서버 → 클라이언트)

  - `{ ok, roomId, nickname, role }`

- `participants` (서버 → 클라이언트)

  - `{ participants: Array<{ socketId, nickname, role }> }`

- `chat_send` (클라이언트 → 서버)

  - payload: `{ roomId, text }` (미입력/공백은 무시, 최대 2000자)

- `chat` (서버 → 클라이언트)

  - 실시간 메시지 단건 브로드캐스트

- `chat_history` (서버 → 클라이언트)

  - 최근 50개 메시지 전달

- `typing` / `typing_state`

  - 입력 상태 토글/브로드캐스트

- `leave` (클라이언트 → 서버)
  - 방 나가기 처리 및 정리

메모:

- 방 메시지는 최대 500개까지 서버 메모리에 보관하고, 초과 시 최근 500개만 유지합니다.
- 방에 호스트가 없고 참가자 수가 0명이면 서버는 방을 정리합니다.

---

## 프로젝트 구조

```text
public/
  index.html     # 방 내 채팅 + LLM 개인 대화 UI
  rooms.html     # 방 목록/생성/입장 UI
src/
  server.ts      # Express + Socket.IO 서버, REST/WS/LLM API
  static.ts      # (예비) 정적 자원 마운트 유틸
package.json     # 스크립트/의존성 (type: commonjs)
tsconfig.json    # TS 컴파일 옵션
```

### 스크립트

```json
{
  "dev": "nodemon --watch src --ext ts --exec ts-node src/server.ts"
}
```

---

## 운영/배포 참고

- 데모 목적의 간단 서버입니다. 프로덕션에서는 빌드 후 실행 또는 런타임 트랜스파일 의존 최소화를 권장합니다.
- CORS는 `*`로 개방되어 있습니다. 필요한 경우 제한을 적용하세요.

---

## SRS (기술 명세)

### 용어 정의

- **스터디룸**: 사용자가 공부를 위해 모이는 가상 공간. 채팅, 음성(WebRTC), 타이머, 학습노트 기능 제공
- **방장**: 스터디룸 개설자. 룸 설정(공개/비공개, 시간, 인원, 레벨 허들 등) 관리
- **레벨 허들**: 특정 레벨 이상만 참여 가능한 조건부 스터디룸
- **전체 채팅**: 모든 참가자 공용 채팅
- **개인 채팅**: 개인 전용 LLM 상호작용 채팅. 전체 채팅 내용 기반 개인화 질의/퀴즈
- **타이머**: 공부 시간 관리 및 세션 기록
- **학습노트**: 종료 후 LLM이 생성하는 요약 문서
- **퀴즈**: 학습노트/대화 기반 LLM 자동 생성 문제
- **결산창**: 종료 후 요약·학습 시간·기여도 표시 화면
- **기여도**: 채팅/참여 활동량 지표
- **Exp/레벨**: 공부 시간·활동에 따른 점수/단계
- **마이페이지**: 개인 학습 데이터(노트, Exp/레벨, 퀴즈 결과) 확인 공간

### 기능적 요구사항

- (FR-01) 로그인/로그아웃(소셜 포함)
- (FR-02) 본인 프로필 조회(방 목록 화면)
- (FR-03) 특정 유저 프로필 조회(방 내부)
- (FR-04) 스터디룸 생성(시간/노트/공개·비공개·비밀번호/레벨 허들)
- (FR-05) 스터디룸 참여
- (FR-06) 채팅/음성(WebRTC)
- (FR-07) LLM 기능: 전체 채팅 기반 개인 질문/퀴즈
- (FR-08) 종료 시 요약 생성(LLM)
- (FR-09) 요약 저장(참여자 마이페이지)
- (FR-10) 결산창: 공부 시간·요약·기여도
- (FR-11) 마이페이지: Exp/학습노트 목록
- (FR-12) 학습노트 기반 자동 퀴즈 생성(LLM)

#### 기능 명세서

| 번호 | 분류             | 기능ID | 기능 명          | 기능 설명                                     |
| ---- | ---------------- | ------ | ---------------- | --------------------------------------------- |
| 1    | 회원가입/로그인  | FR-01  | 로그인/로그아웃  | 계정 생성 및 로그인/로그아웃, 소셜 로그인     |
| 2    | 프로필 조회      | FR-02  | 본인 프로필 조회 | 방 목록 페이지에서 본인 정보 조회             |
| 3    | 프로필 조회      | FR-03  | 유저 프로필 조회 | 방 내부에서 특정 유저 정보 조회               |
| 4    | 스터디룸 관리    | FR-04  | 스터디룸 생성    | 시간/노트/공개·비공개·비밀번호/레벨 허들 설정 |
| 5    | 스터디룸 관리    | FR-05  | 스터디룸 참여    | 기존 스터디룸 참여                            |
| 6    | 스터디룸 내 기능 | FR-06  | 채팅/음성 기능   | 전체/개인 채팅, 음성(WebRTC)                  |
| 7    | 스터디룸 내 기능 | FR-07  | LLM 기능         | 전체 채팅 기반 개인 퀴즈/QA                   |
| 8    | 스터디룸 종료    | FR-08  | 요약 생성        | 종료 시 LLM 요약본 생성                       |
| 9    | 스터디룸 종료    | FR-09  | 요약 저장        | 참여자 마이페이지에 저장                      |
| 10   | 스터디룸 종료    | FR-10  | 결산창 생성      | 공부 시간/요약/기여도 표시                    |
| 11   | 마이페이지       | FR-11  | 학습 기록/경험치 | Exp 및 학습노트 목록 확인                     |
| 12   | 마이페이지       | FR-12  | 자동 퀴즈 생성   | 학습노트 기반 퀴즈 생성                       |

### 비기능 요구사항(NFR)

- (NFR-01) 동시 접속 100명(1방 5명 기준 20방 동시)
- (NFR-02) 채팅 지연 200ms 이하
- (NFR-03) WebRTC 지연 1초 이하 목표
- (NFR-04) 반응형 웹: PC/모바일 브라우저 지원

현재 데모는 반응형 CSS를 포함하며 모바일에서도 사용 가능합니다.

### 시스템 아키텍처 개요

- 프런트엔드: React 기반 SPA(목표), WebRTC 클라이언트, Socket.IO 클라이언트, 학습노트 UI
- 백엔드: Node.js + Express, Socket.IO 서버, WebRTC 시그널링, LLM 연동 모듈
- 데이터베이스: 사용자/룸/학습노트/퀴즈/경험치·매너온도 저장

본 레포는 최소 가동 데모로 다음을 포함합니다:

- 정적 HTML(`public/rooms.html`, `public/index.html`)
- Express + Socket.IO 서버(`src/server.ts`)
- LLM 모의/프록시 API(`/api/llm/chat`)

### 데이터 모델(초안)

- User: `id`, `email`, `password`, `nickname`, `exp`, `manner_score`
- StudyRoom: `room_id`, `host_id`, `room_name`, `options`, `participant_list`, `password`
- StudyNote: `id`, `user_id`, `room_id`, `content`, `likes`, `comment`

### 역할 분담(예시 8포지션)

1. 기획자/PM: 요구사항·일정·우선순위·QA 시나리오
2. 디자이너(UI/UX): 화면/인터랙션, 반응형, 애니메이션(Rive)
3. 프론트(뼈대): SPA 구조/라우팅/상태관리
4. 백엔드(DB): 스키마/마이그레이션/ORM
5. 백엔드(API): 명세 기반 API 구현
6. 연동 담당(Integration): 프론트-백 오케스트레이션
7. 운영/배포(DevOps): CI/CD, 모니터링, 로깅, 보안
8. QA: 기능/부하/AI 품질 테스트

### LLM Pipeline 디자인(개요)

- 모델 전략: 빠른 모델 vs 고품질 모델 분리
- 파이프라인: 입력 → 전처리 → LLM 호출 → 후처리 → 저장
- 프롬프트/컨텍스트: few-shot, RAG 여부, 최근 대화 컨텍스트 길이 관리
- 캐시/비용 최적화, 레이트리밋, 모니터링(성능·안전)

### Gamification 디자인(개요)

- 행동별 점수 책정, 레벨 곡선 설계
- 보상 시점/종류 설계(배지, 보너스 Exp 등)
- 경쟁(리더보드)과 협력(팀 챌린지) 균형

### 현재 구현 범위 vs 로드맵

- 현재(이 레포): FR-04(기본 방 생성), FR-05, FR-06(채팅), FR-07(개인 LLM—모의/프록시), 반응형 UI 일부
- 예정: FR-01(로그인/소셜), FR-02/03(프로필), FR-06(음성 WebRTC), FR-08~10(요약/저장/결산창), FR-11~12(마이페이지/퀴즈), DB 영속화, 서버 성능 최적화(NFR 충족)

## 라이선스

- ISC (패키지 메타데이터 참고)
