/*
 * 자폭 서비스워커 — **비상용 대기 파일**(2026-09-11 신설). 평소에는 아무 데서도 등록하지 않는다.
 *
 * 쓰는 때: 배포된 sw.js 가 사용자 브라우저를 망가뜨렸을 때(백지 화면, 옛 버전 고착 등).
 * 서비스워커는 한 번 잘못 나가면 방문자 기기에 눌러앉아 스스로 낫지 않으므로 되돌릴 길을 미리 둔다.
 *
 * 쓰는 법: 이 파일의 내용을 public/sw.js 에 **통째로 덮어쓰고 배포**한다.
 *   (등록 주소는 그대로 /sw.js 라, 브라우저가 갱신 확인 때 이 내용을 받아 실행한다)
 * 그러면 캐시를 전부 지우고 자기 등록을 해제한 뒤 열려 있는 탭을 새로고침한다.
 * 정상화된 뒤에 원래 sw.js 를 다시 배포하면 된다.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      } catch (e) {
        /* 캐시가 없으면 그냥 넘어간다 */
      }
      await self.registration.unregister()
      const wins = await self.clients.matchAll({ type: 'window' })
      wins.forEach((w) => {
        try {
          w.navigate(w.url)
        } catch (e) {
          /* 이동 못 해도 등록 해제는 끝났다 */
        }
      })
    })(),
  )
})
