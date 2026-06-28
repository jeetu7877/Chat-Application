import express from "express";
import upload from "../middleware/upload.middleware.js";
import { protectRoute } from "../middleware/auth.middleware.js"; // ✅ अपने प्रोजेक्ट के ऑथ मिडलवेयर पाथ के अनुसार देखें
import {
  uploadImage,
  uploadVideo,
  getMyGallery,
  deleteMedia,
  toggleFavorite,
  getFavorites,
  getAlbums,
} from "../controllers/media.controller.js";

const router = express.Router();

// 1. फोटो अपलोड एंडपॉइंट (एक बार में 1 इमेज 'file' की नाम से आएगी)
router.post("/upload", protectRoute, upload.single("file"), uploadImage);

// 2. वीडियो अपलोड एंडपॉइंट (एक बार में 1 वीडियो 'file' की नाम से आएगी)
router.post("/upload-video", protectRoute, upload.single("file"), uploadVideo);

// 3. यूजर की पूरी गैलरी गेट करने के लिए
router.get("/my-gallery", protectRoute, getMyGallery);

// 4. मीडिया डिलीट करने के लिए
router.delete("/:id", protectRoute, deleteMedia);

// 5. फेवरेट स्टेटस टॉगल (On/Off) करने के लिए
router.put("/favorite/:id", protectRoute, toggleFavorite);

// 6. केवल फेवरेट मीडिया लिस्ट गेट करने के लिए
router.get("/favorites", protectRoute, getFavorites);

// 7. ऑटोमैटिक एलबम्स डेटा (Photos, Videos, Recent) गेट करने के लिए
router.get("/albums", protectRoute, getAlbums);

export default router;
