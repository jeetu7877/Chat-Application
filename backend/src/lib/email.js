const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = "jeet.allonline2005@gmail.com"; // ✅ wahi email jo verify kiya

export const sendOTPEmail = async (email, fullName, otp) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f0f1a; color: #fff; padding: 32px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #f97316; font-size: 28px; margin: 0;">💬 My Chat</h1>
      </div>
      <h2 style="color: #fff; font-size: 20px;">Hello, ${fullName}!</h2>
      <p style="color: rgba(255,255,255,0.6); font-size: 15px;">Your email verification code is:</p>
      <div style="background: rgba(249,115,22,0.15); border: 2px solid #f97316; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #f97316;">${otp}</span>
      </div>
      <p style="color: rgba(255,255,255,0.5); font-size: 13px; text-align: center;">
        This code expires in <strong style="color: #fff;">5 minutes</strong>.<br/>
        If you didn't request this, please ignore this email.
      </p>
    </div>
  `;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "My Chat App", email: SENDER_EMAIL },
      to: [{ email: email, name: fullName }],
      subject: "Verify Your Email — My Chat",
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Brevo API error:", errorData);
    throw new Error("Failed to send OTP email");
  }
};
