const nodemailer = require('nodemailer');

// 이메일 전송 설정
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'kiwumitest@gmail.com', // 발신자 이메일
        pass: 'jaqqpouwkqpedehn'      // Gmail 앱 비밀번호
    }
});

const sendVerificationCode = async (to, code) => {
    const mailOptions = {
        from: '"키우미 시스템" <kiwumitest@gmail.com>',
        to: to,
        subject: '[키우미] 비밀번호 재설정 인증번호',
        html: `
            <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
                <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #003875; text-align: center; margin-bottom: 20px;">키우미 비밀번호 재설정</h2>
                    <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                        안녕하세요, 키우미입니다.<br>
                        비밀번호 재설정을 위한 인증번호를 안내해 드립니다.
                    </p>
                    <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                        <p style="color: #64748b; font-size: 14px; margin-bottom: 10px;">인증번호</p>
                        <h1 style="color: #ed2024; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h1>
                    </div>
                    <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin-top: 20px;">
                        본 인증번호는 발송 시점으로부터 <strong>10분간 유효</strong>합니다.<br>
                        본인이 요청하지 않은 경우, 이 이메일을 무시하셔도 됩니다.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                    <p style="color: #94a3b8; font-size: 11px; text-align: center;">
                        © 2025 키우미(KIWUMI). All rights reserved.
                    </p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('이메일 전송 성공:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('이메일 전송 실패:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendVerificationCode
};
