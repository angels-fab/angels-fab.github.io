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
const SW_VERSION = '2026-09-11.1'

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
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 같은 tag 면 새 알림이 옛 알림을 덮어쓴다 — 서버가 멱등키를 tag 로 준다
    tag: data.tag || undefined,
    renotify: false,
    // 이동할 곳. HashRouter 라 해시까지 담는다
    data: { url: data.url || '/#/calendar', v: SW_VERSION },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/** 알림을 누르면 이미 열린 포털 탭을 살려 쓰고, 없으면 새로 연다 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/#/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        // 경로 비교는 origin 으로만 한다 — HashRouter 라 같은 탭에서 해시만 바꿔 이동시킬 수 있다
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus()
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
