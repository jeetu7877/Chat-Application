import jwt from "jsonwebtoken";

export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "none",     // ✅ cross-site (Netlify ↔ Render) allow karega
  secure: true,          // ✅ "none" ke saath secure HAMESHA true hona chahiye
});
  return token;
};
