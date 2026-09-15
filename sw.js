/*
 * 서비스워커 — **웹푸시 수신 전용**(2026-09-11 신설).
 *
 * ★ fetch 핸들러를 절대 넣지 마라. 이 포털은 GitHub Pages 에 dist 를 통째로 갈아끼우는 방식이라
 *   배포 즉시 이전 해시 자산(/assets/index-OLDHASH.js)이 404 가 된다. 서비스워커가 index.html 을
 *   캐시해 두면 '캐시된 옛 index.html 이 이미 사라진 옛 JS 를 요청' → 백지 화면이 되고, 서비스워커는
 *   사용자 브라우저에 눌러앉아 스스로 낫지 않는다. 여기에 이미 응답 max-age=600(Pages 고정)이
 *   겹쳐 있어 '10분 지연'이 '무기한 고착'으로 바뀐다. 캐싱이 정말 필요해지면 별도 과제로 분리할 것.
 *
 * 사고 시 되돌리는 법: public/sw-kill.js 의 내용을 이 파일에 통째로 덮어써서 배포한다.
 * 그러면 방문자 브라우저에서 캐시 전삭제 + 자기 등록 해제까지 끝낸 뒤 새로고침된다.
 */

// 이 문자열이 바뀌면 브라우저가 파일이 달라졌다고 보고 새 워커로 갈아탄다.
// 내용을 고칠 때마다 날짜를 올릴 것.
const SW_VERSION = '2026-09-15.1'

// 정기 알림 '이번 달 확인'(개선메모 135 후속)을 기록할 곳. anon 키는 src/api/supabase.ts 와 같은 **공개** 키다
// (브라우저 번들에 이미 실려 있다). 기록은 서명 토큰이 맞을 때만 되므로 이 키만으로는 아무것도 못 쓴다.
const SUPABASE_URL = 'https://rmvutlhdcfkqubzrckqf.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtdnV0bGhkY2ZrcXVienJja3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjY4MTIsImV4cCI6MjA5ODY0MjgxMn0.D5wXLA2fqc_u9byPLOc6e_mMUKlZD6IdaEnxbU7iCk8'

/** 정기 알림 푸시면 url 에 확인 토큰(recurAck)이 실려 온다 — 없으면 null(출장 미리알림 등 기존 알림) */
function recurTokenOf(url) {
  try {
    const query = String(url || '').split('?')[1] || ''
    return new URLSearchParams(query).get('recurAck')
  } catch (e) {
    return null
  }
}

self.addEventListener('install', () => {
  // 대기 없이 바로 새 워커로 — 옛 워커가 남아 푸시를 나눠 받는 상태를 만들지 않는다
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * 푸시 수신. 서버는 {title, body, url, tag} 꼴의 JSON 을 보낸다.
 * 본문이 JSON 이 아니어도(다른 도구로 테스트 발송 등) 알림은 떠야 하므로 text 로 되받는다.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'ANGELS 포털'
  const token = recurTokenOf(data.url)
  // 정기 알림은 멱등키 'recur:{id}:{날짜}' 에서 날짜를 떼어 알림마다 tag 하나로 — 어제 알림을 오늘 것으로 바꾼다
  const tag = token && data.tag ? String(data.tag).replace(/^(recur:\d+):.*$/, '$1') : data.tag
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 같은 tag 면 새 알림이 옛 알림을 덮어쓴다 — 서버가 멱등키를 tag 로 준다
    tag: tag || undefined,
    // 바뀐 정기 알림은 소리를 다시 낸다(renotify 는 tag 가 있어야 한다). 그 밖은 종전대로 조용히 덮어쓴다
    renotify: !!(token && tag),
    // 알림 속 버튼 — 크롬 계열(안드로이드·PC)만 보인다. 아이폰·맥 사파리는 무시하고 눌러서 포털을 연다
    actions: token
      ? [
          { action: 'ack', title: '이번 달 확인' },
          { action: 'open', title: '열기' },
        ]
      : undefined,
    // 이동할 곳. HashRouter 라 해시까지 담는다
    data: { url: data.url || '/#/calendar', v: SW_VERSION },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * 정기 알림 '이번 달 확인' 기록 — 서버 함수가 서명을 확인하고 그 사람의 확인 기록을 쓴다.
 * 성공하면 열려 있는 포털 탭에 알려 새로고침 없이 띠를 내린다(RecurringNoticeBanner 가 듣는다).
 */
async function ackRecur(token) {
  // 3초 안에 답이 없으면 실패로 본다 — 브라우저는 알림을 누른 뒤 몇 초 동안만 창을 열게 허락하므로
  // 늦게 실패하면 아래 '포털 열기'로 넘어가도 창이 안 열린다
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3000)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/recur_notice_ack`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
      signal: ctrl.signal,
    })
    if (!res.ok) return false
    const ok = (await res.json()) === true
    if (ok) {
      // 누구의 확인인지(uid)도 함께 알린다 — 같은 브라우저에 다른 계정이 로그인해 있을 수 있다(구독은 로그아웃해도 남는다)
      const [nid, month, uid] = token.split('.')
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      wins.forEach((w) => w.postMessage({ type: 'recur-ack', key: `recurNotice.ack.${nid}`, month, uid }))
    }
    return ok
  } catch (e) {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** 알림을 누르면 이미 열린 포털 탭을 살려 쓰고, 없으면 새로 연다 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = (event.notification.data && event.notification.data.url) || '/#/'
  const token = recurTokenOf(raw)
  // 여는 주소에는 확인 토큰을 싣지 않는다 — 주소창·방문 기록에 남길 이유가 없고, 띠는 어느 페이지에서나 보인다
  const target = token ? '/#/' : raw
  event.waitUntil(
    (async () => {
      if (token && event.action === 'ack') {
        if (await ackRecur(token)) return
        // 기록에 실패하면(오프라인 등) 포털을 열어 띠에서 직접 누르게 한다
      }
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        // 경로 비교는 origin 으로만 한다 — HashRouter 라 같은 탭에서 해시만 바꿔 이동시킬 수 있다
        if (new URL(w.url).origin === self.location.origin) {
          try {
            await w.focus()
          } catch (e) {
            // 창을 앞으로 못 가져오면(허락 시간이 지났거나 창이 닫히는 중) 아래에서 새 창을 한 번 더 시도한다
            break
          }
          if ('navigate' in w) {
            try {
              await w.navigate(target)
            } catch (e) {
              /* 포커스는 됐으니 이동 실패는 넘어간다 */
            }
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

/**
 * 구독 만료 — 브라우저가 말없이 구독을 갈아끼울 때 온다.
 * 새 구독을 서버에 다시 올려야 하는데 여기서는 사용자 토큰이 없다.
 * 그래서 표시만 남기고, 다음 접속 때 앱이 읽어 재등록한다(usePush 가 확인).
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      wins.forEach((w) => w.postMessage({ type: 'push-subscription-change' }))
    })(),
  )
})
