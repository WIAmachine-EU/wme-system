export default {
  // 큐(Queue)에서 이벤트가 들어올 때마다 실행되는 함수입니다.
  async queue(batch, env) {
    // ⚠️ 아래 주소를 사용자님의 실제 백엔드 주소로 반드시 변경하세요!
    const BACKEND_WEBHOOK_URL = "https://wme-system-backend.onrender.com/api/webhooks/r2-upload";

    for (const msg of batch.messages) {
      try {
        console.log("R2 이벤트 수신:", JSON.stringify(msg.body));

        // 백엔드로 POST 요청 보내기
        const response = await fetch(BACKEND_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(msg.body),
        });

        if (response.ok) {
          console.log("백엔드 전송 성공");
          msg.ack(); // 처리 완료된 메시지는 큐에서 삭제
        } else {
          console.error(`백엔드 전송 실패: ${response.status}`);
          msg.retry(); // 실패 시 나중에 재시도
        }
      } catch (error) {
        console.error("에러 발생:", error);
        msg.retry();
      }
    }
  },
};
