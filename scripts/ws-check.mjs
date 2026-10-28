// 내 Mac(Node 22+)에서 학교 VM 의 WebSocket 통과 여부를 확인한다.
// 사용: node scripts/ws-check.mjs wss://<VM 주소>      (VM 에서는 scripts/vm-ws-test.py 를 켜 둔다)
const url = process.argv[2];
if (!url) {
  console.error('사용: node scripts/ws-check.mjs wss://<VM 주소>');
  process.exit(2);
}
const ws = new WebSocket(url);
const timer = setTimeout(() => {
  console.error('FAIL: 10초 안에 연결되지 않았어요 (프록시가 WebSocket 을 막았을 수 있어요)');
  process.exit(1);
}, 10_000);
ws.onerror = (e) => {
  console.error('FAIL: 연결 오류', e.message ?? '');
  process.exit(1);
};
let said = false;
ws.onmessage = (e) => {
  if (!said) {
    console.log('받음:', e.data);
    said = true;
    ws.send('ping');
  } else {
    console.log('에코:', e.data);
    clearTimeout(timer);
    console.log(e.data === 'ping' ? 'WebSocket OK — 대결(실시간)이 이 주소에서 동작할 수 있어요' : 'FAIL: 에코가 달라요');
    process.exit(e.data === 'ping' ? 0 : 1);
  }
};
