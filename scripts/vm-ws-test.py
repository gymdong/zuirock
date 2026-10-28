"""학교 프록시가 WebSocket을 통과시키는지 보는 아주 작은 서버 (표준 라이브러리만, 설치 필요 없음).

VM에서: python3 scripts/vm-ws-test.py 3000          (포트는 VM 상세보기에 등록할 그 포트)
내 Mac에서: node scripts/ws-check.mjs wss://<VM 주소>   → 'WebSocket OK' 가 나오면 대결이 된다.
끝나면 Ctrl-C 로 끄고, 실제 서비스를 같은 포트로 띄운다.
"""
import base64
import hashlib
import socket
import struct
import sys
import threading

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def frame(text: str) -> bytes:
    data = text.encode()
    return bytes([0x81, len(data)]) + data if len(data) < 126 else bytes([0x81, 126]) + struct.pack(">H", len(data)) + data


def read_frame(conn):
    head = conn.recv(2)
    if len(head) < 2:
        return None, b""
    opcode, ln = head[0] & 0x0F, head[1] & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", conn.recv(2))[0]
    mask = conn.recv(4) if head[1] & 0x80 else b"\0\0\0\0"
    payload = b""
    while len(payload) < ln:
        chunk = conn.recv(ln - len(payload))
        if not chunk:
            break
        payload += chunk
    return opcode, bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def handle(conn):
    try:
        req = b""
        while b"\r\n\r\n" not in req:
            chunk = conn.recv(4096)
            if not chunk:
                return
            req += chunk
        headers = {k.strip().lower(): v.strip() for k, v in (l.split(":", 1) for l in req.decode(errors="replace").split("\r\n")[1:] if ":" in l)}
        key = headers.get("sec-websocket-key")
        if headers.get("upgrade", "").lower() != "websocket" or not key:
            body = b"http ok (this was a plain request, not a WebSocket upgrade)\n"
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % len(body) + body)
            return
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        conn.sendall(f"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n".encode())
        conn.sendall(frame("hello-from-vm"))
        while True:
            opcode, payload = read_frame(conn)
            if opcode is None or opcode == 8:
                break
            if opcode == 1:
                conn.sendall(frame(payload.decode(errors="replace")))
    except OSError:
        pass
    finally:
        conn.close()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", port))
    srv.listen(16)
    print(f"WebSocket 시험 서버가 0.0.0.0:{port} 에서 기다리는 중 (Ctrl-C 로 종료)")
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
